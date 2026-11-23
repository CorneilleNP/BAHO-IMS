"""Import a CWS "CHERRY RECEIVED" sheet (CSV export) as farmers + cherry GRNs.

Port of legacy/excel_migration/migrate_cherry_receipts.py, which generated SQL.
This version writes through the real services (`register_farmer`,
`create_cherry_receipt`), so farmer codes and GRN numbers come from
`next_sequence`, crop years from `crop_year_for`, and facility access and line
validation are the same as in the app.

Sheet layout (same as the legacy script): one station and season per sheet,
4 header rows, then one GRN per row with these columns, by position:

    A Date          B Farmer name   C Phone        D Email       E Sector
    F Cell          G Village       H GRN (sheet)  I Good qty    J Good price
    K Good transport L Good commission M Float qty N Float price  O Float transport
    P Float commission Q Total qty   R Total amount S Paid        T Not paid

Rules (kept from the legacy script unless noted):
- Rows without a farmer name are ignored (blank / total lines).
- Farmers are matched per station by normalised name + phone (the legacy
  de-duplication key); otherwise registered at the station. New: existing
  farmers of the station are matched too, and phones are compared on their
  last 9 digits (Excel drops the leading 0 of 07xx numbers).
- The GRN number is a new app number; the sheet's GRN, the sector/cell/village
  as written and the source file/row are kept in the receipt notes.
- Paid with nothing "not paid" -> PAID (cash). Partly paid -> UNPAID + warning
  (the app has no partial status). The legacy cherry_payments rows are not created:
  the app has no payment-record table.
- Dates: Excel serial numbers, d/m/Y, d-m-Y, d.m.Y and Y-m-d. Future dates are refused.
- Every imported row is recorded in CherryReceiptImport with a content key, so
  re-running skips rows already imported.
"""

import csv
import hashlib
import io
import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.db import transaction
from rest_framework.exceptions import APIException

from baho.core.dates import crop_year_for
from baho.core.permissions import ensure_facility_access
from baho.farmers.models import Farmer
from baho.farmers.services import register_farmer
from baho.organization.models import AdminUnit, Facility
from baho.reception.models import CherryReceipt, CherryReceiptLine
from baho.reception.services import create_cherry_receipt

from .models import CherryReceiptImport

HEADER_ROWS = 4
EXCEL_EPOCH = date(1899, 12, 30)
EMPTY = {"", "-", "N/A", "NA", "#N/A", "NONE"}
FIELDS = (
    "date", "name", "phone", "email", "sector", "cell", "village", "grn",
    "good_qty", "good_price", "good_transport", "good_commission",
    "float_qty", "float_price", "float_transport", "float_commission",
    "total_qty", "total_amount", "paid", "not_paid",
)  # fmt: skip
EXPECTED_COLUMNS = (
    "Date", "Farmer name", "Phone", "Email", "Sector", "Cell", "Village", "GRN",
    "Good cherry qty (kg)", "Good price/kg", "Good transport", "Good commission",
    "Float cherry qty (kg)", "Float price/kg", "Float transport", "Float commission",
    "Total qty (kg)", "Total amount", "Paid", "Not paid",
)  # fmt: skip
DATE_FORMATS = ("%d/%m/%Y", "%d/%m/%y", "%d-%m-%Y", "%d.%m.%Y", "%Y-%m-%d", "%Y-%m-%d %H:%M:%S")


class DryRun(Exception):
    """Raised to roll the transaction back after a dry run."""


class RowError(Exception):
    """A sheet row that cannot be imported; the import carries on."""


@dataclass
class CherryImportReport:
    source: str = ""
    station: str = ""
    committed: bool = False
    rows_read: int = 0
    skipped_empty: int = 0
    already_imported: int = 0
    created: int = 0
    farmers_created: int = 0
    farmers_matched: int = 0
    good_kg: Decimal = Decimal("0")
    float_kg: Decimal = Decimal("0")
    errors: list = field(default_factory=list)  # [(sheet row, reason)]
    warnings: list = field(default_factory=list)  # [(sheet row, message)]

    def as_dict(self) -> dict:
        return {
            "source": self.source,
            "station": self.station,
            "committed": self.committed,
            "rows_read": self.rows_read,
            "skipped_empty": self.skipped_empty,
            "already_imported": self.already_imported,
            "created": self.created,
            "farmers_created": self.farmers_created,
            "farmers_matched": self.farmers_matched,
            "good_kg": str(self.good_kg),
            "float_kg": str(self.float_kg),
            "errors": [{"row": r, "reason": m} for r, m in self.errors],
            "warnings": [{"row": r, "message": m} for r, m in self.warnings],
        }


# --- cell parsing ---------------------------------------------------------


def _text(value) -> str:
    value = re.sub(r"\s+", " ", str(value or "")).strip()
    return "" if value.upper() in EMPTY else value


def _amount(value, label: str):
    """Decimal or None for blank; RowError when unreadable or negative."""
    text = _text(value).replace(",", "").replace(" ", "")
    if not text:
        return None
    try:
        number = Decimal(text).quantize(Decimal("0.01"))
    except InvalidOperation:
        raise RowError(f"{label} is not a number ({value!r})") from None
    if number < 0:
        raise RowError(f"{label} is negative ({value!r})")
    return number


def _date(value):
    text = _text(value)
    if not text:
        return None
    if re.fullmatch(r"\d{5}(\.\d+)?", text):  # Excel serial date, e.g. 45231
        return EXCEL_EPOCH + timedelta(days=int(float(text)))
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def _digits(phone) -> str:
    text = _text(phone)
    if re.fullmatch(r"\d+\.0+", text):  # Excel turned it into a float
        text = text.split(".")[0]
    return re.sub(r"\D", "", text)


def _clean_phone(phone) -> str:
    digits = _digits(phone)
    if len(digits) == 9 and digits.startswith("7"):  # leading 0 lost by Excel
        return "0" + digits
    return digits or _text(phone)


def name_key(name) -> str:
    return _text(name).upper()


def phone_key(phone) -> str:
    digits = _digits(phone)
    return digits[-9:] if len(digits) >= 9 else digits


def _is_paid(value) -> bool:
    text = _text(value).upper()
    if text in {"", "0", "0.00", "NO", "N", "FALSE"}:
        return False
    try:
        return Decimal(text.replace(",", "")) > 0
    except InvalidOperation:
        return True  # "Yes", "x", "PAID"…


# --- reading ----------------------------------------------------------------


def read_rows(source, *, header_rows: int = HEADER_ROWS):
    """Yield (sheet row number, {field: raw text}) from a CSV path or bytes."""
    if isinstance(source, (str, Path)):
        path = Path(source)
        if path.suffix.lower() in {".xlsx", ".xlsm", ".xls"}:
            raise ValueError(
                "Excel files are not supported here: open the workbook, select the "
                "'CHERRY RECEIVED' sheet and save it as CSV, then import the CSV."
            )
        raw = path.read_bytes()
    else:
        raw = bytes(source)
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1252", errors="replace")  # Excel "CSV" on Windows
    for line_no, cells in enumerate(csv.reader(io.StringIO(text)), start=1):
        if line_no <= header_rows:
            continue
        cells = (list(cells) + [""] * len(FIELDS))[: len(FIELDS)]
        yield line_no, dict(zip(FIELDS, cells, strict=True))


# --- import -------------------------------------------------------------------


def _station(code: str, user) -> Facility:
    station = Facility.objects.filter(code__iexact=(code or "").strip()).first()
    if station is None:
        raise ValueError(f"Unknown station code {code!r}.")
    if station.facility_type != Facility.FacilityType.CWS:
        raise ValueError(f"{station} is not a washing station (CWS).")
    if not station.is_active:
        raise ValueError(f"{station} is inactive.")
    if user is None:
        raise ValueError("A user is required (recorded as creator of the farmers and GRNs).")
    try:
        ensure_facility_access(user, station)
    except APIException as exc:
        raise ValueError(str(exc.detail)) from exc
    return station


def _district(station: Facility):
    unit = station.location
    while unit is not None and unit.level != AdminUnit.Level.DISTRICT:
        unit = unit.parent
    return unit


class _Locations:
    """Sector / Cell / Village names -> the most precise AdminUnit that matches uniquely."""

    def __init__(self, station):
        self.district = _district(station)
        self.cache = {}

    def find(self, sector: str, cell: str, village: str):
        key = (sector.upper(), cell.upper(), village.upper())
        if key not in self.cache:
            self.cache[key] = self._find(sector, cell, village)
        return self.cache[key]

    def _find(self, sector, cell, village):
        if not sector:
            return None
        L = AdminUnit.Level  # noqa: N806
        attempts = []
        if cell and village:
            village_lookup = {
                "name__iexact": village,
                "parent__name__iexact": cell,
                "parent__parent__name__iexact": sector,
            }
            attempts.append((L.VILLAGE, village_lookup, "parent__parent__parent"))
        if cell:
            attempts.append(
                (L.CELL, {"name__iexact": cell, "parent__name__iexact": sector}, "parent__parent")
            )
        attempts.append((L.SECTOR, {"name__iexact": sector}, "parent"))
        for level, lookup, district_path in attempts:
            units = AdminUnit.objects.filter(level=level, **lookup)
            if self.district is not None:
                units = units.filter(**{district_path: self.district})
            units = list(units[:2])
            if len(units) == 1:
                return units[0]
        return None


def _row_key(station, row: dict, occurrence: int) -> str:
    parts = [
        station.code,
        row["received_on"].isoformat(),
        row["name_key"],
        row["phone_key"],
        row["grn"].upper(),
        str(row["good_qty"] or 0),
        str(row["float_qty"] or 0),
        str(occurrence),
    ]
    return hashlib.sha256("|".join(parts).encode()).hexdigest()


def _parse(line_no: int, raw: dict) -> dict:
    received_on = _date(raw["date"])
    if received_on is None:
        raise RowError(f"date missing or unreadable ({raw['date']!r})")
    if received_on > date.today():
        raise RowError(f"date {received_on:%d/%m/%Y} is in the future")
    row = {
        "line": line_no,
        "received_on": received_on,
        "name": _text(raw["name"]),
        "name_key": name_key(raw["name"]),
        "phone": _clean_phone(raw["phone"]),
        "phone_key": phone_key(raw["phone"]),
        "email": _text(raw["email"]),
        "sector": _text(raw["sector"]),
        "cell": _text(raw["cell"]),
        "village": _text(raw["village"]),
        "grn": _text(raw["grn"]),
        "paid": _is_paid(raw["paid"]),
        "not_paid": _is_paid(raw["not_paid"]),
        "paid_raw": _text(raw["paid"]),
        "not_paid_raw": _text(raw["not_paid"]),
    }
    for grade in ("good", "float"):
        for part in ("qty", "price", "transport", "commission"):
            row[f"{grade}_{part}"] = _amount(raw[f"{grade}_{part}"], f"{grade.title()} {part}")
    row["total_qty"] = _amount(raw["total_qty"], "Total qty")
    if not (row["good_qty"] or row["float_qty"]):
        raise RowError("no Good or Float cherry quantity")
    return row


def _lines(row: dict, warn) -> list:
    lines = []
    grades = (("good", CherryReceiptLine.Grade.GOOD), ("float", CherryReceiptLine.Grade.FLOAT))
    for grade, code in grades:
        qty = row[f"{grade}_qty"]
        if not qty:
            continue
        if row[f"{grade}_price"] is None:
            warn(f"{grade} cherry price blank, 0 used")
        lines.append(
            {
                "cherry_grade": code,
                "quantity_kg": qty,
                "price_per_kg": row[f"{grade}_price"] or Decimal("0"),
                "transport_cost": row[f"{grade}_transport"] or Decimal("0"),
                "commission": row[f"{grade}_commission"] or Decimal("0"),
            }
        )
    return lines


def import_cherry_receipts(
    source,
    *,
    station_code: str,
    user,
    commit: bool = False,
    source_name: str = "",
    header_rows: int = HEADER_ROWS,
) -> CherryImportReport:
    """Dry run by default (everything is done, then rolled back); `commit=True` saves.

    Raises ValueError for problems with the whole file (unknown station, no access,
    not a CSV). Problems with single rows end up in `report.errors`.
    """
    station = _station(station_code, user)
    source_name = source_name or (Path(source).name if isinstance(source, (str, Path)) else "")
    report = CherryImportReport(source=source_name, station=station.code, committed=commit)
    rows = list(read_rows(source, header_rows=header_rows))
    report.rows_read = len(rows)

    parsed = []
    occurrences = Counter()
    for line_no, raw in rows:
        if not _text(raw["name"]):
            has_data = _text(raw["good_qty"]) or _text(raw["float_qty"])
            if has_data:
                report.errors.append((line_no, "farmer name missing"))
            else:
                report.skipped_empty += 1
            continue
        try:
            row = _parse(line_no, raw)
        except RowError as exc:
            report.errors.append((line_no, str(exc)))
            continue
        same_content = _row_key(station, row, 0)
        occurrences[same_content] += 1
        row["key"] = _row_key(station, row, occurrences[same_content])
        parsed.append(row)

    # Number GRNs in reception order (then sheet order), as they would have been on the day.
    parsed.sort(key=lambda r: (r["received_on"], r["line"]))
    already = set(
        CherryReceiptImport.objects.filter(import_key__in=[r["key"] for r in parsed]).values_list(
            "import_key", flat=True
        )
    )
    previous_grns = {}
    for rec in (
        CherryReceiptImport.objects.filter(station=station)
        .exclude(source_grn="")
        .select_related("receipt")
    ):
        previous_grns.setdefault((rec.receipt.crop_year_id, rec.source_grn.upper()), rec)

    run = _Run(station, user, report, source_name, previous_grns, _Locations(station))
    for farmer in Farmer.objects.filter(home_facility=station).order_by("created_at"):
        run.farmers.setdefault((name_key(farmer.full_name), phone_key(farmer.phone)), farmer)
        run.names.setdefault(name_key(farmer.full_name), farmer)

    try:
        with transaction.atomic():
            for row in parsed:
                line = row["line"]
                if row["key"] in already:
                    report.already_imported += 1
                    continue
                try:
                    with transaction.atomic():
                        _import_row(run, row)
                except RowError as exc:
                    report.errors.append((line, str(exc)))
                except APIException as exc:  # service validation / access
                    report.errors.append((line, _detail(exc.detail)))
            if not commit:
                raise DryRun
    except DryRun:
        pass
    report.errors.sort()
    report.warnings.sort()
    return report


def _detail(detail) -> str:
    if isinstance(detail, dict):
        return "; ".join(f"{k}: {_detail(v)}" for k, v in detail.items())
    if isinstance(detail, list):
        return " ".join(_detail(v) for v in detail)
    return str(detail)


@dataclass
class _Run:
    """State shared by the rows of one import."""

    station: Facility
    user: object
    report: CherryImportReport
    source_name: str
    previous_grns: dict  # (crop year id, sheet GRN) -> CherryReceiptImport of earlier runs
    locations: _Locations
    farmers: dict = field(default_factory=dict)  # (name key, phone key) -> Farmer
    names: dict = field(default_factory=dict)  # name key -> first Farmer with that name
    grns_in_file: dict = field(default_factory=dict)  # (crop year id, sheet GRN) -> row


def _import_row(run: _Run, row: dict) -> None:
    station, user, report, source_name = run.station, run.user, run.report, run.source_name
    farmers, names, grns_in_file = run.farmers, run.names, run.grns_in_file
    line = row["line"]
    warnings = []

    def warn(message):
        warnings.append((line, message))

    crop_year = crop_year_for(row["received_on"])
    grn = row["grn"]
    if grn:
        earlier = run.previous_grns.get((crop_year.pk, grn.upper()))
        if earlier is not None:
            raise RowError(
                f"sheet GRN {grn} of crop year {crop_year.label} was already imported "
                f"({earlier.receipt.grn_number}, {earlier.source_file} row {earlier.source_row}) "
                "with different values; correct that GRN in the app instead"
            )
        if (crop_year.pk, grn.upper()) in grns_in_file:
            warn(f"sheet GRN {grn} also used on row {grns_in_file[crop_year.pk, grn.upper()]}")
        grns_in_file.setdefault((crop_year.pk, grn.upper()), line)
    else:
        warn("no GRN in the sheet")

    total = (row["good_qty"] or 0) + (row["float_qty"] or 0)
    if row["total_qty"] is not None and abs(row["total_qty"] - total) > Decimal("0.5"):
        warn(f"sheet total {row['total_qty']} kg differs from good + float ({total} kg)")

    if row["paid"] and not row["not_paid"]:
        status, method = CherryReceipt.PaymentStatus.PAID, CherryReceipt.PaymentMethod.CASH
    else:
        status, method = CherryReceipt.PaymentStatus.UNPAID, ""
        if row["paid"]:
            warn("partly paid in the sheet, recorded as unpaid (amounts kept in notes)")

    lines = _lines(row, warn)
    farmer_key = (row["name_key"], row["phone_key"])
    farmer = farmers.get(farmer_key)
    new_farmer = farmer is None
    if new_farmer:
        if row["name_key"] in names:
            other = names[row["name_key"]].farmer_code
            warn(f"{row['name']}: same name as {other} with another phone, registered as new")
        location = run.locations.find(row["sector"], row["cell"], row["village"])
        if location is None and (row["sector"] or row["cell"] or row["village"]):
            warn("sector/cell/village not found in the location list (kept in notes)")
        farmer = register_farmer(
            user=user,
            home_facility=station,
            full_name=row["name"],
            phone=row["phone"],
            location=location,
        )

    notes = [
        f"Imported from {source_name or 'Excel'} row {line}.",
        f"Original GRN: {grn or '-'}.",
        "Sector/Cell/Village: " + "/".join(row[k] or "-" for k in ("sector", "cell", "village")),
    ]
    if row["email"]:
        notes.append(f"Email: {row['email']}.")
    if row["paid_raw"] or row["not_paid_raw"]:
        notes.append(f"Paid: {row['paid_raw'] or '-'}; not paid: {row['not_paid_raw'] or '-'}.")
    receipt = create_cherry_receipt(
        user=user,
        facility=station,
        farmer=farmer,
        received_on=row["received_on"],
        lines=lines,
        payment_method=method,
        payment_status=status,
        notes=" ".join(notes),
        notify_farmer=False,  # old deliveries: never text farmers about them
    )
    CherryReceiptImport.objects.create(
        import_key=row["key"],
        station=station,
        receipt=receipt,
        source_file=source_name[:255],
        source_row=line,
        source_grn=grn[:40],
        imported_by=user,
    )

    # Only count once the row is saved (a RowError above rolls everything back).
    if new_farmer:
        farmers[farmer_key] = farmer
        names.setdefault(row["name_key"], farmer)
        report.farmers_created += 1
    else:
        report.farmers_matched += 1
    report.created += 1
    report.good_kg += row["good_qty"] or 0
    report.float_kg += row["float_qty"] or 0
    report.warnings.extend(warnings)

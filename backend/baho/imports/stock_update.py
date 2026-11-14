"""Import the "BAHO STOCK UPDATE" sheet (CSV export) into HQ stock receipts.

Rules agreed with operations (Nov 2026):
- NGORORERO is a Baho CWS whatever the Origin column says.
- Any other source under origin BAHO is a Baho CWS (created if missing);
  PARTNER / UBUNTU / AGRINOS rows are partner suppliers (created if missing).
  "KAYENZI" (origin AGRINOS) is recorded under supplier "AGRINOS LTD".
- Process labels resolve through the process catalogue: one of the 5 processes,
  a known sub-process / alias, or a new *unassigned* sub-process to be sorted
  on the Processes screen.
- Grade typos FLOOT -> FLOAT, HHPC -> HPC.
- Quality "Accepted" -> ACCEPTED, blank -> PENDING.
- "Completed" rows have no processed quantity in the sheet: they get an opening
  stock adjustment of minus their pure weight, so their balance is 0.
- Every receipt keeps its sheet row number; re-running skips rows already imported.
"""

import csv
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.db import transaction

from baho.drymill.models import HqStockReceipt, OriginType, Supplier
from baho.drymill.services import adjust_stock, create_stock_receipt
from baho.organization.models import Facility
from baho.processing.catalog import resolve_process_label
from baho.processing.models import SubProcess

ALWAYS_BAHO = {"NGORORERO"}
SUPPLIER_ALIASES = {"KAYENZI": "AGRINOS LTD"}
GRADE_FIXES = {"FLOOT": "FLOAT", "HHPC": "HPC"}
EMPTY = {"", "-", "N/A", "NA", "#N/A"}

COLUMNS = {
    "date": "Arrival Date",
    "origin": "Origin (Baho/Partners)",
    "source": "Source (Supplier/CWS name)",
    "type": "Type (Parch/Green)",
    "dn_qty": "Delivery note Quantity (Kg)",
    "process": "Process",
    "grade": "Grades",
    "dn_no": "Delivery note No",
    "weighing": "Weighing status",
    "contract": "Purchase contract number",
    "net": "Net-weight (Kg)",
    "wrn": "WRN Number",
    "cell": "Warehouse Cell Number",
    "card": "Stock Card number",
    "bags": "Weight of bags (Kg)",
    "pure": "Pure Weight (Kg)",
    "quality": "Quality Status",
    "processing": "Processing Status",
}


class DryRun(Exception):
    """Raised to roll the transaction back after a dry run."""


@dataclass
class ImportReport:
    rows_in_file: int = 0
    created: int = 0
    already_imported: int = 0
    skipped_empty: int = 0
    errors: dict = field(default_factory=lambda: defaultdict(list))
    warnings: dict = field(default_factory=lambda: defaultdict(list))
    new_stations: list = field(default_factory=list)
    new_suppliers: list = field(default_factory=list)
    file_totals: Counter = field(default_factory=Counter)
    imported_totals: Counter = field(default_factory=Counter)
    opening_adjustments: int = 0

    def warn(self, kind, row):
        self.warnings[kind].append(row)

    def error(self, kind, row):
        self.errors[kind].append(row)


def _text(value) -> str:
    value = (value or "").strip()
    return "" if value.upper() in EMPTY else value


def _decimal(value):
    value = (value or "").replace(",", "").strip()
    if value.upper() in EMPTY:
        return None
    try:
        return Decimal(value).quantize(Decimal("0.01"))
    except InvalidOperation:
        return "invalid"


def _date(value):
    value = (value or "").strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%d-%b-%Y", "%d-%b-%y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def _station_code(name: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", name.upper())[:20]


def _source(origin: str, source: str, report: ImportReport, row: int):
    """Return (origin_type, facility, supplier) for a sheet row, creating what is missing."""
    origin_u, source_u = origin.upper(), source.upper()
    if source_u in ALWAYS_BAHO or origin_u == "BAHO":
        if origin_u != "BAHO":
            report.warn(f"origin '{origin}' treated as BAHO for {source_u}", row)
        code = _station_code(source)
        facility = Facility.objects.filter(code=code).first()
        if facility is None:
            facility = Facility.objects.create(
                code=code,
                name=f"{source.strip().title()} CWS",
                facility_type=Facility.FacilityType.CWS,
            )
            report.new_stations.append(facility.name)
        return OriginType.OWN_CWS, facility, None
    name = SUPPLIER_ALIASES.get(source_u, source.strip().upper())
    if name != source_u:
        report.warn(f"source '{source}' recorded under supplier {name}", row)
    supplier = Supplier.objects.filter(name__iexact=name).first()
    if supplier is None:
        supplier = Supplier.objects.create(name=name)
        report.new_suppliers.append(name)
    return OriginType.PARTNER_SUPPLIER, None, supplier


def read_rows(path: Path):
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle)
        header = [h.strip() for h in next(reader)]
        missing = [c for c in COLUMNS.values() if c not in header]
        if missing:
            raise ValueError(f"Columns not found in the file: {', '.join(missing)}")
        index = {key: header.index(col) for key, col in COLUMNS.items()}
        for line_no, cells in enumerate(reader, start=2):
            yield line_no, {key: (cells[i] if i < len(cells) else "") for key, i in index.items()}


def import_stock_update(path: Path, *, batch: str, user=None, commit: bool = False) -> ImportReport:
    report = ImportReport()
    rows = list(read_rows(path))
    report.rows_in_file = len(rows)
    already = set(
        HqStockReceipt.all_objects.filter(import_batch=batch).values_list("source_row", flat=True)
    )
    subs_before = set(SubProcess.objects.values_list("pk", flat=True))

    parsed = []
    for line_no, raw in rows:
        if not (_text(raw["date"]) or _text(raw["source"]) or _text(raw["net"])):
            report.skipped_empty += 1  # blank line (or only "-" placeholders)
            continue
        arrival = _date(raw["date"])
        net = _decimal(raw["net"])
        if arrival is None:
            report.error("arrival date missing or unreadable", line_no)
            continue
        if not isinstance(net, Decimal) or net <= 0:
            report.error("net weight missing or invalid", line_no)
            continue
        report.file_totals["net"] += net
        sheet_pure = _decimal(raw["pure"])
        if isinstance(sheet_pure, Decimal):
            report.file_totals["pure"] += sheet_pure
        bags = _decimal(raw["bags"])
        if isinstance(bags, Decimal):
            report.file_totals["bags"] += bags
        parsed.append((arrival, line_no, raw, net, bags, sheet_pure))

    # Number receipts in arrival order (then sheet order), like they would have been on the day.
    parsed.sort(key=lambda item: (item[0], item[1]))
    seen = {}

    try:
        with transaction.atomic():
            for arrival, line_no, raw, net, bags, sheet_pure in parsed:
                if line_no in already:
                    report.already_imported += 1
                    continue
                if not isinstance(bags, Decimal):
                    report.warn("weight of bags missing, 0 used", line_no)
                    bags = Decimal("0")
                if bags > net:
                    report.error("weight of bags larger than net weight", line_no)
                    continue
                if not isinstance(sheet_pure, Decimal):
                    report.warn("pure weight blank in the sheet, calculated as net - bags", line_no)
                elif abs(sheet_pure - (net - bags)) > 1:
                    report.warn("sheet pure weight differs from net - bags (recalculated)", line_no)

                origin_type, facility, supplier = _source(
                    _text(raw["origin"]), _text(raw["source"]), report, line_no
                )
                process_raw = _text(raw["process"])
                process, sub_process = resolve_process_label(process_raw)
                if not process_raw:
                    report.warn("no process in the sheet", line_no)
                grade = _text(raw["grade"]).upper()
                if grade in GRADE_FIXES:
                    report.warn(f"grade {grade} corrected to {GRADE_FIXES[grade]}", line_no)
                    grade = GRADE_FIXES[grade]
                if not grade:
                    report.warn("no grade in the sheet", line_no)
                quality = _text(raw["quality"]).upper()
                quality_status = {"ACCEPTED": "ACCEPTED", "REJECTED": "REJECTED"}.get(
                    quality, "PENDING"
                )
                if not quality:
                    report.warn("quality status blank, set to Pending", line_no)

                key = (arrival, _text(raw["source"]).upper(), process_raw.upper(), grade, net)
                if key in seen:
                    report.warn(f"possible duplicate of sheet row {seen[key]}", line_no)
                seen.setdefault(key, line_no)

                dn_qty = _decimal(raw["dn_qty"])
                receipt = create_stock_receipt(
                    user=user,
                    arrival_date=arrival,
                    origin_type=origin_type,
                    source_facility=facility,
                    source_supplier=supplier,
                    net_weight_kg=net,
                    weight_of_bags_kg=bags,
                    require_process=False,
                    process=process,
                    sub_process=sub_process,
                    process_raw=process_raw,
                    grade=grade,
                    item_type="GREEN" if _text(raw["type"]).upper() == "GREEN" else "PARCH",
                    delivery_note_qty_kg=dn_qty if isinstance(dn_qty, Decimal) else None,
                    delivery_note_no=_text(raw["dn_no"]),
                    weighing_status="DONE"
                    if _text(raw["weighing"]).upper() == "DONE"
                    else "PENDING",
                    purchase_contract_number=_text(raw["contract"]),
                    wrn_number=_text(raw["wrn"]),
                    warehouse_cell=_text(raw["cell"]),
                    stock_card_number=_text(raw["card"]),
                    quality_status=quality_status,
                    source_raw=" / ".join(
                        dict.fromkeys(v for v in (_text(raw["origin"]), _text(raw["source"])) if v)
                    ),
                    import_batch=batch,
                    source_row=line_no,
                )
                report.created += 1
                report.imported_totals["net"] += net
                report.imported_totals["bags"] += bags
                report.imported_totals["pure"] += net - bags
                if isinstance(sheet_pure, Decimal):
                    report.imported_totals["pure_where_sheet_has_it"] += net - bags

                if _text(raw["processing"]).upper() == "COMPLETED" and net - bags > 0:
                    adjust_stock(
                        user=user,
                        receipt=receipt,
                        qty_kg=-(net - bags),
                        reason=(
                            "Opening balance: marked 'Completed' in the BAHO STOCK UPDATE sheet "
                            "(no processed quantity recorded there)."
                        ),
                        adjusted_on=arrival,
                    )
                    report.opening_adjustments += 1

            report.unassigned_sub_processes = list(
                SubProcess.objects.filter(process__isnull=True)
                .exclude(pk__in=subs_before)
                .values_list("name", flat=True)
                .order_by("name")
            )
            if not commit:
                raise DryRun
    except DryRun:
        pass
    return report

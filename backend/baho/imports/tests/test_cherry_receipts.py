# ruff: noqa: E501 - CSV rows laid out like the real sheet
from decimal import Decimal
from io import StringIO

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import CommandError, call_command

from baho.core.models import SequenceCounter
from baho.farmers.models import Farmer
from baho.farmers.services import register_farmer
from baho.imports.cherry_receipts import import_cherry_receipts
from baho.imports.models import CherryReceiptImport
from baho.reception.models import CherryReceipt
from tests.factories import FacilityFactory

pytestmark = pytest.mark.django_db

# The real workbook has 4 title/header lines before the data.
HEADER = (
    "BUGOYI CWS,,,,,,,,,,,,,,,,,,,\n"
    "CHERRY RECEIVED,,,,,,,,,,,,,,,,,,,\n"
    ",,,,,,,,GOOD CHERRY,,,,FLOAT CHERRY,,,,TOTAL,,PAYMENT,\n"
    "DATE,FARMER NAMES,PHONE,EMAIL,SECTOR,CELL,VILLAGE,GRN,QTY,PRICE,TRANSPORT,COMMISSION,"
    "QTY,PRICE,TRANSPORT,COMMISSION,QTY,AMOUNT,PAID,NOT PAID\n"
)
ROWS = [
    # line 5: new farmer, Good + Float, fully paid, real location
    '15/03/2026,Jean  Bosco,0788123456,jb@example.com,Bugeshi,Buringo,Bugeshi,1,"1,200",400,0,10,50,100,,,1250,485000,485000,',
    # line 6: same farmer (name case/spaces, phone without the leading 0), unpaid
    "16/03/2026,JEAN BOSCO,788123456,,,,,2,300.5,400,,,,,,,300.5,120200,,120200",
    # line 7: blank line
    ",,,,,,,,,,,,,,,,,,,",
    # line 8: float only, partly paid, Excel serial date (2026-03-14)
    "46095,Marie Uwase,0722000111,,Bugeshi,,,3,,,,,80,100,,,80,8000,5000,3000",
    # line 9-11: bad rows
    "32/13/2026,Bad Date,,,,,,4,100,400,,,,,,,,,,",
    "17/03/2026,No Quantity,,,,,,5,,,,,,,,,,,,",
    "17/03/2026,Bad Number,,,,,,6,abc,400,,,,,,,,,,",
]


def write_sheet(tmp_path, rows=ROWS, name="bugoyi.csv"):
    path = tmp_path / name
    path.write_text(HEADER + "\n".join(rows) + "\n", encoding="utf-8")
    return path


def run(path, *args, station="BUGOYI", user="admin@test.local"):
    out = StringIO()
    call_command(
        "import_cherry_receipts", str(path), "--station", station, "--user", user, *args, stdout=out
    )
    return out.getvalue()


@pytest.fixture
def sheet(tmp_path, bugoyi, baho_admin):
    return write_sheet(tmp_path)


def test_dry_run_writes_nothing(sheet):
    output = run(sheet)
    assert "DRY RUN" in output
    assert "GRNs to create          3" in output
    assert "farmers to create       2" in output
    assert Farmer.all_objects.count() == 0
    assert CherryReceipt.all_objects.count() == 0
    assert CherryReceiptImport.objects.count() == 0
    assert not SequenceCounter.objects.exists()  # numbers are not consumed either


def test_commit_creates_farmers_and_grns(sheet, bugoyi, baho_admin):
    output = run(sheet, "--commit")
    assert "GRNs created            3" in output

    farmers = {f.full_name: f for f in Farmer.objects.all()}
    assert set(farmers) == {"Jean Bosco", "Marie Uwase"}
    jean = farmers["Jean Bosco"]
    assert jean.home_facility == bugoyi and jean.phone == "0788123456"
    # Rows are imported in date order: Marie (14/03) is registered first.
    assert farmers["Marie Uwase"].farmer_code == "BUGOYI-F00001"
    assert jean.farmer_code == "BUGOYI-F00002"
    assert (jean.location.level, jean.location.name, jean.location.parent.name) == (
        "VILLAGE",
        "Bugeshi",
        "Buringo",
    )
    assert farmers["Marie Uwase"].location.level == "SECTOR"

    receipts = {r.import_record.source_row: r for r in CherryReceipt.objects.all()}
    assert set(receipts) == {5, 6, 8}
    # Numbered in reception order: 14/03 (serial date) before 15/03 and 16/03.
    assert [receipts[n].grn_number for n in (8, 5, 6)] == [
        "BUGOYI-2026-00001",
        "BUGOYI-2026-00002",
        "BUGOYI-2026-00003",
    ]
    first = receipts[5]
    assert str(first.received_on) == "2026-03-15" and first.farmer == jean
    lines = {line.cherry_grade: line for line in first.lines.all()}
    assert lines["GOOD"].quantity_kg == Decimal("1200")
    assert lines["GOOD"].price_per_kg == Decimal("400")
    assert lines["GOOD"].commission == Decimal("10")
    assert lines["FLOAT"].quantity_kg == Decimal("50")
    assert (first.payment_status, first.payment_method) == ("PAID", "CASH")
    assert "Original GRN: 1." in first.notes and "jb@example.com" in first.notes
    assert first.created_by == baho_admin

    second = receipts[6]
    assert second.farmer == jean  # matched by name + phone
    assert [(x.cherry_grade, x.quantity_kg) for x in second.lines.all()] == [
        ("GOOD", Decimal("300.50"))
    ]
    assert second.payment_status == "UNPAID"

    partly_paid = receipts[8]
    assert partly_paid.payment_status == "UNPAID"
    assert [(x.cherry_grade, x.quantity_kg) for x in partly_paid.lines.all()] == [
        ("FLOAT", Decimal("80"))
    ]
    assert "partly paid" in output


def test_rerun_skips_rows_already_imported(sheet, tmp_path):
    run(sheet, "--commit")
    output = run(sheet, "--commit")
    assert "already imported        3" in output
    assert "GRNs created            0" in output
    # Renamed and re-sorted file: still recognised by content.
    renamed = write_sheet(tmp_path, rows=list(reversed(ROWS)), name="copy.csv")
    run(renamed, "--commit")
    assert CherryReceipt.all_objects.count() == 3
    assert Farmer.all_objects.count() == 2


def test_bad_rows_are_reported_not_fatal(sheet, bugoyi, baho_admin):
    report = import_cherry_receipts(sheet, station_code="BUGOYI", user=baho_admin, commit=True)
    assert report.rows_read == 7 and report.skipped_empty == 1 and report.created == 3
    errors = dict(report.errors)
    assert set(errors) == {9, 10, 11}
    assert "date" in errors[9]
    assert "no Good or Float" in errors[10]
    assert "not a number" in errors[11]
    assert report.good_kg == Decimal("1500.50") and report.float_kg == Decimal("130")


def test_corrected_row_with_same_sheet_grn_is_refused(sheet, tmp_path, baho_admin):
    run(sheet, "--commit")
    fixed = ROWS[1].replace("300.5,400", "310,400")
    report = import_cherry_receipts(
        write_sheet(tmp_path, rows=[fixed], name="fix.csv"),
        station_code="BUGOYI",
        user=baho_admin,
        commit=True,
    )
    assert report.created == 0
    assert "sheet GRN 2 of crop year 2026 was already imported" in report.errors[0][1]


@pytest.mark.parametrize("code", ["NOPE", "HQ"])
def test_wrong_station_is_refused(sheet, hq, code):
    with pytest.raises(CommandError):
        run(sheet, "--commit", station=code)
    assert CherryReceipt.all_objects.count() == 0


def test_clerk_cannot_import_into_another_station(sheet, gitoki_clerk):
    with pytest.raises(CommandError, match="not assigned to Bugoyi"):
        run(sheet, "--commit", user="clerk@test.local")
    assert CherryReceipt.all_objects.count() == 0


def test_farmers_are_matched_within_the_station_only(
    sheet, bugoyi, gitoki, bugoyi_clerk, gitoki_clerk
):
    other_station = register_farmer(
        user=gitoki_clerk,
        home_facility=gitoki,
        full_name="Jean Bosco",
        phone="0788123456",
    )
    known = register_farmer(
        user=bugoyi_clerk, home_facility=bugoyi, full_name="MARIE UWASE", phone="+250722000111"
    )
    output = run(sheet, "--commit", user="clerk.bugoyi@test.local")
    assert "farmers created         1" in output
    marie_receipt = CherryReceipt.objects.get(import_record__source_row=8)
    assert marie_receipt.farmer == known
    jean = CherryReceipt.objects.get(import_record__source_row=5).farmer
    assert jean != other_station and jean.home_facility == bugoyi
    assert other_station.cherry_receipts.count() == 0


URL = "/api/v1/imports/cherry-receipts/"


def upload(api, path, **data):
    file = SimpleUploadedFile(path.name, path.read_bytes(), content_type="text/csv")
    return api.post(URL, {"file": file, "station": "BUGOYI", **data}, format="multipart")


def test_api_dry_run_then_commit(api, sheet, baho_admin):
    api.force_authenticate(baho_admin)
    dry = upload(api, sheet)
    assert dry.status_code == 200, dry.data
    assert dry.data["committed"] is False and dry.data["created"] == 3
    assert {e["row"] for e in dry.data["errors"]} == {9, 10, 11}
    assert CherryReceipt.all_objects.count() == 0

    done = upload(api, sheet, commit=True)
    assert done.status_code == 200 and done.data["created"] == 3
    assert CherryReceipt.objects.count() == 3


def test_api_is_admin_only_and_csv_only(api, sheet, tmp_path, bugoyi_clerk, baho_admin):
    api.force_authenticate(bugoyi_clerk)
    assert upload(api, sheet).status_code == 403
    api.force_authenticate(baho_admin)
    xlsx = tmp_path / "sheet.xlsx"
    xlsx.write_bytes(b"PK\x03\x04")
    assert upload(api, xlsx).status_code == 400
    bad_station = upload(api, sheet, station="NOPE")
    assert bad_station.status_code == 400 and "Unknown station" in str(bad_station.data)


def test_other_stations_are_untouched(sheet, gitoki):
    FacilityFactory(code="KINAZI")
    run(sheet, "--commit")
    assert not CherryReceipt.objects.exclude(facility__code="BUGOYI").exists()


def test_imported_grns_do_not_text_farmers(sheet, django_capture_on_commit_callbacks):
    """Old deliveries are history: importing them must not SMS farmers (who have phones here)."""
    from baho.notifications.models import SmsMessage

    with django_capture_on_commit_callbacks(execute=True):
        run(sheet, "--commit")
    assert CherryReceipt.objects.exists()
    assert SmsMessage.objects.count() == 0

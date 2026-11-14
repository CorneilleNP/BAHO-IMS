# ruff: noqa: E501 - the CSV rows below are copied from the real sheet
from decimal import Decimal
from io import StringIO

import pytest
from django.core.management import call_command

from baho.drymill.models import HqStockReceipt, Supplier
from baho.organization.models import Facility

pytestmark = pytest.mark.django_db

HEADER = (
    "Arrival Date,Origin (Baho/Partners),Source (Supplier/CWS name),Type (Parch/Green),"
    "Delivery note Quantity (Kg),Process,Grades,Delivery note No,Weighing status,"
    "Purchase contract number, Net-weight (Kg) ,WRN Number,Warehouse Cell Number,"
    "Stock Card number,Weight of bags (Kg), Pure Weight (Kg) ,Quality Status,"
    "Processing Status,Processing Date,Stock processed (Kg),Stock Balance (Kg),Crop year\n"
)
ROWS = [
    # the sheet's real quirks: thousands separators, N/A, typos, Ngororero under PARTNER, …
    '5/13/2026,BAHO,KINAZI,Parch,4200,NATURAL N,HG,23,Done,N/A,"  4,229 ",,N/A,N/A,10,"  4,219 ",Accepted,Not Started,,,,2026',
    '5/14/2026,BAHO,KINAZI,Parch,4120,FW,A1,4,Done,N/A,"  4,131 ",,N/A,N/A,10,"  4,121 ",Accepted,Completed,,,,2026',
    '6/1/2026,PARTNER,NGORORERO,Parch,,WASHED NO1,A2,,Done,N/A,"  1,000 ",,N/A,N/A,,"  1,000 ",,Not Started,,,,',
    "6/2/2026,AGRINOS,KAYENZI,Parch,,WASHED NO 1,FLOOT,,Done,N/A,  500 ,,N/A,N/A,2,  498 ,Accepted,Not Started,,,,2026",
    ",,,,,,,,,,,,,,,  -   ,,,,,,",
]


@pytest.fixture
def sheet(tmp_path, hq, crop_year):
    path = tmp_path / "stock.csv"
    path.write_text(HEADER + "\n".join(ROWS) + "\n", encoding="utf-8")
    Facility.objects.create(code="KINAZI", name="Kinazi CWS", facility_type="CWS")
    return path


def run(path, *args):
    out = StringIO()
    call_command("import_stock_update", str(path), *args, stdout=out)
    return out.getvalue()


def test_dry_run_saves_nothing(sheet):
    output = run(sheet)
    assert "DRY RUN" in output and "to create      4" in output
    assert HqStockReceipt.all_objects.count() == 0
    assert not Facility.objects.filter(code="NGORORERO").exists()


def test_commit_imports_with_agreed_rules(sheet):
    output = run(sheet, "--commit")
    assert "created      4" in output
    receipts = {
        r.source_row: r for r in HqStockReceipt.objects.select_related("process", "sub_process")
    }

    first = receipts[2]
    assert (first.process.code, first.net_weight_kg, first.stock_balance_kg) == ("NN", 4229, 4219)
    assert first.purchase_contract_number == ""  # N/A cleaned

    completed = receipts[3]  # "Completed" -> opening adjustment, balance 0
    assert (completed.processing_status, completed.stock_balance_kg) == ("COMPLETED", Decimal("0"))

    ngororero = receipts[4]  # PARTNER in the sheet, but always Baho
    assert ngororero.origin_type == "OWN_CWS" and ngororero.source_facility.code == "NGORORERO"
    assert ngororero.quality_status == "PENDING"  # blank quality
    assert ngororero.process is None and ngororero.sub_process.name == "WASHED NO1"

    kayenzi = receipts[5]
    assert kayenzi.source_supplier == Supplier.objects.get(name="AGRINOS LTD")
    assert kayenzi.grade == "FLOAT"
    assert kayenzi.sub_process == ngororero.sub_process  # "WASHED NO 1" = "WASHED NO1"
    assert kayenzi.source_raw == "AGRINOS / KAYENZI"


def test_rerun_skips_rows_already_imported(sheet):
    run(sheet, "--commit")
    output = run(sheet, "--commit")
    assert "already imported        4" in output
    assert HqStockReceipt.all_objects.count() == 4

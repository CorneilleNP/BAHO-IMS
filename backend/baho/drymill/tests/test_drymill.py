from decimal import Decimal

import pytest

from baho.drymill.models import ExportGrade
from tests.helpers import login

pytestmark = pytest.mark.django_db
SUPPLIERS = "/api/v1/drymill/suppliers/"
RECEIPTS = "/api/v1/drymill/stock-receipts/"
BATCHES = "/api/v1/drymill/batches/"


def stock_receipt(gitoki, **extra):
    return {
        "origin_type": "OWN_CWS",
        "source_facility": str(gitoki.id),
        "process": "FW",
        "grade": "A1",
        "delivery_note_qty_kg": "4120",
        "net_weight_kg": "4131",
        "number_of_bags": 50,
        "tare_per_bag_kg": "0.2",
        **extra,
    }


def test_supplier_registration_and_sources_list(api, drymill_operator, gitoki):
    login(api, drymill_operator)
    res = api.post(SUPPLIERS, {"name": "Mukamira Cooperative", "contact_name": "Isaac"})
    assert res.status_code == 201, res.data
    assert api.post(SUPPLIERS, {"name": "mukamira cooperative"}).status_code == 400
    sources = api.get("/api/v1/drymill/sources/").data
    assert {s["name"] for s in sources} == {"Gitoki CWS", "Mukamira Cooperative"}


def test_stock_receipt_computes_bag_weight_and_pure_weight(api, drymill_operator, gitoki):
    login(api, drymill_operator)
    res = api.post(RECEIPTS, stock_receipt(gitoki), format="json")
    assert res.status_code == 201, res.data
    assert res.data["receipt_number"].startswith("SR-")
    assert Decimal(res.data["weight_of_bags_kg"]) == Decimal("10.00")  # 50 bags x 0.2 kg
    assert Decimal(res.data["pure_weight_kg"]) == Decimal("4121.00")
    assert Decimal(res.data["variance_kg"]) == Decimal("11.00")
    assert res.data["source_code"] == "GITOKI"


def test_stock_receipt_source_must_match_origin(api, drymill_operator, gitoki):
    login(api, drymill_operator)
    res = api.post(RECEIPTS, stock_receipt(gitoki, origin_type="PARTNER_SUPPLIER"), format="json")
    assert res.status_code == 400


def test_cws_clerk_cannot_use_dry_mill(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    assert api.get(RECEIPTS).status_code == 403
    assert api.post(RECEIPTS, stock_receipt(gitoki), format="json").status_code == 403


def test_export_manager_can_read_but_not_log_stock(api, export_manager, gitoki):
    login(api, export_manager)
    assert api.get(RECEIPTS).status_code == 200
    assert api.post(RECEIPTS, stock_receipt(gitoki), format="json").status_code == 403


def test_dry_mill_batch_totals_and_outturn(api, drymill_operator, gitoki):
    login(api, drymill_operator)
    g15 = ExportGrade.objects.get(code="15PLUS")
    g1314 = ExportGrade.objects.get(code="1314")
    res = api.post(
        BATCHES,
        {
            "origin_type": "OWN_CWS",
            "source_facility": str(gitoki.id),
            "process_product": "FULLWASHED A1",
            "parch_input_kg": "10000",
            "outputs": [
                {"export_grade": str(g15.id), "qty_kg": "6000"},
                {"export_grade": str(g1314.id), "qty_kg": "1500"},
            ],
        },
        format="json",
    )
    assert res.status_code == 201, res.data
    assert res.data["batch_no"].startswith("DM-")
    assert Decimal(res.data["green_output_kg"]) == Decimal("7500")
    assert Decimal(res.data["outturn_pct"]) == Decimal("75.00")


def test_batch_output_cannot_exceed_input(api, drymill_operator, gitoki):
    login(api, drymill_operator)
    grade = ExportGrade.objects.get(code="15PLUS")
    res = api.post(
        BATCHES,
        {
            "origin_type": "OWN_CWS",
            "source_facility": str(gitoki.id),
            "process_product": "FULLWASHED A1",
            "parch_input_kg": "100",
            "outputs": [{"export_grade": str(grade.id), "qty_kg": "150"}],
        },
        format="json",
    )
    assert res.status_code == 400

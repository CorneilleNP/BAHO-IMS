from decimal import Decimal

import pytest

from baho.drymill.models import ExportGrade, HqStockReceipt
from baho.processing.models import Process, SubProcess
from tests.factories import stock_receipt
from tests.helpers import login

pytestmark = pytest.mark.django_db
SUPPLIERS = "/api/v1/drymill/suppliers/"
RECEIPTS = "/api/v1/drymill/stock-receipts/"
BATCHES = "/api/v1/drymill/batches/"


def fw():
    return Process.objects.get(code="FW")


def receipt_payload(gitoki, **extra):
    return {
        "source_facility": str(gitoki.id),
        "process": str(fw().id),
        "grade": "a1",
        "delivery_note_qty_kg": "4120",
        "net_weight_kg": "4131",
        "number_of_bags": 50,
        "tare_per_bag_kg": "0.2",
        "purchase_contract_number": "PC-001",
        "weighing_status": "DONE",
        **extra,
    }


def batch_payload(*inputs, outputs=(("15PLUS", "600"),)):
    return {
        "process_product": "FULLWASHED A1",
        "inputs": [{"receipt": str(r.id), "qty_kg": str(kg)} for r, kg in inputs],
        "outputs": [
            {"export_grade": str(ExportGrade.objects.get(code=code).id), "qty_kg": kg}
            for code, kg in outputs
        ],
    }


# --- Suppliers / sources ---------------------------------------------------------------


def test_supplier_registration_and_sources_list(api, drymill_operator, gitoki):
    login(api, drymill_operator)
    res = api.post(SUPPLIERS, {"name": "Mukamira Cooperative", "contact_name": "Isaac"})
    assert res.status_code == 201, res.data
    assert api.post(SUPPLIERS, {"name": "mukamira cooperative"}).status_code == 400
    sources = api.get("/api/v1/drymill/sources/").data
    assert {s["name"] for s in sources} == {"Gitoki CWS", "Mukamira Cooperative"}


# --- Stock receipts -------------------------------------------------------------------


def test_receipt_captures_every_sheet_column(api, drymill_operator, gitoki, hq):
    login(api, drymill_operator)
    res = api.post(RECEIPTS, receipt_payload(gitoki), format="json")
    assert res.status_code == 201, res.data
    data = res.data
    assert data["receipt_number"].startswith("SR-")
    assert data["origin_type"] == "OWN_CWS"  # follows the chosen source
    assert data["process_name"] == "Fully Washed"
    assert data["grade"] == "A1"
    assert Decimal(data["weight_of_bags_kg"]) == Decimal("10.00")  # 50 bags x 0.2 kg
    assert Decimal(data["pure_weight_kg"]) == Decimal("4121.00")
    assert Decimal(data["variance_kg"]) == Decimal("11.00")
    assert Decimal(data["stock_balance_kg"]) == Decimal("4121.00")
    assert data["processing_status"] == "NOT_STARTED"
    assert data["purchase_contract_number"] == "PC-001"


def test_receipt_requires_one_of_the_five_processes(api, drymill_operator, gitoki, hq):
    login(api, drymill_operator)
    res = api.post(RECEIPTS, receipt_payload(gitoki, process=None), format="json")
    assert res.status_code == 400
    assert "process" in res.data


def test_sub_process_sets_its_process(api, drymill_operator, gitoki, hq):
    sub = SubProcess.objects.create(name="WASHED NO 1", process=fw())
    login(api, drymill_operator)
    res = api.post(
        RECEIPTS, receipt_payload(gitoki, process=None, sub_process=str(sub.id)), format="json"
    )
    assert res.status_code == 201, res.data
    assert (res.data["process_name"], res.data["sub_process_name"]) == (
        "Fully Washed",
        "WASHED NO 1",
    )


def test_cws_clerk_cannot_use_dry_mill(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    assert api.get(RECEIPTS).status_code == 403


def test_export_manager_can_read_but_not_log_stock(api, export_manager, gitoki, hq):
    login(api, export_manager)
    assert api.get(RECEIPTS).status_code == 200
    assert api.post(RECEIPTS, receipt_payload(gitoki), format="json").status_code == 403


def test_edit_receipt_and_history(api, drymill_operator, gitoki, hq):
    login(api, drymill_operator)
    created = api.post(RECEIPTS, receipt_payload(gitoki), format="json").data
    res = api.patch(
        f"{RECEIPTS}{created['id']}/", {"grade": "A2", "warehouse_cell": "C-4"}, format="json"
    )
    assert res.status_code == 200, res.data
    assert res.data["grade"] == "A2"
    history = api.get(f"{RECEIPTS}{created['id']}/history/").data
    assert history[0]["type"] == "changed"
    assert {c["field"] for c in history[0]["changes"]} == {"Grade", "Warehouse cell"}
    assert history[-1]["type"] == "created"


def test_weights_lock_once_stock_has_moved(api, drymill_operator, gitoki, hq):
    receipt = stock_receipt(gitoki, net="1000")
    login(api, drymill_operator)
    res = api.post(BATCHES, batch_payload((receipt, 400), outputs=()), format="json")
    assert res.status_code == 201
    res = api.patch(f"{RECEIPTS}{receipt.id}/", {"net_weight_kg": "1200"}, format="json")
    assert res.status_code == 400
    assert (
        api.patch(f"{RECEIPTS}{receipt.id}/", {"warehouse_cell": "B2"}, format="json").status_code
        == 200
    )


def test_bulk_quality_and_reject_needs_reason(api, drymill_operator, gitoki, hq):
    a = stock_receipt(gitoki, quality="PENDING")
    b = stock_receipt(gitoki, quality="PENDING")
    login(api, drymill_operator)
    res = api.post(
        f"{RECEIPTS}quality/",
        {"ids": [str(a.id), str(b.id)], "quality_status": "ACCEPTED"},
        format="json",
    )
    assert res.data == {"updated": 2}
    res = api.post(
        f"{RECEIPTS}quality/", {"ids": [str(a.id)], "quality_status": "REJECTED"}, format="json"
    )
    assert res.status_code == 400


def test_totals_follow_filters(api, drymill_operator, gitoki, bugoyi, hq):
    stock_receipt(gitoki, net="1000", bags="10")
    stock_receipt(bugoyi, net="500")
    login(api, drymill_operator)
    totals = api.get(f"{RECEIPTS}totals/?source=GITOKI").data
    assert totals["receipts"] == 1
    assert Decimal(totals["pure_weight_kg"]) == Decimal("990")


# --- Stock ledger: batches deduct stock ------------------------------------------------------


def test_batch_deducts_stock_and_sets_status(api, drymill_operator, gitoki, hq):
    receipt = stock_receipt(gitoki, net="1000")
    login(api, drymill_operator)
    res = api.post(
        BATCHES, batch_payload((receipt, 400), outputs=(("15PLUS", "300"),)), format="json"
    )
    assert res.status_code == 201, res.data
    assert Decimal(res.data["parch_input_kg"]) == Decimal("400")
    assert Decimal(res.data["outturn_pct"]) == Decimal("75.00")
    receipt.refresh_from_db()
    assert (receipt.processed_kg, receipt.stock_balance_kg) == (Decimal("400"), Decimal("600"))
    assert receipt.processing_status == "IN_PROGRESS"
    assert receipt.processing_date is not None

    api.post(BATCHES, batch_payload((receipt, 600), outputs=(("15PLUS", "450"),)), format="json")
    receipt.refresh_from_db()
    assert (receipt.stock_balance_kg, receipt.processing_status) == (Decimal("0"), "COMPLETED")


def test_batch_cannot_take_more_than_balance(api, drymill_operator, gitoki, hq):
    receipt = stock_receipt(gitoki, net="100")
    login(api, drymill_operator)
    res = api.post(BATCHES, batch_payload((receipt, 150), outputs=()), format="json")
    assert res.status_code == 400
    assert "only 100.00 kg left" in str(res.data)


def test_only_accepted_coffee_can_be_milled(api, drymill_operator, gitoki, hq):
    receipt = stock_receipt(gitoki, quality="PENDING")
    login(api, drymill_operator)
    res = api.post(BATCHES, batch_payload((receipt, 10), outputs=()), format="json")
    assert res.status_code == 400
    assert "not quality-accepted" in str(res.data)


def test_mixed_sources_batch(api, drymill_operator, gitoki, bugoyi, hq):
    a, b = stock_receipt(gitoki), stock_receipt(bugoyi)
    login(api, drymill_operator)
    res = api.post(BATCHES, batch_payload((a, 100), (b, 100), outputs=()), format="json")
    assert res.status_code == 201, res.data
    assert (res.data["origin_type"], res.data["source_name"]) == ("MIXED", "Mixed sources")


def test_voiding_batch_gives_stock_back(api, drymill_operator, gitoki, hq):
    receipt = stock_receipt(gitoki, net="1000")
    login(api, drymill_operator)
    batch = api.post(BATCHES, batch_payload((receipt, 1000), outputs=()), format="json").data
    assert api.post(f"{RECEIPTS}{receipt.id}/void/", {"reason": "mistake"}).status_code == 400
    assert api.post(f"{BATCHES}{batch['id']}/void/", {"reason": "wrong receipt"}).status_code == 200
    receipt.refresh_from_db()
    assert (receipt.stock_balance_kg, receipt.processing_status) == (Decimal("1000"), "NOT_STARTED")


def test_adjustment_with_reason(api, drymill_operator, gitoki, hq):
    receipt = stock_receipt(gitoki, net="1000")
    login(api, drymill_operator)
    res = api.post(f"{RECEIPTS}{receipt.id}/adjust/", {"qty_kg": "-25", "reason": "Moisture loss"})
    assert res.status_code == 200, res.data
    assert Decimal(res.data["stock_balance_kg"]) == Decimal("975")
    assert res.data["adjustments"][0]["reason"] == "Moisture loss"
    assert (
        api.post(f"{RECEIPTS}{receipt.id}/adjust/", {"qty_kg": "-5000", "reason": "x"}).status_code
        == 400
    )
    assert (
        api.post(f"{RECEIPTS}{receipt.id}/adjust/", {"qty_kg": "-1", "reason": ""}).status_code
        == 400
    )


def test_detail_shows_where_the_stock_went(api, drymill_operator, gitoki, hq):
    receipt = stock_receipt(gitoki, net="1000")
    login(api, drymill_operator)
    batch = api.post(BATCHES, batch_payload((receipt, 300), outputs=()), format="json").data
    detail = api.get(f"{RECEIPTS}{receipt.id}/").data
    assert detail["movements"][0]["batch_no"] == batch["batch_no"]
    assert Decimal(detail["movements"][0]["qty_kg"]) == Decimal("300")


def test_receipts_filter_by_balance(api, drymill_operator, gitoki, hq):
    full = stock_receipt(gitoki, net="100")
    stock_receipt(gitoki, net="100")
    login(api, drymill_operator)
    api.post(BATCHES, batch_payload((full, 100), outputs=()), format="json")
    assert api.get(f"{RECEIPTS}?has_balance=true").data["count"] == 1
    assert HqStockReceipt.objects.get(pk=full.pk).processing_status == "COMPLETED"

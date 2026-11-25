"""Trash: deleted records are listed for the retention period, then purged for good."""

from datetime import date, datetime, timedelta
from decimal import Decimal
from io import StringIO

import pytest
from django.core.management import call_command
from django.utils import timezone

from baho.core.services import purge_trash
from baho.drymill.models import DryMillBatch, ExportGrade, HqStockReceipt
from baho.drymill.stock import refresh_receipt_stock
from baho.farmers.models import Farmer
from baho.inventory.selectors import stock_ledger
from baho.labor.models import LaborPayPeriod
from baho.labor.services import open_pay_period
from baho.processing.models import Process, ProcessingLot
from baho.reception.models import CherryReceipt
from baho.sales.models import Client, ExportShipment
from baho.sales.services import create_shipment, green_balance
from tests.factories import produce_green, stock_receipt
from tests.helpers import login

pytestmark = pytest.mark.django_db

TRASH = "/api/v1/core/trash/"
RECEIPTS = "/api/v1/reception/receipts/"


def later(hours=25):
    """A moment after the default 24 h retention has passed for anything deleted now."""
    return timezone.now() + timedelta(hours=hours)


def make_grn(api, user, facility, kg="10"):
    farmer, _ = Farmer.objects.get_or_create(
        farmer_code=f"{facility.code}-F00001",
        defaults={"full_name": "J", "home_facility": facility},
    )
    login(api, user)
    res = api.post(
        RECEIPTS,
        {
            "facility": str(facility.id),
            "farmer": str(farmer.id),
            "received_on": date.today().isoformat(),
            "lines": [{"cherry_grade": "GOOD", "quantity_kg": kg, "price_per_kg": "500"}],
        },
        format="json",
    )
    assert res.status_code == 201, res.data
    return res.data


def void(api, path, reason="Entered by mistake"):
    res = api.post(f"{path}void/", {"reason": reason})
    assert res.status_code == 200, res.data


def make_lot(api, clerk, facility):
    login(api, clerk)
    process = api.post(
        "/api/v1/processing/process-types/",
        {
            "facility": str(facility.id),
            "process": str(Process.objects.get(code="FW").id),
            "grades": [{"code": "A1", "ratio": "0.14"}],
        },
        format="json",
    ).data
    lot = api.post(
        "/api/v1/processing/lots/",
        {"process_type": process["id"], "cherry_input_kg": "100"},
        format="json",
    )
    assert lot.status_code == 201, lot.data
    return lot.data


def make_shipment(kg="100"):
    client, _ = Client.objects.get_or_create(name="RTC")
    return create_shipment(
        user=None,
        client=client,
        delivery_to_naeb_date=date.today(),
        lines=[
            {
                "process_product": "FW",
                "export_grade": ExportGrade.objects.get(code="15PLUS"),
                "qty_kg": Decimal(kg),
            }
        ],
    )


@pytest.fixture
def everything_deleted(api, baho_admin, gitoki_clerk, drymill_operator, gitoki, bugoyi, hq):
    """One deleted record of every type, plus a deleted GRN at another station."""
    from tests.factories import UserFactory, assign

    grn = make_grn(api, gitoki_clerk, gitoki)
    void(api, f"{RECEIPTS}{grn['id']}/", "Entered twice")
    lot = make_lot(api, gitoki_clerk, gitoki)
    void(api, f"/api/v1/processing/lots/{lot['id']}/")

    other_clerk = UserFactory(email="other@test.local")
    assign(other_clerk, "CWS_CLERK", bugoyi)
    other_grn = make_grn(api, other_clerk, bugoyi)
    void(api, f"{RECEIPTS}{other_grn['id']}/")

    batch = produce_green(gitoki, "15PLUS", kg="700", parch="1000")
    shipment = make_shipment()
    shipment.soft_delete(user=baho_admin, reason="Cancelled")
    login(api, drymill_operator)
    void(api, f"/api/v1/drymill/batches/{batch.id}/")
    receipt = stock_receipt(gitoki, net="500")
    void(api, f"/api/v1/drymill/stock-receipts/{receipt.id}/")

    period = open_pay_period(
        user=baho_admin,
        facility=gitoki,
        period_start=date.today(),
        period_end=date.today() + timedelta(days=6),
    )
    period.soft_delete(user=baho_admin, reason="Wrong dates")
    return {
        "grn": grn["id"],
        "other_grn": other_grn["id"],
        "lot": lot["id"],
        "batch": str(batch.id),
        "shipment": str(shipment.id),
        "stock_receipt": str(receipt.id),
        "pay_period": str(period.id),
    }


# --- Listing -------------------------------------------------------------------


def test_admin_sees_every_deleted_type(api, baho_admin, everything_deleted, gitoki):
    login(api, baho_admin)
    res = api.get(TRASH)
    assert res.status_code == 200, res.data
    assert res.data["retention_hours"] == 24
    by_type = {}
    for row in res.data["results"]:
        by_type.setdefault(row["type"], []).append(row)
    assert {k: len(v) for k, v in by_type.items()} == {
        "grn": 2,
        "lot": 1,
        "batch": 1,
        "shipment": 1,
        "stock_receipt": 1,
        "pay_period": 1,
    }
    grn = next(r for r in by_type["grn"] if r["id"] == everything_deleted["grn"])
    assert grn["number"].startswith("GITOKI-")
    assert grn["reason"] == "Entered twice"
    assert grn["facility"] == str(gitoki.id)
    assert grn["facility_name"] == gitoki.name
    assert grn["deleted_by"]
    deleted_at = CherryReceipt.all_objects.get(pk=grn["id"]).deleted_at
    purge_after = datetime.fromisoformat(grn["purge_after"].replace("Z", "+00:00"))
    assert purge_after == deleted_at + timedelta(hours=24)
    assert by_type["shipment"][0]["facility"] is None


def test_type_and_station_filters(api, baho_admin, everything_deleted, bugoyi):
    login(api, baho_admin)
    rows = api.get(f"{TRASH}?type=grn").data["results"]
    assert {r["type"] for r in rows} == {"grn"} and len(rows) == 2
    rows = api.get(f"{TRASH}?facility={bugoyi.id}").data["results"]
    assert [r["id"] for r in rows] == [everything_deleted["other_grn"]]
    assert api.get(f"{TRASH}?type=nonsense").status_code == 400


def test_station_clerk_sees_only_own_station(api, gitoki_clerk, everything_deleted, bugoyi):
    login(api, gitoki_clerk)
    res = api.get(TRASH)
    assert {r["type"] for r in res.data["results"]} == {"grn", "lot", "pay_period"}
    assert everything_deleted["other_grn"] not in {r["id"] for r in res.data["results"]}
    assert {t["code"] for t in res.data["types"]} == {"grn", "lot", "pay_period"}
    # Asking for another station's records returns nothing.
    assert api.get(f"{TRASH}?facility={bugoyi.id}").data["results"] == []


def test_dry_mill_operator_sees_only_dry_mill_types(api, drymill_operator, everything_deleted):
    login(api, drymill_operator)
    types = {r["type"] for r in api.get(TRASH).data["results"]}
    assert types == {"batch", "shipment", "stock_receipt"}


def test_trash_needs_sign_in(api):
    assert api.get(TRASH).status_code == 401


def test_live_records_are_not_in_trash(api, baho_admin, gitoki_clerk, gitoki):
    make_grn(api, gitoki_clerk, gitoki)
    login(api, baho_admin)
    assert api.get(TRASH).data["count"] == 0


# --- Purge ---------------------------------------------------------------------


def test_purge_removes_only_expired_deleted_records(api, everything_deleted, gitoki_clerk, gitoki):
    live = make_grn(api, gitoki_clerk, gitoki)
    fresh = make_grn(api, gitoki_clerk, gitoki)
    void(api, f"{RECEIPTS}{fresh['id']}/")
    # Everything in the fixture was deleted more than 24 h ago; `fresh` just now.
    expired = timezone.now() - timedelta(hours=25)
    for model in (CherryReceipt, ProcessingLot, HqStockReceipt, DryMillBatch, ExportShipment):
        model.all_objects.filter(is_deleted=True).exclude(pk=fresh["id"]).update(deleted_at=expired)
    LaborPayPeriod.all_objects.filter(is_deleted=True).update(deleted_at=expired)

    report = purge_trash()

    assert report == {
        "shipment": {"purged": 1, "skipped": 0},
        "batch": {"purged": 1, "skipped": 0},
        "stock_receipt": {"purged": 1, "skipped": 0},
        "lot": {"purged": 1, "skipped": 0},
        "grn": {"purged": 2, "skipped": 0},
        "pay_period": {"purged": 1, "skipped": 0},
    }
    assert set(CherryReceipt.all_objects.values_list("id", flat=True)) == {
        CherryReceipt.objects.get(pk=live["id"]).pk,
        CherryReceipt.all_objects.get(pk=fresh["id"]).pk,
    }
    assert not ProcessingLot.all_objects.exists()
    # The batch's receipt (live, milled) stays; the deleted receipt is gone.
    assert list(HqStockReceipt.all_objects.values_list("is_deleted", flat=True)) == [False]
    assert not DryMillBatch.all_objects.exists()
    assert not ExportShipment.all_objects.exists()
    assert not LaborPayPeriod.all_objects.exists()


def test_purge_uses_the_retention_setting(api, settings, gitoki_clerk, gitoki):
    grn = make_grn(api, gitoki_clerk, gitoki)
    void(api, f"{RECEIPTS}{grn['id']}/")
    settings.TRASH_RETENTION_HOURS = 48
    assert purge_trash(now=later(25))["grn"]["purged"] == 0
    assert purge_trash(now=later(49))["grn"]["purged"] == 1
    assert not CherryReceipt.all_objects.filter(pk=grn["id"]).exists()


def test_fresh_records_are_kept(api, everything_deleted):
    report = purge_trash()
    assert all(c == {"purged": 0, "skipped": 0} for c in report.values())
    assert CherryReceipt.all_objects.filter(is_deleted=True).count() == 2


def test_record_still_referenced_is_skipped_not_crashing(api, drymill_operator, gitoki, hq):
    """A deleted receipt still used by a batch that is not due yet stays (PROTECT)."""
    batch = produce_green(gitoki, "15PLUS", kg="300", parch="500")
    receipt = batch.inputs.get().receipt
    login(api, drymill_operator)
    void(api, f"/api/v1/drymill/batches/{batch.id}/")
    void(api, f"/api/v1/drymill/stock-receipts/{receipt.id}/")
    HqStockReceipt.all_objects.filter(pk=receipt.pk).update(
        deleted_at=timezone.now() - timedelta(hours=30)
    )

    report = purge_trash()

    assert report["stock_receipt"] == {"purged": 0, "skipped": 1}
    assert HqStockReceipt.all_objects.filter(pk=receipt.pk).exists()
    # Once the batch is due as well, both go (batch first).
    report = purge_trash(now=later())
    assert report["batch"]["purged"] == 1 and report["stock_receipt"]["purged"] == 1


def test_imported_grn_is_kept(api, gitoki_clerk, gitoki):
    from baho.imports.models import CherryReceiptImport

    grn = make_grn(api, gitoki_clerk, gitoki)
    CherryReceiptImport.objects.create(
        import_key="x" * 64,
        station=gitoki,
        receipt=CherryReceipt.objects.get(pk=grn["id"]),
        source_file="book.xlsx",
        source_row=3,
    )
    void(api, f"{RECEIPTS}{grn['id']}/")
    assert purge_trash(now=later())["grn"] == {"purged": 0, "skipped": 1}
    assert CherryReceipt.all_objects.filter(pk=grn["id"]).exists()


def test_purge_keeps_stock_balances(api, drymill_operator, export_manager, gitoki, hq):
    g15 = ExportGrade.objects.get(code="15PLUS")
    live_batch = produce_green(gitoki, "15PLUS", kg="400", parch="1000")
    live_receipt = live_batch.inputs.get().receipt
    # A receipt partly milled by a batch that is then deleted: its parchment came back.
    shared = stock_receipt(gitoki, net="800")
    from baho.drymill.services import create_dry_mill_batch

    deleted_batch = create_dry_mill_batch(
        user=None,
        processing_date=shared.arrival_date,
        process_product="FULLWASHED A1",
        inputs=[{"receipt": shared, "qty_kg": Decimal("300")}],
        outputs=[{"export_grade": g15, "qty_kg": Decimal("200")}],
    )
    unused = stock_receipt(gitoki, net="250")
    live_shipment = make_shipment(kg="50")
    deleted_shipment = make_shipment(kg="70")
    deleted_shipment.soft_delete(reason="Cancelled")
    login(api, drymill_operator)
    void(api, f"/api/v1/drymill/batches/{deleted_batch.id}/")
    void(api, f"/api/v1/drymill/stock-receipts/{unused.id}/")

    def snapshot():
        receipts = {
            r.pk: (r.processed_kg, r.adjusted_kg, r.stock_balance_kg, r.processing_status)
            for r in HqStockReceipt.objects.all()
        }
        recalculated = {
            r.pk: refresh_receipt_stock(r).stock_balance_kg for r in HqStockReceipt.objects.all()
        }
        parch = stock_ledger(item_type="PARCH")
        green = stock_ledger(item_type="GREEN")
        return (
            receipts,
            recalculated,
            parch["closing_balance"],
            green["closing_balance"],
            green_balance(export_grade=g15),
        )

    before = snapshot()
    assert before[0][shared.pk][2] == Decimal("800")  # deleted batch's 300 kg was given back
    assert before[4] == Decimal("350")  # 400 produced - 50 shipped (live only)

    report = purge_trash(now=later())

    assert report["batch"]["purged"] == 1
    assert report["stock_receipt"]["purged"] == 1
    assert report["shipment"]["purged"] == 1
    assert snapshot() == before
    assert ExportShipment.objects.filter(pk=live_shipment.pk).exists()
    assert HqStockReceipt.objects.filter(pk=live_receipt.pk).exists()


def test_purged_receipt_and_batch_keep_a_deletion_history_row(api, drymill_operator, gitoki, hq):
    batch = produce_green(gitoki, "15PLUS", kg="300", parch="500")
    unused = stock_receipt(gitoki, net="100")
    login(api, drymill_operator)
    void(api, f"/api/v1/drymill/batches/{batch.id}/")
    void(api, f"/api/v1/drymill/stock-receipts/{unused.id}/")
    purge_trash(now=later())
    assert HqStockReceipt.history.filter(id=unused.pk, history_type="-").exists()
    assert DryMillBatch.history.filter(id=batch.pk, history_type="-").exists()


# --- Numbers are never reused ----------------------------------------------------


def test_document_numbers_not_reused_after_purge(api, gitoki_clerk, drymill_operator, gitoki, hq):
    first = make_grn(api, gitoki_clerk, gitoki)
    void(api, f"{RECEIPTS}{first['id']}/")
    receipt = stock_receipt(gitoki, net="100")
    batch = produce_green(gitoki, "15PLUS", kg="50", parch="100")
    login(api, drymill_operator)
    void(api, f"/api/v1/drymill/batches/{batch.id}/")
    void(api, f"/api/v1/drymill/stock-receipts/{receipt.id}/")

    purge_trash(now=later())
    assert not CherryReceipt.all_objects.exists()

    second = make_grn(api, gitoki_clerk, gitoki)
    assert first["grn_number"].endswith("-00001")
    assert second["grn_number"].endswith("-00002")
    new_receipt = stock_receipt(gitoki, net="100")
    assert new_receipt.receipt_number != receipt.receipt_number
    new_batch = produce_green(gitoki, "15PLUS", kg="50", parch="100")
    assert new_batch.batch_no != batch.batch_no
    assert int(new_batch.batch_no.rsplit("-", 1)[1]) > int(batch.batch_no.rsplit("-", 1)[1])


def test_management_command_prints_counts(api, gitoki_clerk, gitoki):
    out = StringIO()
    call_command("purge_trash", stdout=out)
    text = out.getvalue()
    assert "GRN: 0 purged, 0 kept" in text
    assert "Total: 0 purged, 0 kept" in text

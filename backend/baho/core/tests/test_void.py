"""Voiding: soft delete with a reason, hidden from lists and reports, never reused."""

from datetime import date
from decimal import Decimal

import pytest

from baho.drymill.models import ExportGrade
from baho.farmers.models import Farmer
from baho.reception.models import CherryReceipt
from tests.helpers import login

pytestmark = pytest.mark.django_db
RECEIPTS = "/api/v1/reception/receipts/"


@pytest.fixture
def receipt_id(api, gitoki_clerk, gitoki):
    farmer = Farmer.objects.create(farmer_code="GITOKI-F00001", full_name="J", home_facility=gitoki)
    login(api, gitoki_clerk)
    res = api.post(
        RECEIPTS,
        {
            "facility": str(gitoki.id),
            "farmer": str(farmer.id),
            "received_on": date.today().isoformat(),
            "lines": [{"cherry_grade": "GOOD", "quantity_kg": "10", "price_per_kg": "500"}],
        },
        format="json",
    )
    return res.data["id"]


def test_void_requires_a_reason(api, receipt_id):
    res = api.post(f"{RECEIPTS}{receipt_id}/void/", {"reason": ""})
    assert res.status_code == 400
    assert "reason" in res.data


def test_voided_receipt_disappears_but_is_kept(api, receipt_id):
    res = api.post(f"{RECEIPTS}{receipt_id}/void/", {"reason": "Entered twice"})
    assert res.status_code == 200, res.data
    assert api.get(RECEIPTS).data["count"] == 0
    kept = CherryReceipt.all_objects.get(pk=receipt_id)
    assert kept.is_deleted and kept.void_reason == "Entered twice"


def test_grn_number_is_not_reused_after_void(api, receipt_id, gitoki):
    api.post(f"{RECEIPTS}{receipt_id}/void/", {"reason": "Mistake"})
    farmer = Farmer.objects.get(farmer_code="GITOKI-F00001")
    res = api.post(
        RECEIPTS,
        {
            "facility": str(gitoki.id),
            "farmer": str(farmer.id),
            "received_on": date.today().isoformat(),
            "lines": [{"cherry_grade": "GOOD", "quantity_kg": "5", "price_per_kg": "500"}],
        },
        format="json",
    )
    assert res.data["grn_number"].endswith("-00002")


def test_other_station_cannot_void(api, receipt_id, bugoyi_clerk):
    login(api, bugoyi_clerk)
    assert api.post(f"{RECEIPTS}{receipt_id}/void/", {"reason": "nope"}).status_code == 404


def test_read_only_role_cannot_void(api, receipt_id, hq_finance):
    login(api, hq_finance)
    assert api.post(f"{RECEIPTS}{receipt_id}/void/", {"reason": "nope"}).status_code == 403


def test_voided_batch_and_shipment_leave_the_dashboards(
    api, drymill_operator, export_manager, gitoki
):
    g15 = ExportGrade.objects.get(code="15PLUS")
    login(api, drymill_operator)
    batch = api.post(
        "/api/v1/drymill/batches/",
        {
            "origin_type": "OWN_CWS",
            "source_facility": str(gitoki.id),
            "process_product": "FW",
            "parch_input_kg": "1000",
            "outputs": [{"export_grade": str(g15.id), "qty_kg": "700"}],
        },
        format="json",
    ).data
    login(api, export_manager)
    client = api.post("/api/v1/sales/clients/", {"name": "RTC"}).data
    shipment = api.post(
        "/api/v1/sales/shipments/",
        {
            "client": client["id"],
            "lines": [{"process_product": "FW", "export_grade": str(g15.id), "qty_kg": "200"}],
        },
        format="json",
    ).data
    assert Decimal(api.get("/api/v1/reporting/drymill/export/").data["stock_balance_kg"]) == 500

    assert (
        api.post(
            f"/api/v1/sales/shipments/{shipment['id']}/void/", {"reason": "Cancelled"}
        ).status_code
        == 200
    )
    login(api, drymill_operator)
    assert (
        api.post(
            f"/api/v1/drymill/batches/{batch['id']}/void/", {"reason": "Wrong entry"}
        ).status_code
        == 200
    )

    data = api.get("/api/v1/reporting/drymill/export/").data
    assert (data["produced_kg"], data["exported_kg"], data["stock_balance_kg"]) == (0, 0, 0)
    assert api.get("/api/v1/reporting/drymill/processing/").data["totals"]["green_output_kg"] == 0


def test_only_planned_shipments_can_be_voided(api, export_manager):
    g15 = ExportGrade.objects.get(code="15PLUS")
    login(api, export_manager)
    client = api.post("/api/v1/sales/clients/", {"name": "RTC"}).data
    shipment = api.post(
        "/api/v1/sales/shipments/",
        {
            "client": client["id"],
            "status": "SHIPPED",
            "lines": [{"process_product": "FW", "export_grade": str(g15.id), "qty_kg": "1"}],
        },
        format="json",
    ).data
    res = api.post(f"/api/v1/sales/shipments/{shipment['id']}/void/", {"reason": "x" * 5})
    assert res.status_code == 400


def test_receipt_date_range_filter(api, receipt_id):
    today = date.today().isoformat()
    assert api.get(f"{RECEIPTS}?received_on__gte={today}").data["count"] == 1
    assert api.get(f"{RECEIPTS}?received_on__lte=2000-01-01").data["count"] == 0

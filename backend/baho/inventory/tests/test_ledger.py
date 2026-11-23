from datetime import date, timedelta
from decimal import Decimal

import pytest

from baho.drymill.models import ExportGrade
from baho.drymill.services import adjust_stock
from baho.sales.models import Client
from baho.sales.services import create_shipment
from tests.factories import produce_green, stock_receipt
from tests.helpers import login

pytestmark = pytest.mark.django_db
URL = "/api/v1/inventory/ledger/"


def D(value) -> Decimal:  # noqa: N802
    return Decimal(str(value))


@pytest.fixture
def movements(gitoki, hq):
    """Receipt of 1000 kg parchment, a batch milling 600 kg into 450 kg 15+,
    a -20 kg adjustment, then 100 kg of 15+ shipped."""
    today = date.today()
    receipt = stock_receipt(gitoki, net="1050", bags="50", arrival_date=today - timedelta(days=3))
    batch = produce_green(gitoki, "15PLUS", kg="450", parch="600")
    adjust_stock(user=None, receipt=receipt, qty_kg=D("-20"), reason="moisture loss")
    create_shipment(
        user=None,
        client=Client.objects.create(name="VOLCAFE"),
        delivery_to_naeb_date=today,
        lines=[{"export_grade": ExportGrade.objects.get(code="15PLUS"), "qty_kg": D("100")}],
    )
    return receipt, batch


def test_parchment_ledger_balances_match_receipts(api, drymill_operator, movements):
    login(api, drymill_operator)
    res = api.get(URL, {"item_type": "PARCH"})
    assert res.status_code == 200, res.data
    types = [r["movement_type"] for r in res.data["rows"]]
    assert types.count("RECEIVED") == 2  # the fixture receipt + the one produce_green milled
    assert "MILLED" in types and "ADJUSTMENT" in types
    # 1000 + 600 received, 600 milled, 20 adjusted away
    assert D(res.data["total_in"]) == D("1600")
    assert D(res.data["total_out"]) == D("620")
    assert D(res.data["closing_balance"]) == D("980")
    assert D(res.data["rows"][-1]["balance"]) == D("980")


def test_ledger_agrees_with_receipt_stock_balances(api, drymill_operator, movements):
    from django.db.models import Sum

    from baho.drymill.models import HqStockReceipt

    login(api, drymill_operator)
    res = api.get(URL, {"item_type": "PARCH"})
    expected = HqStockReceipt.objects.aggregate(v=Sum("stock_balance_kg"))["v"]
    assert D(res.data["closing_balance"]) == expected


def test_green_ledger(api, drymill_operator, movements):
    login(api, drymill_operator)
    res = api.get(URL, {"item_type": "GREEN"})
    assert [r["movement_type"] for r in res.data["rows"]] == ["GREEN_PRODUCED", "SHIPPED"]
    assert D(res.data["closing_balance"]) == D("350")
    assert res.data["rows"][1]["description"].startswith("VOLCAFE")


def test_green_ledger_filtered_by_grade(api, drymill_operator, movements, gitoki):
    produce_green(gitoki, "1314", kg="70", parch="100")
    login(api, drymill_operator)
    grade = ExportGrade.objects.get(code="1314")
    res = api.get(URL, {"item_type": "GREEN", "export_grade": str(grade.id)})
    assert D(res.data["closing_balance"]) == D("70")


def test_opening_balance_carries_earlier_movements(api, drymill_operator, movements):
    login(api, drymill_operator)
    res = api.get(URL, {"item_type": "PARCH", "date_from": date.today().isoformat()})
    # The 1000 kg receipt three days ago is in the opening balance, not in the rows.
    assert D(res.data["opening_balance"]) == D("1000")
    assert all(r["date"] >= date.today() for r in res.data["rows"])
    assert D(res.data["closing_balance"]) == D("980")


def test_voided_batch_leaves_the_ledger(api, drymill_operator, movements):
    _, batch = movements
    from baho.sales.models import ExportShipment

    for shipment in ExportShipment.objects.all():
        shipment.soft_delete(user=None, reason="test")
    login(api, drymill_operator)
    assert (
        api.post(f"/api/v1/drymill/batches/{batch.id}/void/", {"reason": "oops"}).status_code == 200
    )
    res = api.get(URL, {"item_type": "GREEN"})
    assert res.data["rows"] == []


def test_cws_clerk_cannot_read_hq_ledger(api, gitoki_clerk):
    login(api, gitoki_clerk)
    assert api.get(URL).status_code == 403


def test_bad_date_range(api, drymill_operator):
    login(api, drymill_operator)
    res = api.get(URL, {"date_from": "2026-05-02", "date_to": "2026-05-01"})
    assert res.status_code == 400

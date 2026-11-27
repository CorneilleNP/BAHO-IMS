"""GRN payments: locked GRNs, full / partial / no payment, paying the balance later."""

from datetime import date
from decimal import Decimal

import pytest

from baho.farmers.models import Farmer
from baho.reception.models import CherryPayment
from tests.helpers import login

pytestmark = pytest.mark.django_db
URL = "/api/v1/reception/receipts/"
PAYMENTS = "/api/v1/reception/payments/"


@pytest.fixture
def farmer(gitoki):
    return Farmer.objects.create(
        farmer_code="GITOKI-F00001", full_name="Joseph", home_facility=gitoki
    )


def grn(api, facility, farmer, **extra):
    """100 kg x 500 + 1,000 transport + 20 kg x 200 = 55,000 RWF owed."""
    body = {
        "facility": str(facility.id),
        "farmer": str(farmer.id),
        "received_on": "2026-11-20",
        "lines": [
            {
                "cherry_grade": "GOOD",
                "quantity_kg": "100",
                "price_per_kg": "500",
                "transport_cost": "1000",
            },
            {"cherry_grade": "FLOAT", "quantity_kg": "20", "price_per_kg": "200"},
        ],
        **extra,
    }
    res = api.post(URL, body, format="json")
    assert res.status_code == 201, res.data
    return res.data


def money(value) -> Decimal:
    return Decimal(str(value))


def test_new_grn_is_not_paid(api, gitoki_clerk, gitoki, farmer):
    login(api, gitoki_clerk)
    created = grn(api, gitoki, farmer)
    assert created["payment_status"] == "UNPAID"
    assert money(created["amount_paid"]) == 0
    assert money(created["balance"]) == Decimal("55000")


def test_paid_at_weighing_pays_the_full_total(api, gitoki_clerk, gitoki, farmer):
    login(api, gitoki_clerk)
    created = grn(api, gitoki, farmer, payment_status="PAID", payment_method="MOBILE_MONEY")
    assert created["payment_status"] == "PAID"
    assert money(created["balance"]) == 0
    payment = CherryPayment.objects.get(receipt_id=created["id"])
    assert (payment.amount, payment.paid_on, payment.method) == (
        Decimal("55000"),
        date(2026, 11, 20),
        "MOBILE_MONEY",
    )


def test_partly_paid_keeps_the_rest_owed(api, gitoki_clerk, gitoki, farmer):
    login(api, gitoki_clerk)
    created = grn(
        api, gitoki, farmer, payment_status="PARTIAL", amount_paid="20000", payment_method="CASH"
    )
    assert created["payment_status"] == "PARTIAL"
    assert money(created["amount_paid"]) == Decimal("20000")
    assert money(created["balance"]) == Decimal("35000")


def test_partial_needs_an_amount(api, gitoki_clerk, gitoki, farmer):
    login(api, gitoki_clerk)
    body = {
        "facility": str(gitoki.id),
        "farmer": str(farmer.id),
        "received_on": "2026-11-20",
        "payment_status": "PARTIAL",
        "payment_method": "CASH",
        "lines": [{"cherry_grade": "GOOD", "quantity_kg": "10", "price_per_kg": "500"}],
    }
    res = api.post(URL, body, format="json")
    assert res.status_code == 400
    assert "amount_paid" in res.data


def test_paying_the_balance_in_parts(api, gitoki_clerk, gitoki, farmer):
    login(api, gitoki_clerk)
    created = grn(api, gitoki, farmer)
    pay = f"{URL}{created['id']}/pay/"

    res = api.post(pay, {"amount": "15000", "method": "CASH", "paid_on": "2026-11-22"})
    assert res.status_code == 200, res.data
    assert (res.data["payment_status"], money(res.data["balance"])) == ("PARTIAL", Decimal("40000"))

    too_much = api.post(pay, {"amount": "40001", "method": "CASH"})
    assert too_much.status_code == 400
    assert "40,000" in str(too_much.data["amount"])

    res = api.post(pay, {"amount": "40000", "method": "BANK", "reference": "TRX-9"})
    assert (res.data["payment_status"], money(res.data["balance"])) == ("PAID", Decimal("0"))
    assert res.data["payment_method"] == "BANK"
    # Paying never touched the cherry, prices or quantities.
    assert money(res.data["total_amount"]) == Decimal("55000")
    assert len(res.data["lines"]) == 2

    listed = api.get(PAYMENTS, {"receipt": created["id"]}).data["results"]
    assert [money(p["amount"]) for p in listed] == [Decimal("15000"), Decimal("40000")]


def test_station_staff_cannot_change_a_saved_grn(api, gitoki_clerk, gitoki, farmer):
    login(api, gitoki_clerk)
    created = grn(api, gitoki, farmer)
    url = f"{URL}{created['id']}/"
    for change in (
        {"lines": [{"cherry_grade": "GOOD", "quantity_kg": "500", "price_per_kg": "900"}]},
        {"received_on": "2026-11-21"},
        {"notes": "changed"},
    ):
        res = api.patch(url, change, format="json")
        assert res.status_code == 403, change
        assert "administrator" in str(res.data["detail"])


@pytest.mark.parametrize("role", ["CWS_MANAGER"])
def test_managers_also_cannot_change_a_saved_grn(api, gitoki, farmer, role):
    from tests.factories import UserFactory, assign

    manager = UserFactory(email="manager@test.local")
    assign(manager, role, gitoki)
    login(api, manager)
    created = grn(api, gitoki, farmer)
    res = api.patch(
        f"{URL}{created['id']}/",
        {"lines": [{"cherry_grade": "GOOD", "quantity_kg": "1", "price_per_kg": "1"}]},
        format="json",
    )
    assert res.status_code == 403
    # ...but may record the payment.
    res = api.post(f"{URL}{created['id']}/pay/", {"amount": "55000", "method": "CASH"})
    assert res.data["payment_status"] == "PAID"


def test_filter_by_payment_status(api, gitoki_clerk, gitoki, farmer):
    login(api, gitoki_clerk)
    grn(api, gitoki, farmer)
    grn(api, gitoki, farmer, payment_status="PARTIAL", amount_paid="1000", payment_method="CASH")
    grn(api, gitoki, farmer, payment_status="PAID", payment_method="CASH")
    statuses = {
        s: api.get(URL, {"payment_status": s}).data["count"] for s in ("PAID", "PARTIAL", "UNPAID")
    }
    assert statuses == {"PAID": 1, "PARTIAL": 1, "UNPAID": 1}
    assert api.get(URL, {"payment_status__in": "PARTIAL,UNPAID"}).data["count"] == 2


def test_only_admin_deletes_a_payment(api, gitoki_clerk, baho_admin, gitoki, farmer):
    login(api, gitoki_clerk)
    created = grn(api, gitoki, farmer, payment_status="PAID", payment_method="CASH")
    payment = api.get(PAYMENTS, {"receipt": created["id"]}).data["results"][0]
    assert api.post(f"{PAYMENTS}{payment['id']}/void/", {"reason": "wrong"}).status_code == 403
    # A GRN with payments cannot be deleted before its payments.
    login(api, baho_admin)
    assert api.post(f"{URL}{created['id']}/void/", {"reason": "dup"}).status_code == 400

    res = api.post(f"{PAYMENTS}{payment['id']}/void/", {"reason": "Paid twice by mistake"})
    assert res.status_code == 200, res.data
    assert (res.data["payment_status"], money(res.data["balance"])) == ("UNPAID", Decimal("55000"))
    assert api.post(f"{URL}{created['id']}/void/", {"reason": "dup"}).status_code == 200


def test_admin_cannot_lower_a_grn_below_what_was_paid(
    api, gitoki_clerk, baho_admin, gitoki, farmer
):
    login(api, gitoki_clerk)
    created = grn(api, gitoki, farmer, payment_status="PAID", payment_method="CASH")
    login(api, baho_admin)
    res = api.patch(
        f"{URL}{created['id']}/",
        {"lines": [{"cherry_grade": "GOOD", "quantity_kg": "10", "price_per_kg": "500"}]},
        format="json",
    )
    assert res.status_code == 400
    assert "already been paid" in str(res.data)


def test_admin_raising_a_paid_grn_makes_it_partly_paid(
    api, gitoki_clerk, baho_admin, gitoki, farmer
):
    login(api, gitoki_clerk)
    created = grn(api, gitoki, farmer, payment_status="PAID", payment_method="CASH")
    login(api, baho_admin)
    res = api.patch(
        f"{URL}{created['id']}/",
        {"lines": [{"cherry_grade": "GOOD", "quantity_kg": "120", "price_per_kg": "500"}]},
        format="json",
    )
    assert res.status_code == 200, res.data
    assert (res.data["payment_status"], money(res.data["balance"])) == ("PARTIAL", Decimal("5000"))


def test_payments_are_scoped_to_the_station(api, gitoki_clerk, bugoyi_clerk, gitoki, farmer):
    login(api, gitoki_clerk)
    created = grn(api, gitoki, farmer, payment_status="PAID", payment_method="CASH")
    login(api, bugoyi_clerk)
    assert api.get(PAYMENTS).data["count"] == 0
    res = api.post(f"{URL}{created['id']}/pay/", {"amount": "1", "method": "CASH"})
    assert res.status_code in (403, 404)

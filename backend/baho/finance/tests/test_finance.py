"""Station finance: funds given, expenses, cherry and labor payments, balance."""

from datetime import date
from decimal import Decimal

import pytest

from baho.farmers.models import Farmer
from baho.labor.services import (
    close_pay_period,
    mark_pay_period_paid,
    open_pay_period,
    record_attendance,
    register_laborer,
)
from baho.reception.services import create_cherry_receipt, record_payment
from tests.factories import UserFactory, assign
from tests.helpers import login

pytestmark = pytest.mark.django_db
BASE = "/api/v1/finance/"


def money(value) -> Decimal:
    return Decimal(str(value))


@pytest.fixture
def manager(gitoki):
    user = UserFactory(email="manager@test.local")
    assign(user, "CWS_MANAGER", gitoki)
    return user


@pytest.fixture
def fuel(api, baho_admin):
    login(api, baho_admin)
    return next(c for c in api.get(f"{BASE}categories/").data if c["code"] == "FUEL")


def give(api, facility, amount, on="2026-11-01"):
    res = api.post(
        f"{BASE}allocations/",
        {"facility": str(facility.id), "allocated_on": on, "amount": amount},
        format="json",
    )
    assert res.status_code == 201, res.data
    return res.data


def spend(api, facility, category, amount, on="2026-11-05", **extra):
    return api.post(
        f"{BASE}expenses/",
        {
            "facility": str(facility.id),
            "category": category["id"],
            "spent_on": on,
            "amount": amount,
            "description": "Generator fuel for the pulper",
            **extra,
        },
        format="json",
    )


def test_categories_are_the_station_list(api, baho_admin):
    login(api, baho_admin)
    names = [c["name"] for c in api.get(f"{BASE}categories/").data]
    assert len(names) == 20
    assert names[:3] == ["Manpower", "Wages", "Transport services"]
    assert "Staff welfare" in names
    assert names[-1] == "Other expenses"  # anything not in the list, always last


def test_other_expenses_can_be_recorded(api, manager, gitoki):
    login(api, manager)
    other = next(c for c in api.get(f"{BASE}categories/").data if c["code"] == "OTHER")
    res = spend(api, gitoki, other, "12000", description="Padlocks for the store")
    assert res.status_code == 201, res.data
    assert res.data["category_name"] == "Other expenses"


def test_manager_records_expenses_with_quantity(api, manager, gitoki, fuel):
    login(api, manager)
    res = spend(api, gitoki, fuel, "65000", quantity="50", unit="litres", unit_price="1300")
    assert res.status_code == 201, res.data
    assert res.data["expense_number"] == "EXP-GITOKI-2026-00001"
    assert (res.data["category_name"], res.data["unit"]) == ("Gasoline, Fuel and Oil", "litres")
    assert money(res.data["quantity"]) == Decimal("50")


def test_expense_needs_a_justification(api, manager, gitoki, fuel):
    login(api, manager)
    res = spend(api, gitoki, fuel, "1000", description=" ")
    assert res.status_code == 400
    assert "description" in res.data


def test_unit_price_without_quantity_is_refused(api, manager, gitoki, fuel):
    login(api, manager)
    res = spend(api, gitoki, fuel, "1000", unit_price="1300")
    assert res.status_code == 400
    assert "quantity" in res.data


def test_only_hq_corrects_or_deletes_an_expense(api, manager, baho_admin, gitoki, fuel):
    login(api, manager)
    expense = spend(api, gitoki, fuel, "1000").data
    url = f"{BASE}expenses/{expense['id']}/"
    assert api.patch(url, {"amount": "900"}, format="json").status_code == 403
    assert api.post(f"{url}void/", {"reason": "typo"}).status_code == 403
    login(api, baho_admin)
    assert api.patch(url, {"amount": "900"}, format="json").status_code == 200
    assert api.post(f"{url}void/", {"reason": "typo"}).status_code == 200


def test_clerks_have_no_finance(api, gitoki_clerk, gitoki, fuel):
    login(api, gitoki_clerk)
    assert api.get(f"{BASE}summary/").status_code == 403
    assert spend(api, gitoki, fuel, "1000").status_code == 403


def test_manager_stays_on_own_station(api, manager, bugoyi, fuel):
    login(api, manager)
    assert spend(api, bugoyi, fuel, "1000").status_code == 403


def test_only_hq_gives_funds(api, manager, hq_finance, gitoki):
    login(api, manager)
    res = api.post(
        f"{BASE}allocations/",
        {"facility": str(gitoki.id), "allocated_on": "2026-11-01", "amount": "1000"},
        format="json",
    )
    assert res.status_code == 403
    login(api, hq_finance)
    assert give(api, gitoki, "1000")["allocation_number"] == "FUND-GITOKI-2026-0001"


def paid_labor(user, facility, amount_per_day="3000", days=2):
    laborer = register_laborer(
        user=user, facility=facility, full_name="Claudine", daily_rate=Decimal(amount_per_day)
    )
    period = open_pay_period(
        user=user, facility=facility, period_start=date(2026, 11, 1), period_end=date(2026, 11, 7)
    )
    for day in range(1, days + 1):
        record_attendance(
            user=user,
            pay_period=period,
            work_date=date(2026, 11, day),
            present_laborers=[laborer.id],
        )
    close_pay_period(user=user, pay_period=period)
    return mark_pay_period_paid(user=user, pay_period=period)


def test_balance_counts_expenses_cherry_and_labor(api, baho_admin, manager, gitoki, fuel):
    login(api, baho_admin)
    give(api, gitoki, "200000")
    login(api, manager)
    spend(api, gitoki, fuel, "30000")
    farmer = Farmer.objects.create(farmer_code="G-1", full_name="Joseph", home_facility=gitoki)
    receipt = create_cherry_receipt(
        user=manager,
        facility=gitoki,
        farmer=farmer,
        received_on=date(2026, 11, 6),
        lines=[
            {"cherry_grade": "GOOD", "quantity_kg": Decimal("100"), "price_per_kg": Decimal("800")}
        ],
    )
    record_payment(
        user=manager,
        receipt=receipt,
        amount=Decimal("50000"),
        paid_on=date(2026, 11, 7),
        method="CASH",
    )
    paid_labor(manager, gitoki)  # 2 days x 3,000

    s = api.get(f"{BASE}summary/").data
    assert money(s["allocated"]) == Decimal("200000")
    assert money(s["expenses"]) == Decimal("30000")
    assert money(s["cherry_paid"]) == Decimal("50000")
    assert money(s["labor_paid"]) == Decimal("6000")
    assert money(s["spent"]) == Decimal("86000")
    assert money(s["balance"]) == Decimal("114000")
    assert money(s["owed_to_farmers"]) == Decimal("30000")  # 80,000 - 50,000 paid
    by_category = {row["label"]: money(row["amount"]) for row in s["by_category"]}
    assert by_category["Gasoline, Fuel and Oil"] == Decimal("30000")
    assert by_category["Cherry purchase (payments to farmers)"] == Decimal("50000")
    [station] = s["by_station"]
    assert (station["label"], money(station["balance"])) == ("Gitoki CWS", Decimal("114000"))


def test_balance_goes_negative_when_overspent(api, baho_admin, manager, gitoki, fuel):
    login(api, baho_admin)
    give(api, gitoki, "10000")
    login(api, manager)
    spend(api, gitoki, fuel, "25000")
    assert money(api.get(f"{BASE}summary/").data["balance"]) == Decimal("-15000")


def test_period_has_an_opening_balance(api, baho_admin, manager, gitoki, fuel):
    login(api, baho_admin)
    give(api, gitoki, "100000", on="2026-10-01")
    login(api, manager)
    spend(api, gitoki, fuel, "20000", on="2026-10-15")
    spend(api, gitoki, fuel, "5000", on="2026-11-03")

    november = api.get(
        f"{BASE}summary/", {"date_from": "2026-11-01", "date_to": "2026-11-30", "group": "week"}
    ).data
    assert money(november["opening_balance"]) == Decimal("80000")
    assert money(november["spent"]) == Decimal("5000")
    assert money(november["balance"]) == Decimal("75000")
    assert [str(p["period"]) for p in november["timeline"]] == ["2026-11-02"]  # Monday

    ledger = api.get(f"{BASE}ledger/", {"date_from": "2026-11-01"}).data
    assert money(ledger["opening_balance"]) == Decimal("80000")
    assert [money(e["balance"]) for e in ledger["entries"]] == [Decimal("75000")]
    assert money(ledger["closing_balance"]) == Decimal("75000")


def test_manager_sees_only_own_station(api, baho_admin, manager, gitoki, bugoyi):
    login(api, baho_admin)
    give(api, gitoki, "1000")
    give(api, bugoyi, "5000")
    login(api, manager)
    s = api.get(f"{BASE}summary/").data
    assert [st["name"] for st in s["stations"]] == ["Gitoki CWS"]
    assert money(s["allocated"]) == Decimal("1000")
    # The station filter never widens a manager's view.
    other = api.get(f"{BASE}summary/", {"station": str(bugoyi.id)}).data
    assert other["stations"] == [] and money(other["allocated"]) == 0

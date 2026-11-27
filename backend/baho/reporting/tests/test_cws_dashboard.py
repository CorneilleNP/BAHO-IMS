from datetime import date
from decimal import Decimal

import pytest

from baho.farmers.models import Farmer
from tests.helpers import login

pytestmark = pytest.mark.django_db
URL = "/api/v1/reporting/cws/"
RECEIPTS = "/api/v1/reception/receipts/"


def register(api, facility, name, **extra):
    res = api.post(
        "/api/v1/farmers/",
        {"full_name": name, "home_facility": str(facility.id), **extra},
        format="json",
    )
    assert res.status_code == 201, res.data
    return res.data["id"]


def deliver(api, facility, farmer_id, good_kg, price, transport="0"):
    res = api.post(
        RECEIPTS,
        {
            "facility": str(facility.id),
            "farmer": farmer_id,
            "received_on": date.today().isoformat(),
            "lines": [
                {
                    "cherry_grade": "GOOD",
                    "quantity_kg": good_kg,
                    "price_per_kg": price,
                    "transport_cost": transport,
                },
            ],
        },
        format="json",
    )
    assert res.status_code == 201, res.data
    return res.data


def test_cws_dashboard_totals_include_transport(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    farmer_id = register(
        api, gitoki, "Akingeneye Clementine", household_size=5, land_area_ha="0.250"
    )
    deliver(api, gitoki, farmer_id, good_kg="100", price="500", transport="1000")

    res = api.get(URL)
    assert res.status_code == 200, res.data
    # (100*500 + 1000) / 100 = 510 per kg, including transport in the average.
    assert Decimal(res.data["good"]["avg_cost_per_kg"]) == Decimal("510.00")
    assert Decimal(res.data["total_kg"]) == Decimal("100")
    assert res.data["by_station"] == [{"label": "Gitoki CWS", "kg": Decimal("100.00")}]
    recent = res.data["recent_receipts"][0]
    assert recent["farmer_name"] == "Akingeneye Clementine"
    assert Decimal(recent["good_kg"]) == Decimal("100")
    assert Decimal(recent["total_amount"]) == Decimal("51000")
    assert recent["payment_status"] == "UNPAID"


def test_cws_clerk_only_sees_own_station(api, gitoki_clerk, bugoyi_clerk, gitoki, bugoyi):
    login(api, gitoki_clerk)
    gitoki_farmer = register(api, gitoki, "Gitoki Farmer")
    deliver(api, gitoki, gitoki_farmer, good_kg="50", price="500")

    login(api, bugoyi_clerk)
    bugoyi_farmer = register(api, bugoyi, "Bugoyi Farmer")
    deliver(api, bugoyi, bugoyi_farmer, good_kg="30", price="400")

    res = api.get(URL)
    assert Decimal(res.data["total_kg"]) == Decimal("30")
    assert res.data["by_station"] == [{"label": "Bugoyi CWS", "kg": Decimal("30.00")}]
    assert [r["farmer_name"] for r in res.data["recent_receipts"]] == ["Bugoyi Farmer"]


def test_admin_sees_every_station(api, hq_finance, gitoki_clerk, bugoyi_clerk, gitoki, bugoyi):
    login(api, gitoki_clerk)
    deliver(api, gitoki, register(api, gitoki, "Gitoki Farmer"), good_kg="50", price="500")
    login(api, bugoyi_clerk)
    deliver(api, bugoyi, register(api, bugoyi, "Bugoyi Farmer"), good_kg="30", price="400")

    login(api, hq_finance)
    res = api.get(URL)
    assert Decimal(res.data["total_kg"]) == Decimal("80")
    assert {row["label"] for row in res.data["by_station"]} == {"Gitoki CWS", "Bugoyi CWS"}
    assert len(res.data["recent_receipts"]) == 2


def test_household_and_land_area_are_optional(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    farmer_id = register(api, gitoki, "No Extra Details")
    farmer = Farmer.objects.get(pk=farmer_id)
    assert farmer.household_size is None
    assert farmer.land_area_ha is None


def test_station_filter_narrows_everything(
    api, baho_admin, gitoki, bugoyi, gitoki_clerk, bugoyi_clerk
):
    from datetime import date
    from decimal import Decimal

    from baho.farmers.services import register_farmer
    from baho.reception.services import create_cherry_receipt

    for clerk, station, kg in ((gitoki_clerk, gitoki, "100"), (bugoyi_clerk, bugoyi, "40")):
        farmer = register_farmer(
            user=clerk, home_facility=station, full_name=f"Farmer {station.code}"
        )
        create_cherry_receipt(
            user=clerk,
            facility=station,
            farmer=farmer,
            received_on=date.today(),
            lines=[
                {"cherry_grade": "GOOD", "quantity_kg": Decimal(kg), "price_per_kg": Decimal("500")}
            ],
        )
    login(api, baho_admin)
    all_ = api.get("/api/v1/reporting/cws/").data
    only = api.get("/api/v1/reporting/cws/", {"station": str(bugoyi.id)}).data
    assert Decimal(all_["total_kg"]) == Decimal("140")
    assert Decimal(only["total_kg"]) == Decimal("40")
    assert [r["label"] for r in only["by_station"]] == [bugoyi.name]
    assert [r["facility_name"] for r in only["recent_receipts"]] == [bugoyi.name]

    # A station clerk cannot widen their view with the filter.
    login(api, gitoki_clerk)
    other = api.get("/api/v1/reporting/cws/", {"station": str(bugoyi.id)}).data
    assert Decimal(other["total_kg"]) == Decimal("0")
    assert other["recent_receipts"] == []


def test_dashboard_shows_paid_and_still_owed(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    farmer_id = register(api, gitoki, "Payee")
    first = deliver(api, gitoki, farmer_id, good_kg="100", price="500")  # 50,000
    deliver(api, gitoki, farmer_id, good_kg="10", price="500")  # 5,000
    api.post(f"{RECEIPTS}{first['id']}/pay/", {"amount": "20000", "method": "CASH"})

    res = api.get(URL).data
    assert Decimal(res["total_amount"]) == Decimal("55000")
    assert Decimal(res["amount_paid"]) == Decimal("20000")
    assert Decimal(res["amount_owed"]) == Decimal("35000")
    assert res["payment_status_counts"] == {"PAID": 0, "PARTIAL": 1, "UNPAID": 1}
    latest = {r["grn_number"]: r for r in res["recent_receipts"]}[first["grn_number"]]
    assert Decimal(latest["balance"]) == Decimal("30000")

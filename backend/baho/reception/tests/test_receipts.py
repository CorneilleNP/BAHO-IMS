from datetime import date
from decimal import Decimal

import pytest

from baho.farmers.models import Farmer
from tests.helpers import login

pytestmark = pytest.mark.django_db
URL = "/api/v1/reception/receipts/"


@pytest.fixture
def farmer(gitoki):
    return Farmer.objects.create(
        farmer_code="GITOKI-F00001", full_name="Joseph", home_facility=gitoki
    )


def receipt_payload(facility, farmer, **extra):
    return {
        "facility": str(facility.id),
        "farmer": str(farmer.id),
        "received_on": date.today().isoformat(),
        "payment_method": "CASH",
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


def test_receipt_gets_grn_and_totals(api, gitoki_clerk, gitoki, farmer):
    login(api, gitoki_clerk)
    res = api.post(URL, receipt_payload(gitoki, farmer), format="json")
    assert res.status_code == 201, res.data
    assert res.data["grn_number"] == f"GITOKI-{date.today().year}-00001"
    assert Decimal(res.data["total_kg"]) == Decimal("120")
    # 100*500 + 1000 transport + 20*200
    assert Decimal(res.data["total_amount"]) == Decimal("55000")
    good = next(line for line in res.data["lines"] if line["cherry_grade"] == "GOOD")
    assert Decimal(good["line_amount"]) == Decimal("50000")


def test_grn_numbers_increase(api, gitoki_clerk, gitoki, farmer):
    login(api, gitoki_clerk)
    api.post(URL, receipt_payload(gitoki, farmer), format="json")
    res = api.post(URL, receipt_payload(gitoki, farmer), format="json")
    assert res.data["grn_number"].endswith("-00002")


def test_receipt_without_quantities_is_rejected(api, gitoki_clerk, gitoki, farmer):
    login(api, gitoki_clerk)
    payload = receipt_payload(gitoki, farmer)
    for line in payload["lines"]:
        line["quantity_kg"] = "0"
    res = api.post(URL, payload, format="json")
    assert res.status_code == 400
    assert "lines" in res.data


def test_clerk_cannot_record_receipt_at_another_station(api, bugoyi_clerk, gitoki, farmer):
    login(api, bugoyi_clerk)
    assert api.post(URL, receipt_payload(gitoki, farmer), format="json").status_code == 403


def test_hq_finance_can_read_but_not_write(api, hq_finance, gitoki, farmer):
    login(api, hq_finance)
    assert api.get(URL).status_code == 200
    assert api.post(URL, receipt_payload(gitoki, farmer), format="json").status_code == 403


def test_date_outside_any_crop_year_is_rejected(api, gitoki_clerk, gitoki, farmer):
    login(api, gitoki_clerk)
    res = api.post(URL, receipt_payload(gitoki, farmer, received_on="1999-05-01"), format="json")
    assert res.status_code == 400

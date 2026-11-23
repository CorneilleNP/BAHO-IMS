import pytest

from tests.helpers import login

pytestmark = pytest.mark.django_db
URL = "/api/v1/farmers/"


def register(api, facility, **extra):
    return api.post(
        URL, {"full_name": "Mbonayezu Joseph", "home_facility": str(facility.id), **extra}
    )


def test_clerk_registers_farmer_with_automatic_code(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    first = register(api, gitoki, phone="0721343545")
    second = register(api, gitoki, full_name="Ntawiheba Jean")
    assert first.status_code == 201, first.data
    assert first.data["farmer_code"] == "GITOKI-F00001"
    assert second.data["farmer_code"] == "GITOKI-F00002"


def test_clerk_cannot_register_farmer_at_another_station(api, gitoki_clerk, bugoyi):
    login(api, gitoki_clerk)
    assert register(api, bugoyi).status_code == 403


def test_farmer_list_is_limited_to_own_station(api, gitoki_clerk, bugoyi_clerk, gitoki, bugoyi):
    login(api, gitoki_clerk)
    register(api, gitoki)
    login(api, bugoyi_clerk)
    register(api, bugoyi, full_name="Bugoyi Farmer")
    names = [f["full_name"] for f in api.get(URL).data["results"]]
    assert names == ["Bugoyi Farmer"]


def test_duplicate_national_id_is_rejected(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    assert register(api, gitoki, national_id="1199080012345678").status_code == 201
    res = register(api, gitoki, full_name="Someone Else", national_id="1199080012345678")
    assert res.status_code == 400
    assert "national_id" in res.data


def test_dry_mill_operator_cannot_see_farmers(api, drymill_operator):
    login(api, drymill_operator)
    assert api.get(URL).status_code == 403


def test_records_posted_as_form_data_are_active(api, gitoki_clerk, gitoki):
    """Regression: a missing is_active in form-encoded input used to mean False."""
    login(api, gitoki_clerk)
    assert register(api, gitoki).data["is_active"] is True


def _grn(clerk, facility, farmer_id, good="100", float_="20"):
    from datetime import date
    from decimal import Decimal

    from baho.farmers.models import Farmer
    from baho.reception.services import create_cherry_receipt

    return create_cherry_receipt(
        user=clerk,
        facility=facility,
        farmer=Farmer.objects.get(pk=farmer_id),
        received_on=date.today(),
        lines=[
            {"cherry_grade": "GOOD", "quantity_kg": Decimal(good), "price_per_kg": Decimal("500")},
            {
                "cherry_grade": "FLOAT",
                "quantity_kg": Decimal(float_),
                "price_per_kg": Decimal("200"),
            },
        ],
    )


def test_clerk_edits_farmer(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    farmer = register(api, gitoki).data
    res = api.patch(f"{URL}{farmer['id']}/", {"phone": "0788123456", "household_size": 5})
    assert res.status_code == 200, res.data
    assert res.data["phone"] == "0788123456"
    assert res.data["household_size"] == 5
    assert res.data["farmer_code"] == farmer["farmer_code"]


def test_clerk_cannot_move_farmer_to_another_station(api, gitoki_clerk, gitoki, bugoyi):
    login(api, gitoki_clerk)
    farmer = register(api, gitoki).data
    res = api.patch(f"{URL}{farmer['id']}/", {"home_facility": str(bugoyi.id)})
    assert res.status_code == 403


def test_edit_cannot_take_another_farmers_national_id(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    register(api, gitoki, national_id="1199080012345678")
    other = register(api, gitoki, full_name="Other", national_id="").data
    res = api.patch(f"{URL}{other['id']}/", {"national_id": "1199080012345678"})
    assert res.status_code == 400


def test_farmers_cannot_be_deleted(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    farmer = register(api, gitoki).data
    assert api.delete(f"{URL}{farmer['id']}/").status_code == 405


def test_list_shows_delivery_totals_excluding_voided(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    farmer = register(api, gitoki).data
    _grn(gitoki_clerk, gitoki, farmer["id"])
    voided = _grn(gitoki_clerk, gitoki, farmer["id"], good="999")
    voided.soft_delete(user=gitoki_clerk, reason="typo")
    row = api.get(URL).data["results"][0]
    assert row["grn_count"] == 1
    assert row["delivered_kg"] == "120.00"
    assert row["last_delivery"] is not None


def test_farmer_deliveries(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    farmer = register(api, gitoki).data
    grn = _grn(gitoki_clerk, gitoki, farmer["id"])
    res = api.get(f"{URL}{farmer['id']}/deliveries/")
    assert res.status_code == 200
    assert res.data[0]["grn_number"] == grn.grn_number
    assert res.data[0]["good_kg"] == "100.00"
    assert res.data[0]["float_kg"] == "20.00"


def test_other_station_cannot_see_deliveries(api, gitoki_clerk, bugoyi_clerk, gitoki):
    login(api, gitoki_clerk)
    farmer = register(api, gitoki).data
    login(api, bugoyi_clerk)
    assert api.get(f"{URL}{farmer['id']}/deliveries/").status_code == 404

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

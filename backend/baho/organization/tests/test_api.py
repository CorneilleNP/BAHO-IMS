import pytest

from tests.helpers import login

pytestmark = pytest.mark.django_db

URL = "/api/v1/organization/facilities/"


def test_any_signed_in_user_can_list_facilities(api, gitoki_clerk, bugoyi):
    login(api, gitoki_clerk)
    res = api.get(URL)
    assert res.status_code == 200
    assert {f["code"] for f in res.data["results"]} == {"GITOKI", "BUGOYI"}


def test_clerk_cannot_create_facility(api, gitoki_clerk):
    login(api, gitoki_clerk)
    res = api.post(URL, {"code": "NEW", "name": "New CWS", "facility_type": "CWS"})
    assert res.status_code == 403


def test_admin_can_create_facility(api, baho_admin):
    login(api, baho_admin)
    res = api.post(URL, {"code": "NEW", "name": "New CWS", "facility_type": "CWS"})
    assert res.status_code == 201, res.data


def test_facilities_cannot_be_deleted_via_api(api, baho_admin, gitoki):
    login(api, baho_admin)
    assert api.delete(f"{URL}{gitoki.id}/").status_code == 405


def test_crop_year_end_before_start_is_rejected(api, baho_admin):
    login(api, baho_admin)
    res = api.post(
        "/api/v1/organization/crop-years/",
        {"label": "2027", "start_date": "2027-12-31", "end_date": "2027-01-01"},
    )
    assert res.status_code == 400
    assert "end_date" in res.data


def test_openapi_schema_builds(api, baho_admin):
    login(api, baho_admin)
    assert api.get("/api/schema/").status_code == 200

import pytest

from baho.organization.models import AdminUnit
from tests.helpers import login

pytestmark = pytest.mark.django_db
URL = "/api/v1/organization/admin-units/"


def test_full_rwanda_hierarchy_is_loaded():
    counts = {
        lvl: AdminUnit.objects.filter(level=lvl).count() for lvl, _ in AdminUnit.Level.choices
    }
    assert counts == {"PROVINCE": 5, "DISTRICT": 30, "SECTOR": 416, "CELL": 2149, "VILLAGE": 14837}


def test_cascading_lists(api, gitoki_clerk):
    login(api, gitoki_clerk)
    provinces = api.get(URL).data
    assert [p["name"] for p in provinces] == [
        "Eastern Province",
        "Kigali City",
        "Northern Province",
        "Southern Province",
        "Western Province",
    ]
    west = next(p for p in provinces if p["name"] == "Western Province")
    districts = [d["name"] for d in api.get(f"{URL}?parent={west['id']}").data]
    assert "Rubavu" in districts and len(districts) == 7


def test_search_returns_path_label(api, gitoki_clerk):
    login(api, gitoki_clerk)
    hits = api.get(f"{URL}?search=Bugoyi&level=VILLAGE").data
    assert hits[0]["label"] == "Bugoyi, Bugoyi, Gisenyi, Rubavu"


def test_path_of_a_village(api, gitoki_clerk):
    login(api, gitoki_clerk)
    village = AdminUnit.objects.get(name="Bugoyi", level="VILLAGE")
    path = api.get(f"{URL}{village.id}/path/").data
    assert path["province"]["name"] == "Western Province"
    assert path["district"]["name"] == "Rubavu"
    assert path["village"]["id"] == str(village.id)


def test_farmer_location_round_trip(api, gitoki_clerk, gitoki):
    """Farmers store one location id and get the whole path back."""
    login(api, gitoki_clerk)
    village = AdminUnit.objects.get(name="Bugoyi", level="VILLAGE")
    res = api.post(
        "/api/v1/farmers/",
        {"full_name": "Uwase Marie", "home_facility": str(gitoki.id), "location": str(village.id)},
    )
    assert res.status_code == 201, res.data
    assert res.data["location_label"] == "Bugoyi, Bugoyi, Gisenyi, Rubavu"
    assert res.data["location_path"]["sector"]["name"] == "Gisenyi"


def test_location_may_be_partial(api, drymill_operator):
    """A supplier may only know its district."""
    login(api, drymill_operator)
    rubavu = AdminUnit.objects.get(name="Rubavu", level="DISTRICT")
    res = api.post("/api/v1/drymill/suppliers/", {"name": "Coop X", "location": str(rubavu.id)})
    assert res.status_code == 201, res.data
    assert res.data["location_path"]["district"]["name"] == "Rubavu"
    assert res.data["location_path"]["village"] is None

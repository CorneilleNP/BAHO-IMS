"""First name / last name for farmers, laborers and users (at least one required)."""

import pytest

from baho.core.names import join_name, split_full_name
from baho.farmers.models import Farmer
from baho.organization.models import AdminUnit
from tests.helpers import login

pytestmark = pytest.mark.django_db

FARMERS = "/api/v1/farmers/"
LABORERS = "/api/v1/labor/laborers/"
USERS = "/api/v1/auth/users/"


def test_helpers():
    assert join_name("  Jean ", " Bosco  Mugisha ") == "Jean Bosco Mugisha"
    assert join_name("", "Uwase") == "Uwase"
    assert split_full_name("Mbonayezu  Joseph Pierre") == ("Mbonayezu", "Joseph Pierre")
    assert split_full_name("  ") == ("", "")


def test_farmer_first_and_last_name(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    res = api.post(
        FARMERS, {"first_name": "Andrew", "last_name": "Nabaasa", "home_facility": str(gitoki.id)}
    )
    assert res.status_code == 201, res.data
    assert res.data["full_name"] == "Andrew Nabaasa"
    assert (res.data["first_name"], res.data["last_name"]) == ("Andrew", "Nabaasa")


def test_one_name_is_enough(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    res = api.post(FARMERS, {"last_name": "Uwase", "home_facility": str(gitoki.id)})
    assert res.status_code == 201, res.data
    assert res.data["full_name"] == "Uwase"


def test_a_name_is_required(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    res = api.post(FARMERS, {"first_name": " ", "last_name": "", "home_facility": str(gitoki.id)})
    assert res.status_code == 400
    assert "first_name" in res.data


def test_old_clients_sending_full_name_still_work(api, gitoki_clerk, gitoki):
    """E.g. a save queued offline by an older app version."""
    login(api, gitoki_clerk)
    res = api.post(FARMERS, {"full_name": "Mbonayezu Joseph", "home_facility": str(gitoki.id)})
    assert res.status_code == 201, res.data
    assert (res.data["first_name"], res.data["last_name"]) == ("Mbonayezu", "Joseph")


def test_edit_one_half_keeps_the_other(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    farmer = api.post(
        FARMERS, {"first_name": "Jean", "last_name": "Bosco", "home_facility": str(gitoki.id)}
    ).data
    res = api.patch(f"{FARMERS}{farmer['id']}/", {"last_name": "Habimana"})
    assert res.status_code == 200, res.data
    assert res.data["full_name"] == "Jean Habimana"
    res = api.patch(f"{FARMERS}{farmer['id']}/", {"phone": "0788000000"})
    assert res.data["full_name"] == "Jean Habimana"


def test_services_keep_full_name_in_sync(gitoki_clerk, gitoki):
    from baho.farmers.services import register_farmer

    farmer = register_farmer(user=gitoki_clerk, home_facility=gitoki, full_name="Ntawiheba  Jean")
    assert (farmer.first_name, farmer.last_name, farmer.full_name) == (
        "Ntawiheba",
        "Jean",
        "Ntawiheba Jean",
    )
    farmer.first_name = "Jeanne"
    farmer.save()
    assert Farmer.objects.get(pk=farmer.pk).full_name == "Jeanne Jean"


def test_large_land_area_is_accepted(api, gitoki_clerk, gitoki):
    """Reported: 1002 ha was refused ("no more than 3 digits before the decimal point")."""
    login(api, gitoki_clerk)
    res = api.post(
        FARMERS,
        {"first_name": "Andrew", "home_facility": str(gitoki.id), "land_area_ha": "1002.5"},
    )
    assert res.status_code == 201, res.data
    assert res.data["land_area_ha"] == "1002.500"


def test_laborer_names_and_location(api, gitoki_clerk, gitoki):
    village = AdminUnit.objects.filter(level=AdminUnit.Level.VILLAGE).first()
    login(api, gitoki_clerk)
    res = api.post(
        LABORERS,
        {
            "facility": str(gitoki.id),
            "first_name": "Claudine",
            "last_name": "Mukamana",
            "daily_rate": "1500",
            "location": village.id if village else None,
        },
        format="json",
    )
    assert res.status_code == 201, res.data
    assert res.data["full_name"] == "Claudine Mukamana"
    if village:
        assert res.data["location"] == village.id
        assert res.data["location_label"]
    res = api.patch(f"{LABORERS}{res.data['id']}/", {"first_name": "Claudette"}, format="json")
    assert res.status_code == 200, res.data
    assert res.data["full_name"] == "Claudette Mukamana"


def test_user_first_and_last_name(api, baho_admin):
    login(api, baho_admin)
    res = api.post(
        USERS,
        {
            "email": "new.user@test.local",
            "first_name": "Aline",
            "last_name": "Uwimana",
            "password": "Temp-Pass-2026",
            "roles": [{"role": "HQ_FINANCE"}],
        },
        format="json",
    )
    assert res.status_code == 201, res.data
    assert res.data["full_name"] == "Aline Uwimana"
    res = api.patch(f"{USERS}{res.data['id']}/", {"last_name": "Mukeshimana"}, format="json")
    assert res.status_code == 200, res.data
    assert res.data["full_name"] == "Aline Mukeshimana"


def test_user_needs_a_name(api, baho_admin):
    login(api, baho_admin)
    res = api.post(
        USERS,
        {"email": "x@test.local", "password": "Temp-Pass-2026", "roles": [{"role": "HQ_FINANCE"}]},
        format="json",
    )
    assert res.status_code == 400
    assert "first_name" in res.data

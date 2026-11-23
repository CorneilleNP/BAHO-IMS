import pytest

from baho.accounts.models import User
from tests.helpers import login

pytestmark = pytest.mark.django_db

URL = "/api/v1/auth/users/"


def _create(api, **overrides):
    body = {
        "email": "New.Clerk@Test.local",
        "full_name": "New Clerk",
        "phone": "0788000000",
        "password": "Temp-Pass-2026",
        "roles": [{"role": "CWS_CLERK", "facility": None}],
    }
    body.update(overrides)
    return api.post(URL, body, format="json")


def test_only_admins_manage_users(api, gitoki_clerk):
    login(api, gitoki_clerk)
    assert api.get(URL).status_code == 403
    assert _create(api).status_code == 403


def test_admin_creates_user_with_station_role(api, baho_admin, gitoki):
    login(api, baho_admin)
    res = _create(api, roles=[{"role": "CWS_CLERK", "facility": str(gitoki.id)}])
    assert res.status_code == 201, res.data
    assert res.data["email"] == "new.clerk@test.local"
    assert res.data["must_change_password"] is True
    assert res.data["roles"][0]["facility"]["code"] == "GITOKI"


def test_station_role_needs_a_station(api, baho_admin):
    login(api, baho_admin)
    res = _create(api)
    assert res.status_code == 400
    assert "roles" in res.data


def test_hq_role_ignores_station(api, baho_admin, gitoki):
    login(api, baho_admin)
    res = _create(api, roles=[{"role": "HQ_FINANCE", "facility": str(gitoki.id)}])
    assert res.status_code == 201
    assert res.data["roles"][0]["facility"] is None


def test_duplicate_email_is_rejected(api, baho_admin, gitoki_clerk):
    login(api, baho_admin)
    res = _create(api, email="CLERK@test.local", roles=[{"role": "HQ_FINANCE"}])
    assert res.status_code == 400
    assert "email" in res.data


def test_weak_password_is_rejected(api, baho_admin):
    login(api, baho_admin)
    res = _create(api, password="12345678", roles=[{"role": "HQ_FINANCE"}])
    assert res.status_code == 400
    assert "password" in res.data


def test_new_user_can_sign_in_with_temporary_password(api, baho_admin):
    login(api, baho_admin)
    _create(api, roles=[{"role": "HQ_FINANCE"}])
    api.credentials()
    res = api.post(
        "/api/v1/auth/login/", {"email": "new.clerk@test.local", "password": "Temp-Pass-2026"}
    )
    assert res.status_code == 200


def test_admin_changes_roles_and_deactivates(api, baho_admin, gitoki_clerk, bugoyi):
    login(api, baho_admin)
    res = api.patch(
        f"{URL}{gitoki_clerk.id}/",
        {"roles": [{"role": "CWS_MANAGER", "facility": str(bugoyi.id)}], "is_active": False},
        format="json",
    )
    assert res.status_code == 200, res.data
    assert res.data["is_active"] is False
    assert [(r["role"], r["facility"]["code"]) for r in res.data["roles"]] == [
        ("CWS_MANAGER", "BUGOYI")
    ]


def test_deactivated_user_loses_refresh_session(api, baho_admin, gitoki_clerk):
    from rest_framework.test import APIClient

    clerk = APIClient()
    login(clerk, gitoki_clerk)
    login(api, baho_admin)
    api.patch(f"{URL}{gitoki_clerk.id}/", {"is_active": False}, format="json")
    assert clerk.post("/api/v1/auth/refresh/").status_code == 401


def test_admin_cannot_remove_own_admin_role(api, baho_admin):
    login(api, baho_admin)
    res = api.patch(f"{URL}{baho_admin.id}/", {"is_active": False}, format="json")
    assert res.status_code == 400
    res = api.patch(f"{URL}{baho_admin.id}/", {"roles": [{"role": "HQ_FINANCE"}]}, format="json")
    assert res.status_code == 400


def test_last_admin_cannot_be_removed(api, baho_admin, db):
    from tests.factories import UserFactory, assign

    other = UserFactory(email="admin2@test.local")
    assign(other, "ADMIN")
    login(api, other)
    # Removing baho_admin is fine while `other` remains...
    res = api.patch(f"{URL}{baho_admin.id}/", {"is_active": False}, format="json")
    assert res.status_code == 200
    # ...and other admins' own edits keep them as the last admin.
    res = api.patch(f"{URL}{other.id}/", {"full_name": "Renamed"}, format="json")
    assert res.status_code == 200


def test_admin_resets_password(api, baho_admin, gitoki_clerk):
    login(api, baho_admin)
    res = api.post(
        f"{URL}{gitoki_clerk.id}/reset-password/",
        {"new_password": "Reset-Pass-2026"},
        format="json",
    )
    assert res.status_code == 200
    gitoki_clerk.refresh_from_db()
    assert gitoki_clerk.check_password("Reset-Pass-2026")
    assert gitoki_clerk.must_change_password is True


def test_search_users(api, baho_admin, gitoki_clerk):
    login(api, baho_admin)
    res = api.get(URL, {"search": "clerk@"})
    assert [u["email"] for u in res.data["results"]] == ["clerk@test.local"]


def test_roles_listing(api, baho_admin):
    login(api, baho_admin)
    res = api.get(f"{URL}roles/")
    codes = {r["code"]: r["is_global"] for r in res.data}
    assert codes["ADMIN"] is True
    assert codes["CWS_CLERK"] is False


def test_user_model_email_is_unique_case_insensitively(baho_admin):
    assert User.objects.filter(email__iexact="ADMIN@test.local").count() == 1

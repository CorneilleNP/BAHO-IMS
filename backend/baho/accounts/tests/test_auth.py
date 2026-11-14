import jwt
import pytest

from tests.helpers import login

pytestmark = pytest.mark.django_db


def test_login_returns_tokens_with_role_claims(api, gitoki_clerk, gitoki):
    data = login(api, gitoki_clerk)
    claims = jwt.decode(data["access"], options={"verify_signature": False})
    assert claims["roles"] == ["CWS_CLERK"]
    assert claims["facility_ids"] == [str(gitoki.id)]
    assert claims["is_global"] is False


def test_login_with_wrong_password_is_rejected(api, gitoki_clerk):
    res = api.post("/api/v1/auth/login/", {"email": gitoki_clerk.email, "password": "nope"})
    assert res.status_code == 401


def test_inactive_user_cannot_login(api, gitoki_clerk):
    gitoki_clerk.is_active = False
    gitoki_clerk.save()
    res = api.post("/api/v1/auth/login/", {"email": gitoki_clerk.email, "password": "pass12345!"})
    assert res.status_code == 401


def test_me_requires_authentication(api):
    assert api.get("/api/v1/auth/me/").status_code == 401


def test_me_lists_roles_and_facilities(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    res = api.get("/api/v1/auth/me/")
    assert res.status_code == 200
    assert res.data["is_global"] is False
    assert res.data["roles"][0]["role"] == "CWS_CLERK"
    assert res.data["roles"][0]["facility"]["code"] == "GITOKI"


def test_refresh_issues_new_access_token(api, gitoki_clerk):
    data = login(api, gitoki_clerk)
    res = api.post("/api/v1/auth/refresh/", {"refresh": data["refresh"]})
    assert res.status_code == 200
    assert "access" in res.data

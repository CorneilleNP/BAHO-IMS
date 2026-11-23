import jwt
import pytest
from django.conf import settings

from tests.helpers import login

pytestmark = pytest.mark.django_db

COOKIE = settings.REFRESH_COOKIE_NAME


def test_login_returns_tokens_with_role_claims(api, gitoki_clerk, gitoki):
    data = login(api, gitoki_clerk)
    claims = jwt.decode(data["access"], options={"verify_signature": False})
    assert claims["roles"] == ["CWS_CLERK"]
    assert claims["facility_ids"] == [str(gitoki.id)]
    assert claims["is_global"] is False


def test_login_puts_refresh_token_in_httponly_cookie_only(api, gitoki_clerk):
    res = api.post("/api/v1/auth/login/", {"email": gitoki_clerk.email, "password": "pass12345!"})
    assert res.status_code == 200
    assert "refresh" not in res.data
    cookie = res.cookies[COOKIE]
    assert cookie["httponly"]
    assert cookie["path"] == settings.REFRESH_COOKIE_PATH
    assert cookie["samesite"] == "Strict"


def test_login_email_is_case_insensitive(api, gitoki_clerk):
    res = api.post(
        "/api/v1/auth/login/", {"email": "  CLERK@Test.Local ", "password": "pass12345!"}
    )
    assert res.status_code == 200


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
    assert res.data["must_change_password"] is False
    assert res.data["roles"][0]["role"] == "CWS_CLERK"
    assert res.data["roles"][0]["facility"]["code"] == "GITOKI"


def test_refresh_uses_cookie_and_rotates_it(api, gitoki_clerk):
    login(api, gitoki_clerk)
    old = api.cookies[COOKIE].value
    res = api.post("/api/v1/auth/refresh/")
    assert res.status_code == 200
    assert "access" in res.data
    new = res.cookies[COOKIE].value
    assert new and new != old


def test_rotated_refresh_token_cannot_be_reused(api, gitoki_clerk):
    login(api, gitoki_clerk)
    old = api.cookies[COOKIE].value
    assert api.post("/api/v1/auth/refresh/").status_code == 200
    api.cookies.clear()
    assert api.post("/api/v1/auth/refresh/", {"refresh": old}).status_code == 401


def test_refresh_without_token_is_rejected(api):
    assert api.post("/api/v1/auth/refresh/").status_code == 401


def test_logout_blacklists_refresh_token(api, gitoki_clerk):
    login(api, gitoki_clerk)
    refresh = api.cookies[COOKIE].value
    res = api.post("/api/v1/auth/logout/")
    assert res.status_code == 204
    assert res.cookies[COOKIE].value == ""
    assert api.post("/api/v1/auth/refresh/", {"refresh": refresh}).status_code == 401


def test_logout_without_session_still_succeeds(api):
    assert api.post("/api/v1/auth/logout/").status_code == 204


def test_login_is_throttled_per_email(api, gitoki_clerk, monkeypatch):
    from baho.accounts.throttles import LoginEmailThrottle

    monkeypatch.setattr(LoginEmailThrottle, "rate", "3/hour", raising=False)
    for _ in range(3):
        api.post("/api/v1/auth/login/", {"email": gitoki_clerk.email, "password": "wrong"})
    res = api.post("/api/v1/auth/login/", {"email": gitoki_clerk.email, "password": "pass12345!"})
    assert res.status_code == 429


def test_login_is_throttled_per_ip(api, monkeypatch):
    from baho.accounts.throttles import LoginIPThrottle

    monkeypatch.setattr(LoginIPThrottle, "rate", "2/min", raising=False)
    for i in range(2):
        api.post("/api/v1/auth/login/", {"email": f"x{i}@test.local", "password": "wrong"})
    res = api.post("/api/v1/auth/login/", {"email": "y@test.local", "password": "wrong"})
    assert res.status_code == 429


def test_change_password_requires_current_password(api, gitoki_clerk):
    login(api, gitoki_clerk)
    res = api.post(
        "/api/v1/auth/change-password/",
        {"current_password": "wrong", "new_password": "Kigali-Coffee-2026"},
    )
    assert res.status_code == 400
    assert "current_password" in res.data


def test_change_password_rejects_weak_password(api, gitoki_clerk):
    login(api, gitoki_clerk)
    res = api.post(
        "/api/v1/auth/change-password/",
        {"current_password": "pass12345!", "new_password": "12345678"},
    )
    assert res.status_code == 400
    assert "new_password" in res.data


def test_change_password_signs_out_other_sessions(api, gitoki_clerk):
    from rest_framework.test import APIClient

    other = APIClient()
    login(other, gitoki_clerk)
    login(api, gitoki_clerk)
    res = api.post(
        "/api/v1/auth/change-password/",
        {"current_password": "pass12345!", "new_password": "Kigali-Coffee-2026"},
    )
    assert res.status_code == 200
    assert "access" in res.data
    # This browser got a fresh session; the other one can no longer refresh.
    assert api.post("/api/v1/auth/refresh/").status_code == 200
    assert other.post("/api/v1/auth/refresh/").status_code == 401
    gitoki_clerk.refresh_from_db()
    assert gitoki_clerk.check_password("Kigali-Coffee-2026")
    assert gitoki_clerk.must_change_password is False


MOBILE = {"HTTP_X_BAHO_CLIENT": "mobile"}


def test_mobile_login_returns_refresh_in_body_without_cookie(api, gitoki_clerk):
    res = api.post(
        "/api/v1/auth/login/",
        {"email": gitoki_clerk.email, "password": "pass12345!"},
        **MOBILE,
    )
    assert res.status_code == 200
    assert res.data["refresh"]
    assert COOKIE not in res.cookies


def test_mobile_refresh_rotates_in_body(api, gitoki_clerk):
    first = api.post(
        "/api/v1/auth/login/",
        {"email": gitoki_clerk.email, "password": "pass12345!"},
        **MOBILE,
    ).data["refresh"]
    res = api.post("/api/v1/auth/refresh/", {"refresh": first}, **MOBILE)
    assert res.status_code == 200
    assert res.data["refresh"] and res.data["refresh"] != first
    # The old one was blacklisted on rotation.
    assert api.post("/api/v1/auth/refresh/", {"refresh": first}, **MOBILE).status_code == 401


def test_mobile_logout_revokes_body_token(api, gitoki_clerk):
    refresh = api.post(
        "/api/v1/auth/login/",
        {"email": gitoki_clerk.email, "password": "pass12345!"},
        **MOBILE,
    ).data["refresh"]
    assert api.post("/api/v1/auth/logout/", {"refresh": refresh}, **MOBILE).status_code == 204
    assert api.post("/api/v1/auth/refresh/", {"refresh": refresh}, **MOBILE).status_code == 401

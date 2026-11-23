"""Offline-queue safety: a write replayed with the same Idempotency-Key happens once."""

from datetime import timedelta

import pytest
from django.utils import timezone

from baho.core.models import IdempotencyRecord
from baho.farmers.models import Farmer
from tests.helpers import login

pytestmark = pytest.mark.django_db
URL = "/api/v1/farmers/"


def post(api, key, **body):
    data = {"full_name": "Offline Farmer", **body}
    return api.post(URL, data, format="json", HTTP_IDEMPOTENCY_KEY=key)


def test_same_key_twice_creates_one_record(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    first = post(api, "k-1", home_facility=str(gitoki.id))
    second = post(api, "k-1", home_facility=str(gitoki.id))
    assert first.status_code == second.status_code == 201
    assert second.json()["id"] == first.data["id"]
    assert second["Idempotent-Replayed"] == "true"
    assert Farmer.objects.count() == 1


def test_different_keys_create_two_records(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    post(api, "k-1", home_facility=str(gitoki.id))
    post(api, "k-2", home_facility=str(gitoki.id))
    assert Farmer.objects.count() == 2


def test_validation_errors_are_replayed_too(api, gitoki_clerk, bugoyi):
    login(api, gitoki_clerk)
    first = post(api, "k-1", home_facility=str(bugoyi.id))  # not their station
    second = post(api, "k-1", home_facility=str(bugoyi.id))
    assert first.status_code == second.status_code == 403
    assert Farmer.objects.count() == 0


def test_key_reused_with_another_body_is_refused(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    post(api, "k-1", home_facility=str(gitoki.id))
    res = post(api, "k-1", home_facility=str(gitoki.id), full_name="Someone Else")
    assert res.status_code == 422
    assert Farmer.objects.count() == 1


def test_key_belongs_to_its_user(api, gitoki_clerk, gitoki, baho_admin):
    login(api, gitoki_clerk)
    post(api, "k-1", home_facility=str(gitoki.id))
    login(api, baho_admin)
    assert post(api, "k-1", home_facility=str(gitoki.id)).status_code == 422


def test_parallel_retry_while_first_is_running_gets_409(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    body = f'{{"full_name": "Offline Farmer", "home_facility": "{gitoki.id}"}}'.encode()
    import hashlib

    IdempotencyRecord.objects.create(
        key="k-1",
        user=gitoki_clerk,
        method="POST",
        path=URL,
        request_hash=hashlib.sha256(body).hexdigest(),
    )
    res = api.generic(
        "POST", URL, body, content_type="application/json", HTTP_IDEMPOTENCY_KEY="k-1"
    )
    assert res.status_code == 409


def test_abandoned_attempt_is_run_again(api, gitoki_clerk, gitoki):
    import hashlib

    login(api, gitoki_clerk)
    body = f'{{"full_name": "Offline Farmer", "home_facility": "{gitoki.id}"}}'.encode()
    record = IdempotencyRecord.objects.create(
        key="k-1",
        user=gitoki_clerk,
        method="POST",
        path=URL,
        request_hash=hashlib.sha256(body).hexdigest(),
    )
    IdempotencyRecord.objects.filter(pk=record.pk).update(
        created_at=timezone.now() - timedelta(minutes=10)
    )
    res = api.generic(
        "POST", URL, body, content_type="application/json", HTTP_IDEMPOTENCY_KEY="k-1"
    )
    assert res.status_code == 201
    assert Farmer.objects.count() == 1


def test_requests_without_key_are_unchanged(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    api.post(URL, {"full_name": "A", "home_facility": str(gitoki.id)}, format="json")
    api.post(URL, {"full_name": "A", "home_facility": str(gitoki.id)}, format="json")
    assert Farmer.objects.count() == 2
    assert IdempotencyRecord.objects.count() == 0


def test_reads_ignore_the_key(api, gitoki_clerk):
    login(api, gitoki_clerk)
    assert api.get(URL, HTTP_IDEMPOTENCY_KEY="k-1").status_code == 200
    assert IdempotencyRecord.objects.count() == 0


def test_mobile_app_origin_is_allowed_by_cors(api):
    res = api.options(
        "/api/v1/auth/login/",
        HTTP_ORIGIN="https://localhost",
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
        HTTP_ACCESS_CONTROL_REQUEST_HEADERS="idempotency-key,x-baho-client,content-type",
    )
    assert res["Access-Control-Allow-Origin"] == "https://localhost"
    assert "idempotency-key" in res["Access-Control-Allow-Headers"]


def test_resend_after_expired_session_is_not_refused(api, gitoki_clerk, gitoki):
    """Seen on the Android emulator: the app restarted offline has no access token,
    so its first resend gets 401; after renewing the session the same key must work."""
    body = {"full_name": "Offline Farmer", "home_facility": str(gitoki.id)}
    first = api.post(URL, body, format="json", HTTP_IDEMPOTENCY_KEY="k-1")
    assert first.status_code == 401
    assert IdempotencyRecord.objects.count() == 0
    login(api, gitoki_clerk)
    second = api.post(URL, body, format="json", HTTP_IDEMPOTENCY_KEY="k-1")
    assert second.status_code == 201
    assert Farmer.objects.count() == 1


def test_rate_limited_answer_is_not_stored(api, gitoki_clerk, gitoki, monkeypatch):
    from rest_framework.throttling import BaseThrottle

    from baho.farmers.api.views import FarmerViewSet

    class Always429(BaseThrottle):
        def allow_request(self, request, view):
            return False

    login(api, gitoki_clerk)
    monkeypatch.setattr(FarmerViewSet, "throttle_classes", [Always429])
    assert post(api, "k-1", home_facility=str(gitoki.id)).status_code == 429
    monkeypatch.setattr(FarmerViewSet, "throttle_classes", [])
    assert post(api, "k-1", home_facility=str(gitoki.id)).status_code == 201

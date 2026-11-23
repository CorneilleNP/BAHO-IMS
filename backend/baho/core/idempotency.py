"""Safe retries for writes: the `Idempotency-Key` request header.

The mobile app (and the web app's offline queue) saves writes made without a
connection and sends them later. A phone can lose the connection after the
server saved a record but before the answer arrived; the app then retries.
Every queued write carries a unique `Idempotency-Key`, and this middleware
makes the second attempt return the first attempt's stored response instead
of creating a duplicate GRN, farmer, attendance day...

Rules:
- Only writes (POST/PUT/PATCH/DELETE) under /api/ with the header take part.
  Requests without the header behave exactly as before.
- The key belongs to the user who first used it, the method, the path and the
  exact body. Reusing it for anything else is refused (422).
- A response is stored when it is final: success or a 4xx validation answer.
  Server errors (5xx) are not stored, so a retry runs again.
- While the first attempt is still running, a parallel retry gets 409.
- Records older than IDEMPOTENCY_TTL_DAYS are purged lazily.
"""

from __future__ import annotations

import hashlib
import logging
import random
from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.http import HttpResponse, JsonResponse
from django.utils import timezone

logger = logging.getLogger("baho.idempotency")

HEADER = "HTTP_IDEMPOTENCY_KEY"
WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
STALE_AFTER = timedelta(minutes=2)


def _ttl() -> timedelta:
    return timedelta(days=getattr(settings, "IDEMPOTENCY_TTL_DAYS", 30))


def _authenticated_user(request):
    """The JWT user of this request (DRF authenticates later, inside the view)."""
    from rest_framework.request import Request
    from rest_framework_simplejwt.authentication import JWTAuthentication

    try:
        result = JWTAuthentication().authenticate(Request(request))
    except Exception:  # noqa: BLE001 - an invalid token: the view will answer 401
        return None
    return result[0] if result else None


def _replay(record) -> HttpResponse:
    response = HttpResponse(
        record.response_body,
        status=record.status_code,
        content_type=record.content_type or "application/json",
    )
    response["Idempotent-Replayed"] = "true"
    return response


class IdempotencyMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        key = request.META.get(HEADER, "").strip()
        if not key or request.method not in WRITE_METHODS or not request.path.startswith("/api/"):
            return self.get_response(request)
        if len(key) > 100:
            return JsonResponse({"detail": "Idempotency-Key is too long."}, status=400)
        return self._handle(request, key)

    def _handle(self, request, key):
        from .models import IdempotencyRecord

        body = request.body  # read once here; Django caches it for the view
        request_hash = hashlib.sha256(body).hexdigest()
        user = _authenticated_user(request)
        user_id = getattr(user, "pk", None)

        if random.random() < 0.01:  # noqa: S311 - housekeeping, not security
            IdempotencyRecord.objects.filter(created_at__lt=timezone.now() - _ttl()).delete()

        try:
            with transaction.atomic():
                record = IdempotencyRecord.objects.create(
                    key=key,
                    user_id=user_id,
                    method=request.method,
                    path=request.path,
                    request_hash=request_hash,
                )
        except IntegrityError:
            existing = IdempotencyRecord.objects.filter(key=key).first()
            if existing is None:  # deleted between the two queries: just try again
                return self._handle(request, key)
            same_request = (
                existing.user_id == user_id
                and existing.method == request.method
                and existing.path == request.path
                and existing.request_hash == request_hash
            )
            if not same_request:
                return JsonResponse(
                    {"detail": "This Idempotency-Key was already used for a different request."},
                    status=422,
                )
            if existing.completed_at is not None:
                return _replay(existing)
            if timezone.now() - existing.created_at > STALE_AFTER:
                # The first attempt died without an answer (worker killed): run it again.
                IdempotencyRecord.objects.filter(pk=existing.pk, completed_at__isnull=True).delete()
                return self._handle(request, key)
            return JsonResponse(
                {"detail": "This request is still being processed. Try again shortly."},
                status=409,
            )

        try:
            response = self.get_response(request)
        except Exception:
            record.delete()
            raise

        if response.status_code >= 500 or getattr(response, "streaming", False):
            record.delete()  # not final: allow the retry to run for real
            return response

        if hasattr(response, "render") and not getattr(response, "is_rendered", True):
            response.render()
        record.status_code = response.status_code
        record.response_body = response.content.decode("utf-8", errors="replace")
        record.content_type = response.get("Content-Type", "")
        record.completed_at = timezone.now()
        record.save(update_fields=["status_code", "response_body", "content_type", "completed_at"])
        return response

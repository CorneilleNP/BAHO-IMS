"""Abstract base models shared by every domain app. No concrete tables live here."""

import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from .managers import ActiveManager


class TimeStampedModel(models.Model):
    """UUID primary key + created/updated timestamps.

    UUIDs (not integers) so records created offline on station devices can
    never collide when they sync up later.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
        ordering = ["-created_at"]


class AuditedModel(TimeStampedModel):
    """Base for transactional records (receipts, lots, ledger entries…).

    Adds who created/changed the row, which device it came from, and soft
    delete. `objects` hides soft-deleted rows; `all_objects` sees everything.
    """

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    device_id = models.CharField(max_length=100, blank=True)
    is_deleted = models.BooleanField(default=False, db_index=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    void_reason = models.TextField(blank=True, help_text="Why the record was voided.")

    objects = ActiveManager()
    all_objects = models.Manager()  # noqa: DJ012 - second manager, not a field

    class Meta(TimeStampedModel.Meta):
        abstract = True

    def soft_delete(self, user=None, reason: str = ""):
        """Void the record: hidden from normal queries, kept for audit, number never reused."""
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.void_reason = reason
        self.updated_by = user
        self.save(
            update_fields=["is_deleted", "deleted_at", "void_reason", "updated_by", "updated_at"]
        )


class SequenceCounter(models.Model):
    """Gap-free counters for human-readable numbers (GRN, lot, batch…).

    One row per key, e.g. "grn:GITOKI:2026". Incremented under a row lock
    inside the caller's transaction, so two clerks never get the same number.
    """

    key = models.CharField(max_length=120, primary_key=True)
    value = models.PositiveBigIntegerField(default=0)

    def __str__(self):
        return f"{self.key} = {self.value}"


class IdempotencyRecord(models.Model):
    """The stored outcome of one write sent with an `Idempotency-Key` header.

    The mobile app queues writes made offline and replays them when it is back
    online. If a replay is a repeat (the first attempt reached the server but
    the answer was lost), the stored response is returned instead of creating
    the record twice. See baho.core.idempotency.
    """

    key = models.CharField(max_length=100, unique=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )
    method = models.CharField(max_length=10)
    path = models.CharField(max_length=500)
    request_hash = models.CharField(max_length=64)
    status_code = models.PositiveSmallIntegerField(null=True, blank=True)
    response_body = models.TextField(blank=True)
    content_type = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.method} {self.path} [{self.key}]"

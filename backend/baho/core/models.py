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

    objects = ActiveManager()
    all_objects = models.Manager()  # noqa: DJ012 - second manager, not a field

    class Meta(TimeStampedModel.Meta):
        abstract = True

    def soft_delete(self, user=None):
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.updated_by = user
        self.save(update_fields=["is_deleted", "deleted_at", "updated_by", "updated_at"])


class SequenceCounter(models.Model):
    """Gap-free counters for human-readable numbers (GRN, lot, batch…).

    One row per key, e.g. "grn:GITOKI:2026". Incremented under a row lock
    inside the caller's transaction, so two clerks never get the same number.
    """

    key = models.CharField(max_length=120, primary_key=True)
    value = models.PositiveBigIntegerField(default=0)

    def __str__(self):
        return f"{self.key} = {self.value}"

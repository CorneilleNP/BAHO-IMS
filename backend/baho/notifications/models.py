"""SMS outbox. Every message is stored first, then sent after the write commits."""

from django.conf import settings
from django.db import models

from baho.core.models import TimeStampedModel


class SmsMessage(TimeStampedModel):
    """One outgoing SMS. Kept forever as the delivery log (never hard-deleted)."""

    class Status(models.TextChoices):
        QUEUED = "QUEUED", "Queued"
        SENT = "SENT", "Sent"
        FAILED = "FAILED", "Failed"

    to_phone = models.CharField(max_length=16, help_text="E.164, e.g. +250788123456.")
    body = models.TextField()
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.QUEUED, db_index=True
    )
    provider = models.CharField(max_length=30, blank=True)
    provider_message_id = models.CharField(max_length=120, blank=True)
    error = models.TextField(blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    sent_at = models.DateTimeField(null=True, blank=True)
    facility = models.ForeignKey(
        "organization.Facility",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="sms_messages",
    )
    # What the message is about, e.g. ("cherry_receipt", "<uuid>").
    reference_type = models.CharField(max_length=50, blank=True)
    reference_id = models.CharField(max_length=64, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    class Meta(TimeStampedModel.Meta):
        verbose_name = "SMS message"
        indexes = [
            models.Index(fields=["status", "attempts"]),
            models.Index(fields=["reference_type", "reference_id"]),
        ]

    def __str__(self):
        return f"{self.to_phone} [{self.status}]"

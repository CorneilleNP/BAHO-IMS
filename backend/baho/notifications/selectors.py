"""Read/query functions for notifications."""

from django.db.models import QuerySet

from .models import SmsMessage


def sms_outbox() -> QuerySet[SmsMessage]:
    return SmsMessage.objects.select_related("facility", "created_by")


def pending_sms(*, max_attempts: int) -> QuerySet[SmsMessage]:
    """Messages still worth (re)trying: queued or failed, under the attempt limit."""
    return SmsMessage.objects.filter(
        status__in=[SmsMessage.Status.QUEUED, SmsMessage.Status.FAILED],
        attempts__lt=max_attempts,
    ).order_by("created_at")

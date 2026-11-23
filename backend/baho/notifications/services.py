"""Write operations for notifications (SMS outbox).

Messages are stored in the outbox inside the caller's transaction and sent only
after it commits, so a rolled-back write never texts anyone and a provider
outage never breaks the caller's request.
"""

import logging
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .backends import get_backend
from .models import SmsMessage
from .phones import normalize_rw_phone

logger = logging.getLogger("baho.sms")

MAX_ATTEMPTS = 5
SMS_MAX_LENGTH = 160


def queue_sms(
    *,
    to_phone,
    body,
    facility=None,
    reference_type="",
    reference_id="",
    user=None,
) -> SmsMessage:
    """Store an SMS in the outbox and send it once the current transaction commits.

    Raises ValidationError for an invalid phone or empty body (before anything
    is stored). Sending failures are recorded on the message, never raised.
    """
    phone = normalize_rw_phone(to_phone)
    if phone is None:
        raise ValidationError({"to_phone": ["Enter a Rwanda mobile number, e.g. 0788123456."]})
    body = (body or "").strip()
    if not body:
        raise ValidationError({"body": ["The message is empty."]})

    message = SmsMessage.objects.create(
        to_phone=phone,
        body=body,
        facility=facility,
        reference_type=reference_type,
        reference_id=str(reference_id or ""),
        created_by=user if user is not None and user.is_authenticated else None,
    )
    transaction.on_commit(lambda: _send_quietly(message.pk), robust=True)
    return message


def _send_quietly(message_id) -> None:
    try:
        send_message(SmsMessage.objects.get(pk=message_id))
    except Exception:  # never let an SMS problem surface in a request
        logger.exception("SMS %s could not be sent", message_id)


def send_message(message: SmsMessage) -> SmsMessage:
    """Try to deliver one message now and return the updated row.

    Records SENT or FAILED (+ error) and bumps `attempts`; provider problems are
    never raised. Already-sent messages are left alone (no double send).
    """
    with transaction.atomic():
        locked = SmsMessage.objects.select_for_update().get(pk=message.pk)
        if locked.status == SmsMessage.Status.SENT:
            return locked
        locked.attempts += 1
        try:
            backend = get_backend()
            locked.provider = backend.name
            result = backend.send(locked.to_phone, locked.body)
        except Exception as exc:
            locked.status = SmsMessage.Status.FAILED
            locked.error = (str(exc) or exc.__class__.__name__)[:1000]
            logger.warning(
                "SMS %s to %s failed (attempt %s): %s",
                locked.pk,
                locked.to_phone,
                locked.attempts,
                locked.error,
            )
        else:
            locked.status = SmsMessage.Status.SENT
            locked.provider = result.provider
            locked.provider_message_id = result.message_id
            locked.error = ""
            locked.sent_at = timezone.now()
        locked.save(
            update_fields=[
                "status",
                "provider",
                "provider_message_id",
                "error",
                "attempts",
                "sent_at",
                "updated_at",
            ]
        )
        return locked


def retry_message(message: SmsMessage) -> SmsMessage:
    """Manually retry one FAILED message now (admin action)."""
    if message.status != SmsMessage.Status.FAILED:
        raise ValidationError({"status": ["Only failed messages can be retried."]})
    return send_message(message)


def retry_failed(*, max_attempts: int = MAX_ATTEMPTS, limit: int | None = None) -> dict:
    """Send every QUEUED/FAILED message with fewer than `max_attempts` attempts."""
    from .selectors import pending_sms

    ids = list(pending_sms(max_attempts=max_attempts).values_list("pk", flat=True)[:limit])
    counts = {"sent": 0, "failed": 0}
    for message in SmsMessage.objects.filter(pk__in=ids).order_by("created_at"):
        result = send_message(message)
        counts["sent" if result.status == SmsMessage.Status.SENT else "failed"] += 1
    return counts


# --- Domain hooks ------------------------------------------------------------------


def _kg(value) -> str:
    value = Decimal(value or 0)
    return f"{value:.0f}" if value == value.to_integral_value() else f"{value:.2f}"


def cherry_receipt_sms_body(receipt) -> str:
    totals = {"GOOD": Decimal(0), "FLOAT": Decimal(0)}
    for line in receipt.lines.all():
        totals[line.cherry_grade] = totals.get(line.cherry_grade, Decimal(0)) + line.quantity_kg
    body = (
        f"Baho Coffee: GRN {receipt.grn_number} {receipt.received_on:%d/%m/%Y}. "
        f"Good {_kg(totals['GOOD'])}kg, Float {_kg(totals['FLOAT'])}kg "
        f"at {receipt.facility.name}. Murakoze!"
    )
    return body[:SMS_MAX_LENGTH]


def notify_cherry_receipt(receipt, *, user=None) -> SmsMessage | None:
    """Queue the GRN confirmation SMS for the farmer.

    Farmers without a valid phone get nothing. Never raises: a notification
    problem must not block a GRN.
    """
    if normalize_rw_phone(receipt.farmer.phone) is None:
        return None
    try:
        with transaction.atomic():  # savepoint: a failure here leaves the GRN intact
            return queue_sms(
                to_phone=receipt.farmer.phone,
                body=cherry_receipt_sms_body(receipt),
                facility=receipt.facility,
                reference_type="cherry_receipt",
                reference_id=receipt.pk,
                user=user,
            )
    except Exception:
        logger.exception("Could not queue GRN SMS for receipt %s", receipt.pk)
        return None

"""Write operations for cherry reception. Every write is one transaction.

Rules (station staff vs admin):
- A saved GRN is locked: only an ADMIN may correct its station, farmer, date,
  lines (quantity, price, transport, commission) or notes.
- Anyone who may record GRNs may record a payment against one. A GRN can be
  paid in parts; its `amount_paid` and status (Not paid / Partially paid /
  Paid) always follow its live payments and its total.
- Only an ADMIN may delete (void) a payment recorded by mistake.
"""

from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import F, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from baho.core.access import RoleCode, get_user_access
from baho.core.dates import crop_year_for
from baho.core.numbering import next_sequence
from baho.core.permissions import ensure_facility_access
from baho.notifications.services import notify_cherry_receipt

from .models import CherryPayment, CherryReceipt, CherryReceiptLine

ZERO = Decimal("0")
CENT = Decimal("0.01")
Status = CherryReceipt.PaymentStatus

GRN_LOCKED = (
    "A saved GRN can only be changed by an administrator. You can still record payments for it."
)


def is_admin(user) -> bool:
    return user.is_superuser or get_user_access(user).has_any_role(RoleCode.ADMIN)


def receipt_total(receipt: CherryReceipt) -> Decimal:
    """What the farmer is owed for the GRN: cherry + transport + commission."""
    return receipt.lines.aggregate(
        total=Coalesce(Sum(F("line_amount") + F("transport_cost") + F("commission")), ZERO)
    )["total"]


def _status_for(paid: Decimal, total: Decimal) -> str:
    if paid <= 0:
        return Status.UNPAID
    return Status.PAID if paid >= total else Status.PARTIAL


def refresh_payment(receipt: CherryReceipt) -> CherryReceipt:
    """Recompute amount paid and status from the live payments (call under a lock)."""
    paid = receipt.payments.aggregate(total=Coalesce(Sum("amount"), ZERO))["total"]
    latest = receipt.payments.order_by("-paid_on", "-created_at").first()
    receipt.amount_paid = paid
    receipt.payment_status = _status_for(paid, receipt_total(receipt))
    receipt.payment_method = latest.method if latest else ""
    receipt.save(update_fields=["amount_paid", "payment_status", "payment_method", "updated_at"])
    return receipt


def _clean_lines(lines):
    lines = [line for line in lines if line["quantity_kg"] > 0]
    if not lines:
        raise ValidationError({"lines": ["Enter a quantity for Good or Float cherry."]})
    grades = [line["cherry_grade"] for line in lines]
    if len(grades) != len(set(grades)):
        raise ValidationError({"lines": ["Each cherry grade can appear only once."]})
    return lines


def _add_payment(*, user, receipt, amount, paid_on, method, reference="", notes=""):
    amount = Decimal(amount).quantize(CENT)
    if amount <= 0:
        raise ValidationError({"amount": ["Enter the amount paid (more than 0)."]})
    if not method:
        raise ValidationError({"method": ["Choose how the farmer was paid."]})
    balance = receipt_total(receipt) - receipt.amount_paid
    if amount > balance:
        raise ValidationError(
            {"amount": [f"Only {balance:,.0f} RWF is still owed on {receipt.grn_number}."]}
        )
    CherryPayment.objects.create(
        receipt=receipt,
        paid_on=paid_on,
        amount=amount,
        method=method,
        reference=reference,
        notes=notes,
        created_by=user,
        updated_by=user,
    )
    return refresh_payment(receipt)


@transaction.atomic
def create_cherry_receipt(
    *,
    user,
    facility,
    farmer,
    received_on,
    lines,
    payment_method="",
    payment_status=Status.UNPAID,
    amount_paid=None,
    notes="",
    notify_farmer=True,
) -> CherryReceipt:
    """Record a delivery. Payment at weighing: `payment_status` PAID pays the full
    total; PARTIAL pays `amount_paid`; UNPAID pays nothing (pay later with
    `record_payment`). `notify_farmer=False` skips the SMS (e.g. imports)."""
    ensure_facility_access(user, facility)
    lines = _clean_lines(lines)
    if payment_status in (Status.PAID, Status.PARTIAL) and not payment_method:
        raise ValidationError({"payment_method": ["Choose how the farmer was paid."]})
    if payment_status == Status.PARTIAL and not amount_paid:
        raise ValidationError({"amount_paid": ["Enter the amount paid now."]})

    crop_year = crop_year_for(received_on)
    number = next_sequence(f"grn:{facility.code}:{crop_year.label}")
    receipt = CherryReceipt.objects.create(
        grn_number=f"{facility.code}-{crop_year.label}-{number:05d}",
        facility=facility,
        farmer=farmer,
        crop_year=crop_year,
        received_on=received_on,
        notes=notes,
        created_by=user,
        updated_by=user,
    )
    CherryReceiptLine.objects.bulk_create(
        [CherryReceiptLine(receipt=receipt, **line) for line in lines]
    )
    if payment_status == Status.PAID:
        amount_paid = receipt_total(receipt)
    if payment_status in (Status.PAID, Status.PARTIAL) and amount_paid:
        _add_payment(
            user=user,
            receipt=receipt,
            amount=amount_paid,
            paid_on=received_on,
            method=payment_method,
        )
    if notify_farmer:
        notify_cherry_receipt(receipt, user=user)  # farmer SMS, sent after commit; never raises
    return receipt


def _lock(receipt: CherryReceipt) -> CherryReceipt:
    return CherryReceipt.objects.select_for_update().get(pk=receipt.pk)


@transaction.atomic
def update_cherry_receipt(
    *,
    user,
    receipt,
    facility=None,
    farmer=None,
    received_on=None,
    lines=None,
    payment_method=None,
    payment_status=None,
    amount_paid=None,
    notes=None,
) -> CherryReceipt:
    """Correct a saved GRN (ADMIN only). For backward compatibility (older app
    versions, saves queued offline), a change of `payment_status` to PAID from
    anyone who may record GRNs pays the remaining balance, nothing else."""
    ensure_facility_access(user, facility or receipt.facility)
    receipt = _lock(receipt)

    details = {
        "facility": facility,
        "farmer": farmer,
        "received_on": received_on,
        "lines": lines,
        "notes": notes,
    }
    changing_details = any(
        value is not None and value != getattr(receipt, name, None)
        for name, value in details.items()
        if name != "lines"
    ) or (lines is not None)
    if changing_details and not is_admin(user):
        raise PermissionDenied(GRN_LOCKED)

    if lines is not None:
        lines = _clean_lines(lines)

    fields = []
    if facility is not None:
        receipt.facility = facility
        fields.append("facility")
    if farmer is not None:
        receipt.farmer = farmer
        fields.append("farmer")
    if received_on is not None:
        receipt.received_on = received_on
        receipt.crop_year = crop_year_for(received_on)
        fields += ["received_on", "crop_year"]
    if notes is not None:
        receipt.notes = notes
        fields.append("notes")
    if fields:
        receipt.updated_by = user
        receipt.save(update_fields=[*fields, "updated_by", "updated_at"])

    if lines is not None:
        receipt.lines.all().delete()
        CherryReceiptLine.objects.bulk_create(
            [CherryReceiptLine(receipt=receipt, **line) for line in lines]
        )
        if receipt_total(receipt) < receipt.amount_paid:
            raise ValidationError(
                {
                    "lines": [
                        f"{receipt.amount_paid:,.0f} RWF has already been paid, more than "
                        "the new total. Delete the extra payment first."
                    ]
                }
            )
        refresh_payment(receipt)

    if payment_status == Status.PAID and receipt.payment_status != Status.PAID:
        balance = receipt_total(receipt) - receipt.amount_paid
        _add_payment(
            user=user,
            receipt=receipt,
            amount=balance,
            paid_on=timezone.localdate(),
            method=payment_method or receipt.payment_method,
        )
    elif payment_status == Status.PARTIAL and amount_paid:
        extra = Decimal(amount_paid) - receipt.amount_paid
        if extra > 0:
            _add_payment(
                user=user,
                receipt=receipt,
                amount=extra,
                paid_on=timezone.localdate(),
                method=payment_method or receipt.payment_method,
            )
    elif payment_status == Status.UNPAID and receipt.amount_paid > 0:
        raise ValidationError(
            {"payment_status": ["Payments are recorded on this GRN: delete them instead."]}
        )
    return receipt


@transaction.atomic
def record_payment(
    *,
    user,
    receipt: CherryReceipt,
    amount,
    paid_on: date | None = None,
    method: str,
    reference: str = "",
    notes: str = "",
) -> CherryReceipt:
    """Pay (part of) what the farmer is still owed on a GRN. Never changes the
    GRN's cherry, prices or quantities."""
    ensure_facility_access(user, receipt.facility)
    receipt = _lock(receipt)
    return _add_payment(
        user=user,
        receipt=receipt,
        amount=amount,
        paid_on=paid_on or timezone.localdate(),
        method=method,
        reference=reference,
        notes=notes,
    )


@transaction.atomic
def void_payment(*, user, payment: CherryPayment, reason: str) -> CherryReceipt:
    """Delete a payment recorded by mistake (ADMIN only); the GRN's balance comes back."""
    if not is_admin(user):
        raise PermissionDenied("Only an administrator can delete a payment.")
    ensure_facility_access(user, payment.receipt.facility)
    receipt = _lock(payment.receipt)
    payment.soft_delete(user=user, reason=reason)
    return refresh_payment(receipt)

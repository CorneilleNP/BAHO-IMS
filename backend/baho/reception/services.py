"""Write operations for cherry reception. Every write is one transaction."""

from django.db import transaction
from rest_framework.exceptions import ValidationError

from baho.core.dates import crop_year_for
from baho.core.numbering import next_sequence
from baho.core.permissions import ensure_facility_access

from .models import CherryReceipt, CherryReceiptLine


@transaction.atomic
def create_cherry_receipt(
    *,
    user,
    facility,
    farmer,
    received_on,
    lines,
    payment_method="",
    payment_status=CherryReceipt.PaymentStatus.UNPAID,
    notes="",
) -> CherryReceipt:
    ensure_facility_access(user, facility)
    lines = [line for line in lines if line["quantity_kg"] > 0]
    if not lines:
        raise ValidationError({"lines": ["Enter a quantity for Good or Float cherry."]})
    grades = [line["cherry_grade"] for line in lines]
    if len(grades) != len(set(grades)):
        raise ValidationError({"lines": ["Each cherry grade can appear only once."]})
    if payment_status == CherryReceipt.PaymentStatus.PAID and not payment_method:
        raise ValidationError({"payment_method": ["Choose how the farmer was paid."]})

    crop_year = crop_year_for(received_on)
    number = next_sequence(f"grn:{facility.code}:{crop_year.label}")
    receipt = CherryReceipt.objects.create(
        grn_number=f"{facility.code}-{crop_year.label}-{number:05d}",
        facility=facility,
        farmer=farmer,
        crop_year=crop_year,
        received_on=received_on,
        payment_method=payment_method,
        payment_status=payment_status,
        notes=notes,
        created_by=user,
        updated_by=user,
    )
    CherryReceiptLine.objects.bulk_create(
        [CherryReceiptLine(receipt=receipt, **line) for line in lines]
    )
    return receipt

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
    notes=None,
) -> CherryReceipt:
    """Correct a GRN already recorded: any field can be changed, including its
    Good/Float lines (replaced wholesale when given). Nothing downstream deducts
    stock from a GRN, so there is nothing to re-check or lock, unlike stock receipts."""
    ensure_facility_access(user, facility or receipt.facility)

    if lines is not None:
        lines = [line for line in lines if line["quantity_kg"] > 0]
        if not lines:
            raise ValidationError({"lines": ["Enter a quantity for Good or Float cherry."]})
        grades = [line["cherry_grade"] for line in lines]
        if len(grades) != len(set(grades)):
            raise ValidationError({"lines": ["Each cherry grade can appear only once."]})

    final_status = payment_status if payment_status is not None else receipt.payment_status
    final_method = payment_method if payment_method is not None else receipt.payment_method
    if final_status == CherryReceipt.PaymentStatus.PAID and not final_method:
        raise ValidationError({"payment_method": ["Choose how the farmer was paid."]})

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
    if payment_method is not None:
        receipt.payment_method = payment_method
        fields.append("payment_method")
    if payment_status is not None:
        receipt.payment_status = payment_status
        fields.append("payment_status")
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
    return receipt

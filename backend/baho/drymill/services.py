"""Write operations for the HQ dry mill. Every multi-row write is one transaction."""

from decimal import Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from baho.core.dates import crop_year_for, hq_facility
from baho.core.numbering import next_sequence

from .models import DryMillBatch, DryMillOutput, HqStockReceipt, OriginType, Supplier


def _check_source(origin_type, source_facility, source_supplier) -> None:
    if origin_type == OriginType.OWN_CWS:
        if source_facility is None or source_supplier is not None:
            raise ValidationError(
                {"source_facility": ["Choose the Baho CWS this coffee came from."]}
            )
    elif origin_type == OriginType.PARTNER_SUPPLIER:
        if source_supplier is None or source_facility is not None:
            raise ValidationError({"source_supplier": ["Choose the partner supplier."]})


@transaction.atomic
def create_supplier(*, user, name, **fields) -> Supplier:
    name = name.strip()
    if Supplier.objects.filter(name__iexact=name).exists():
        raise ValidationError({"name": [f"Supplier {name} is already registered."]})
    return Supplier.objects.create(name=name, **fields)


@transaction.atomic
def create_stock_receipt(
    *,
    user,
    arrival_date,
    origin_type,
    net_weight_kg,
    source_facility=None,
    source_supplier=None,
    **fields,
) -> HqStockReceipt:
    _check_source(origin_type, source_facility, source_supplier)
    bags = fields.get("number_of_bags")
    tare = fields.get("tare_per_bag_kg")
    if not fields.get("weight_of_bags_kg") and bags and tare:
        fields["weight_of_bags_kg"] = (Decimal(bags) * tare).quantize(Decimal("0.01"))
    if fields.get("weight_of_bags_kg", 0) > net_weight_kg:
        raise ValidationError(
            {"weight_of_bags_kg": ["Weight of bags cannot exceed the net weight."]}
        )

    crop_year = crop_year_for(arrival_date)
    number = next_sequence(f"hq-receipt:{crop_year.label}")
    return HqStockReceipt.objects.create(
        receipt_number=f"SR-{crop_year.label}-{number:05d}",
        facility=hq_facility(),
        crop_year=crop_year,
        arrival_date=arrival_date,
        origin_type=origin_type,
        source_facility=source_facility,
        source_supplier=source_supplier,
        net_weight_kg=net_weight_kg,
        created_by=user,
        updated_by=user,
        **fields,
    )


@transaction.atomic
def update_stock_receipt_status(*, user, receipt, quality_status=None, processing_status=None):
    if quality_status:
        receipt.quality_status = quality_status
    if processing_status:
        receipt.processing_status = processing_status
    receipt.updated_by = user
    receipt.save(update_fields=["quality_status", "processing_status", "updated_by", "updated_at"])
    return receipt


@transaction.atomic
def create_dry_mill_batch(
    *,
    user,
    processing_date,
    origin_type,
    process_product,
    parch_input_kg,
    outputs,
    source_facility=None,
    source_supplier=None,
    batch_no="",
    status=DryMillBatch.Status.COMPLETED,
) -> DryMillBatch:
    """`outputs`: [{"export_grade": ExportGrade, "qty_kg": Decimal}] — zero lines are skipped."""
    _check_source(origin_type, source_facility, source_supplier)
    outputs = [o for o in outputs if o["qty_kg"] > 0]
    grades = [o["export_grade"].id for o in outputs]
    if len(grades) != len(set(grades)):
        raise ValidationError({"outputs": ["Each grade can appear only once."]})
    if sum((o["qty_kg"] for o in outputs), Decimal("0")) > parch_input_kg:
        raise ValidationError(
            {"outputs": ["Green output cannot be more than the parchment input."]}
        )

    crop_year = crop_year_for(processing_date)
    batch_no = (batch_no or "").strip()
    if batch_no:
        if DryMillBatch.all_objects.filter(batch_no__iexact=batch_no).exists():
            raise ValidationError({"batch_no": [f"Batch {batch_no} already exists."]})
    else:
        batch_no = f"DM-{crop_year.label}-{next_sequence(f'dm-batch:{crop_year.label}'):04d}"

    batch = DryMillBatch.objects.create(
        batch_no=batch_no,
        facility=hq_facility(),
        crop_year=crop_year,
        processing_date=processing_date,
        origin_type=origin_type,
        source_facility=source_facility,
        source_supplier=source_supplier,
        process_product=process_product.strip(),
        parch_input_kg=parch_input_kg,
        status=status,
        created_by=user,
        updated_by=user,
    )
    DryMillOutput.objects.bulk_create([DryMillOutput(batch=batch, **o) for o in outputs])
    return batch

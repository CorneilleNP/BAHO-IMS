"""HQ dry mill: suppliers, inbound stock receipts, parchment -> green batches.

Legacy: 0004_hq_dry_mill_export.sql.
"""

import uuid

from django.db import models
from django.db.models import F, Q

from baho.core.models import AuditedModel, TimeStampedModel


class Supplier(TimeStampedModel):
    """Partner supplier (cooperative, private washing station) selling coffee to Baho."""

    name = models.CharField(max_length=150, unique=True)
    tin = models.CharField(max_length=30, blank=True)
    contact_name = models.CharField(max_length=120, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    province = models.CharField(max_length=80, blank=True)
    district = models.CharField(max_length=80, blank=True)
    sector = models.CharField(max_length=80, blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class ExportGrade(models.Model):
    """Green coffee grade/product after dry milling (15+, 13/14, GTR, Chips…)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=60)
    display_order = models.PositiveSmallIntegerField(default=0)
    is_high_grade = models.BooleanField(
        default=False, help_text="Counts towards the HG (screen 15 and above) out-turn."
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "name"]

    def __str__(self):
        return self.name


class OriginType(models.TextChoices):
    OWN_CWS = "OWN_CWS", "Baho CWS"
    PARTNER_SUPPLIER = "PARTNER_SUPPLIER", "Partner supplier"


class SourcedModel(AuditedModel):
    """Coffee that came from either a Baho CWS or a partner supplier."""

    origin_type = models.CharField(max_length=20, choices=OriginType.choices)
    source_facility = models.ForeignKey(
        "organization.Facility", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    source_supplier = models.ForeignKey(
        Supplier, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )

    class Meta(AuditedModel.Meta):
        abstract = True

    @property
    def source_name(self) -> str:
        source = self.source_facility or self.source_supplier
        return source.name if source else ""

    @property
    def source_code(self) -> str:
        if self.source_facility:
            return self.source_facility.code
        return self.source_supplier.name.upper() if self.source_supplier else ""


def _one_source(name: str) -> models.CheckConstraint:
    return models.CheckConstraint(
        condition=(
            Q(
                origin_type=OriginType.OWN_CWS,
                source_facility__isnull=False,
                source_supplier__isnull=True,
            )
            | Q(
                origin_type=OriginType.PARTNER_SUPPLIER,
                source_supplier__isnull=False,
                source_facility__isnull=True,
            )
        ),
        name=name,
    )


class HqStockReceipt(SourcedModel):
    """Parchment/green coffee received at the HQ warehouse ("Stock Update")."""

    class ItemType(models.TextChoices):
        PARCH = "PARCH", "Parchment"
        GREEN = "GREEN", "Green"

    class QualityStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACCEPTED = "ACCEPTED", "Accepted"
        REJECTED = "REJECTED", "Rejected"

    class ProcessingStatus(models.TextChoices):
        NOT_STARTED = "NOT_STARTED", "Not started"
        IN_PROGRESS = "IN_PROGRESS", "In progress"
        COMPLETED = "COMPLETED", "Completed"

    receipt_number = models.CharField(max_length=40, unique=True, editable=False)
    facility = models.ForeignKey(
        "organization.Facility", on_delete=models.PROTECT, related_name="hq_stock_receipts"
    )
    crop_year = models.ForeignKey("organization.CropYear", on_delete=models.PROTECT)
    arrival_date = models.DateField()
    item_type = models.CharField(max_length=5, choices=ItemType.choices, default=ItemType.PARCH)
    process = models.CharField(max_length=60)
    grade = models.CharField(max_length=30)
    lot_reference = models.CharField(max_length=60, blank=True)
    delivery_note_no = models.CharField(max_length=60, blank=True)
    delivery_note_qty_kg = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    gross_weight_kg = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    net_weight_kg = models.DecimalField(max_digits=12, decimal_places=2)
    number_of_bags = models.PositiveIntegerField(null=True, blank=True)
    tare_per_bag_kg = models.DecimalField(max_digits=6, decimal_places=3, null=True, blank=True)
    weight_of_bags_kg = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    pure_weight_kg = models.GeneratedField(
        expression=F("net_weight_kg") - F("weight_of_bags_kg"),
        output_field=models.DecimalField(max_digits=12, decimal_places=2),
        db_persist=True,
    )
    wrn_number = models.CharField(max_length=60, blank=True)
    warehouse_cell = models.CharField(max_length=60, blank=True)
    stock_card_number = models.CharField(max_length=60, blank=True)
    quality_status = models.CharField(
        max_length=10, choices=QualityStatus.choices, default=QualityStatus.PENDING
    )
    processing_status = models.CharField(
        max_length=12, choices=ProcessingStatus.choices, default=ProcessingStatus.NOT_STARTED
    )

    class Meta(SourcedModel.Meta):
        ordering = ["-arrival_date", "-created_at"]
        indexes = [models.Index(fields=["arrival_date"])]
        constraints = [
            _one_source("hq_receipt_one_source"),
            models.CheckConstraint(
                condition=Q(net_weight_kg__gt=0)
                & Q(weight_of_bags_kg__gte=0)
                & Q(weight_of_bags_kg__lte=F("net_weight_kg")),
                name="hq_receipt_weights_valid",
            ),
        ]

    def __str__(self):
        return self.receipt_number


class DryMillBatch(SourcedModel):
    """Parchment -> green conversion run ("Parchment Processing")."""

    class Status(models.TextChoices):
        IN_PROGRESS = "IN_PROGRESS", "In progress"
        COMPLETED = "COMPLETED", "Completed"

    batch_no = models.CharField(max_length=40, unique=True)
    facility = models.ForeignKey(
        "organization.Facility", on_delete=models.PROTECT, related_name="dry_mill_batches"
    )
    crop_year = models.ForeignKey("organization.CropYear", on_delete=models.PROTECT)
    processing_date = models.DateField()
    process_product = models.CharField(max_length=60)
    parch_input_kg = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.COMPLETED)

    class Meta(SourcedModel.Meta):
        ordering = ["-processing_date", "-created_at"]
        verbose_name_plural = "dry mill batches"
        constraints = [
            _one_source("dry_mill_batch_one_source"),
            models.CheckConstraint(condition=Q(parch_input_kg__gt=0), name="batch_input_positive"),
        ]

    def __str__(self):
        return self.batch_no


class DryMillOutput(TimeStampedModel):
    batch = models.ForeignKey(DryMillBatch, on_delete=models.CASCADE, related_name="outputs")
    export_grade = models.ForeignKey(ExportGrade, on_delete=models.PROTECT, related_name="+")
    qty_kg = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        ordering = ["export_grade__display_order"]
        constraints = [
            models.UniqueConstraint(
                fields=["batch", "export_grade"], name="batch_output_one_per_grade"
            ),
            models.CheckConstraint(condition=Q(qty_kg__gt=0), name="batch_output_positive"),
        ]

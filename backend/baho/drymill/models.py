"""HQ dry mill: suppliers, inbound stock receipts, parchment -> green batches.

Legacy: 0004_hq_dry_mill_export.sql.
"""

import uuid

from django.db import models
from django.db.models import F, Q
from simple_history.models import HistoricalRecords

from baho.core.models import AuditedModel, TimeStampedModel
from baho.organization.models import location_field


class Supplier(TimeStampedModel):
    """Partner supplier (cooperative, private washing station) selling coffee to Baho."""

    name = models.CharField(max_length=150, unique=True)
    tin = models.CharField(max_length=30, blank=True)
    contact_name = models.CharField(max_length=120, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    location = location_field()
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
    MIXED = "MIXED", "Mixed sources"  # dry mill batches blending several receipts


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
        if source:
            return source.name
        return "Mixed sources" if self.origin_type == OriginType.MIXED else ""

    @property
    def source_code(self) -> str:
        if self.source_facility:
            return self.source_facility.code
        if self.source_supplier:
            return self.source_supplier.name.upper()
        return "MIXED" if self.origin_type == OriginType.MIXED else ""


def _one_source(name: str, allow_mixed: bool = False) -> models.CheckConstraint:
    condition = Q(
        origin_type=OriginType.OWN_CWS,
        source_facility__isnull=False,
        source_supplier__isnull=True,
    ) | Q(
        origin_type=OriginType.PARTNER_SUPPLIER,
        source_supplier__isnull=False,
        source_facility__isnull=True,
    )
    if allow_mixed:
        condition |= Q(
            origin_type=OriginType.MIXED, source_facility__isnull=True, source_supplier__isnull=True
        )
    return models.CheckConstraint(condition=condition, name=name)


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
        IN_PROGRESS = "IN_PROGRESS", "Partially processed"
        COMPLETED = "COMPLETED", "Completed"

    class WeighingStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        DONE = "DONE", "Done"

    receipt_number = models.CharField(max_length=40, unique=True, editable=False)
    facility = models.ForeignKey(
        "organization.Facility", on_delete=models.PROTECT, related_name="hq_stock_receipts"
    )
    crop_year = models.ForeignKey("organization.CropYear", on_delete=models.PROTECT)
    arrival_date = models.DateField()
    item_type = models.CharField(max_length=5, choices=ItemType.choices, default=ItemType.PARCH)
    process = models.ForeignKey(
        "processing.Process", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    sub_process = models.ForeignKey(
        "processing.SubProcess",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="hq_stock_receipts",
    )
    process_raw = models.CharField(
        max_length=120, blank=True, help_text="Process label exactly as typed / imported."
    )
    grade = models.CharField(max_length=30, blank=True)
    lot_reference = models.CharField(max_length=60, blank=True)
    purchase_contract_number = models.CharField(max_length=60, blank=True)
    weighing_status = models.CharField(
        max_length=10, choices=WeighingStatus.choices, default=WeighingStatus.DONE
    )
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
    quality_comment = models.TextField(blank=True)

    # --- Stock position: maintained by drymill.stock.refresh_receipt_stock(), never typed in.
    processing_status = models.CharField(
        max_length=12, choices=ProcessingStatus.choices, default=ProcessingStatus.NOT_STARTED
    )
    processing_date = models.DateField(null=True, blank=True)
    processed_kg = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    adjusted_kg = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    stock_balance_kg = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # --- Where the record came from when imported from a spreadsheet.
    source_raw = models.CharField(max_length=120, blank=True)
    import_batch = models.CharField(max_length=120, blank=True)
    source_row = models.PositiveIntegerField(null=True, blank=True)

    history = HistoricalRecords(excluded_fields=["pure_weight_kg"])

    class Meta(SourcedModel.Meta):
        ordering = ["-arrival_date", "-created_at"]
        indexes = [
            models.Index(fields=["arrival_date"]),
            models.Index(fields=["quality_status", "processing_status"]),
        ]
        constraints = [
            _one_source("hq_receipt_one_source"),
            models.UniqueConstraint(
                fields=["import_batch", "source_row"],
                condition=~Q(import_batch=""),
                name="hq_receipt_unique_import_row",
            ),
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

    history = HistoricalRecords()

    class Meta(SourcedModel.Meta):
        ordering = ["-processing_date", "-created_at"]
        verbose_name_plural = "dry mill batches"
        constraints = [
            _one_source("dry_mill_batch_one_source", allow_mixed=True),
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


class DryMillBatchInput(TimeStampedModel):
    """Parchment taken from one stock receipt by a dry mill batch (the stock deduction)."""

    batch = models.ForeignKey(DryMillBatch, on_delete=models.CASCADE, related_name="inputs")
    receipt = models.ForeignKey(
        HqStockReceipt, on_delete=models.PROTECT, related_name="batch_inputs"
    )
    qty_kg = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["batch", "receipt"], name="batch_input_one_per_receipt"
            ),
            models.CheckConstraint(condition=Q(qty_kg__gt=0), name="batch_input_qty_positive"),
        ]


class StockAdjustment(TimeStampedModel):
    """Manual correction of a receipt's stock (count difference, moisture loss, opening
    balance). Negative = stock removed. Always has a reason and who made it."""

    receipt = models.ForeignKey(
        HqStockReceipt, on_delete=models.PROTECT, related_name="adjustments"
    )
    qty_kg = models.DecimalField(max_digits=12, decimal_places=2)
    reason = models.TextField()
    adjusted_on = models.DateField()
    created_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-adjusted_on", "-created_at"]
        constraints = [
            models.CheckConstraint(condition=~Q(qty_kg=0), name="adjustment_not_zero"),
        ]

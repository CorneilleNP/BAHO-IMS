"""Export clients and shipments. Legacy: 0004_hq_dry_mill_export.sql."""

from django.db import models
from django.db.models import Q

from baho.core.models import AuditedModel, TimeStampedModel


class Client(TimeStampedModel):
    """Buyer of Baho's green coffee (importer, roaster, trader)."""

    name = models.CharField(max_length=150, unique=True)
    country = models.CharField(max_length=80, blank=True)
    contact_name = models.CharField(max_length=120, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    tin = models.CharField(max_length=30, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class ExportShipment(AuditedModel):
    class Status(models.TextChoices):
        PLANNED = "PLANNED", "Planned"
        SHIPPED = "SHIPPED", "Shipped"
        DELIVERED = "DELIVERED", "Delivered"

    shipment_no = models.CharField(max_length=40, unique=True, editable=False)
    client = models.ForeignKey(Client, on_delete=models.PROTECT, related_name="shipments")
    crop_year = models.ForeignKey("organization.CropYear", on_delete=models.PROTECT)
    delivery_to_naeb_date = models.DateField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PLANNED)
    notes = models.TextField(blank=True)

    class Meta(AuditedModel.Meta):
        ordering = ["-delivery_to_naeb_date", "-created_at"]

    def __str__(self):
        return self.shipment_no


class ExportShipmentLine(TimeStampedModel):
    shipment = models.ForeignKey(ExportShipment, on_delete=models.CASCADE, related_name="lines")
    process_product = models.CharField(max_length=60)
    export_grade = models.ForeignKey(
        "drymill.ExportGrade", on_delete=models.PROTECT, related_name="+"
    )
    qty_kg = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.CheckConstraint(condition=Q(qty_kg__gt=0), name="shipment_line_qty_positive"),
        ]

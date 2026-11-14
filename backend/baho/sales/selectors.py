"""Read/query functions for sales/export."""

from django.db.models import DecimalField, OuterRef, Subquery, Sum, Value
from django.db.models.functions import Coalesce

from .models import ExportShipment, ExportShipmentLine

KG = DecimalField(max_digits=14, decimal_places=2)


def shipments_with_totals():
    total = (
        ExportShipmentLine.objects.filter(shipment=OuterRef("pk"))
        .values("shipment")
        .annotate(total=Sum("qty_kg"))
        .values("total")
    )
    return (
        ExportShipment.objects.select_related("client")
        .prefetch_related("lines__export_grade")
        .annotate(
            total_qty_kg=Coalesce(Subquery(total, output_field=KG), Value(0, output_field=KG))
        )
    )

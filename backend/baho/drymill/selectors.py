"""Read/query functions for the dry mill."""

from django.db.models import DecimalField, OuterRef, Subquery, Sum, Value
from django.db.models.functions import Coalesce

from baho.organization.models import Facility

from .models import DryMillBatch, DryMillOutput, HqStockReceipt, OriginType, Supplier

KG = DecimalField(max_digits=14, decimal_places=2)


def stock_receipts():
    return HqStockReceipt.objects.select_related("source_facility", "source_supplier")


def batches_with_totals():
    green = (
        DryMillOutput.objects.filter(batch=OuterRef("pk"))
        .values("batch")
        .annotate(total=Sum("qty_kg"))
        .values("total")
    )
    return (
        DryMillBatch.objects.select_related("source_facility", "source_supplier")
        .prefetch_related("outputs__export_grade")
        .annotate(
            green_output_kg=Coalesce(Subquery(green, output_field=KG), Value(0, output_field=KG))
        )
    )


def coffee_sources() -> list[dict]:
    """Every place coffee can come from: Baho CWS stations + partner suppliers."""
    stations = [
        {"origin_type": OriginType.OWN_CWS, "id": str(f.id), "code": f.code, "name": f.name}
        for f in Facility.objects.filter(facility_type=Facility.FacilityType.CWS, is_active=True)
    ]
    suppliers = [
        {
            "origin_type": OriginType.PARTNER_SUPPLIER,
            "id": str(s.id),
            "code": s.name.upper(),
            "name": s.name,
        }
        for s in Supplier.objects.filter(is_active=True)
    ]
    return stations + suppliers

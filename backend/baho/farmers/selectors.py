"""Read/query functions for farmers."""

from decimal import Decimal

from django.db.models import Count, DecimalField, Max, Q, Sum, Value
from django.db.models.functions import Coalesce

from baho.organization.locations import ANCESTORS

from .models import Farmer

LIVE = Q(cherry_receipts__is_deleted=False)


def farmers_with_totals():
    """Farmers with what they delivered (voided GRNs excluded)."""
    zero = Value(Decimal("0"), output_field=DecimalField(max_digits=14, decimal_places=2))
    return Farmer.objects.select_related("home_facility", f"location__{ANCESTORS}").annotate(
        grn_count=Count("cherry_receipts", filter=LIVE, distinct=True),
        delivered_kg=Coalesce(Sum("cherry_receipts__lines__quantity_kg", filter=LIVE), zero),
        last_delivery=Max("cherry_receipts__received_on", filter=LIVE),
    )


def farmer_deliveries(farmer):
    from baho.reception.models import CherryReceipt

    return (
        CherryReceipt.objects.filter(farmer=farmer)
        .select_related("facility")
        .prefetch_related("lines")
        .order_by("-received_on", "-created_at")
    )

"""Read/query functions for reception."""

from django.db.models import DecimalField, F, OuterRef, Subquery, Sum, Value
from django.db.models.functions import Coalesce

from .models import CherryReceipt, CherryReceiptLine

MONEY = DecimalField(max_digits=16, decimal_places=2)


def _line_total(expression):
    """Sum over a receipt's lines as a subquery (avoids join fan-out with prefetches)."""
    return Coalesce(
        Subquery(
            CherryReceiptLine.objects.filter(receipt=OuterRef("pk"))
            .values("receipt")
            .annotate(total=Sum(expression))
            .values("total"),
            output_field=MONEY,
        ),
        Value(0, output_field=MONEY),
    )


def receipts_with_totals():
    return (
        CherryReceipt.objects.select_related("facility", "farmer")
        .prefetch_related("lines")
        .annotate(
            total_kg=_line_total(F("quantity_kg")),
            total_amount=_line_total(F("line_amount") + F("transport_cost") + F("commission")),
        )
    )

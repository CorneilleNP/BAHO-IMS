"""Stock position of HQ receipts: the single place that deducts and balances stock.

    balance = pure weight - kg taken by (non-voided) dry mill batches + adjustments

`processed_kg`, `adjusted_kg`, `stock_balance_kg`, `processing_status` and
`processing_date` on HqStockReceipt are a cache of this calculation, refreshed
inside the same transaction as every write that can change it. Nobody types
them in.
"""

from decimal import Decimal

from django.db.models import Min, Sum
from django.db.models.functions import Coalesce

from .models import DryMillBatchInput, HqStockReceipt, StockAdjustment

ZERO = Decimal("0")
Status = HqStockReceipt.ProcessingStatus


def pure_weight(receipt: HqStockReceipt) -> Decimal:
    # pure_weight_kg is a DB-generated column; compute it so unsaved/just-saved objects work too.
    return Decimal(receipt.net_weight_kg) - Decimal(receipt.weight_of_bags_kg or 0)


def refresh_receipt_stock(receipt: HqStockReceipt) -> HqStockReceipt:
    inputs = DryMillBatchInput.objects.filter(receipt=receipt, batch__is_deleted=False)
    agg = inputs.aggregate(kg=Coalesce(Sum("qty_kg"), ZERO), first=Min("batch__processing_date"))
    adjusted = StockAdjustment.objects.filter(receipt=receipt).aggregate(
        kg=Coalesce(Sum("qty_kg"), ZERO)
    )["kg"]
    processed = agg["kg"]
    balance = pure_weight(receipt) - processed + adjusted

    if processed == 0 and adjusted >= 0:
        status = Status.NOT_STARTED
    elif balance <= 0:
        status = Status.COMPLETED
    else:
        status = Status.IN_PROGRESS

    receipt.processed_kg = processed
    receipt.adjusted_kg = adjusted
    receipt.stock_balance_kg = balance
    receipt.processing_status = status
    receipt.processing_date = agg["first"]
    HqStockReceipt.all_objects.filter(pk=receipt.pk).update(
        processed_kg=processed,
        adjusted_kg=adjusted,
        stock_balance_kg=balance,
        processing_status=status,
        processing_date=agg["first"],
    )
    return receipt


def has_stock_movements(receipt: HqStockReceipt) -> bool:
    return (
        receipt.batch_inputs.filter(batch__is_deleted=False).exists()
        or receipt.adjustments.exists()
    )

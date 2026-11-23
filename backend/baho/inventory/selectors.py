"""HQ stock ledger: every movement of parchment and green coffee, in date order.

Nothing here is stored. Each row is derived from the record that moved the
stock, so the ledger can never disagree with the balances shown elsewhere:

    PARCH / GREEN in   stock receipt (pure weight = net - bags), by its item type
    PARCH out          kg a dry mill batch took from a receipt
    +/- adjustment     stock adjustment on a receipt (same item type as the receipt)
    GREEN in           dry mill batch output, per export grade
    GREEN out          export shipment line

Voided receipts, batches and shipments are left out, exactly like the balances.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date
from decimal import Decimal

from baho.drymill.models import (
    DryMillBatchInput,
    DryMillOutput,
    HqStockReceipt,
    StockAdjustment,
)
from baho.sales.models import ExportShipmentLine

ZERO = Decimal("0")
PARCH = HqStockReceipt.ItemType.PARCH
GREEN = HqStockReceipt.ItemType.GREEN


class MovementType:
    RECEIVED = "RECEIVED"
    MILLED = "MILLED"
    ADJUSTMENT = "ADJUSTMENT"
    GREEN_PRODUCED = "GREEN_PRODUCED"
    SHIPPED = "SHIPPED"

    LABELS = {
        RECEIVED: "Received at HQ",
        MILLED: "Taken by dry mill batch",
        ADJUSTMENT: "Stock adjustment",
        GREEN_PRODUCED: "Green coffee produced",
        SHIPPED: "Export shipment",
    }


@dataclass
class Movement:
    date: date
    item_type: str
    movement_type: str
    reference: str
    reference_id: str
    description: str
    qty_in: Decimal
    qty_out: Decimal
    process: str = ""
    sub_process: str = ""
    export_grade: str = ""
    source: str = ""
    balance: Decimal = ZERO

    @property
    def net(self) -> Decimal:
        return self.qty_in - self.qty_out

    def as_dict(self) -> dict:
        data = asdict(self)
        data["movement_label"] = MovementType.LABELS[self.movement_type]
        return data


def _source_name(obj) -> str:
    if getattr(obj, "source_facility", None):
        return obj.source_facility.name
    if getattr(obj, "source_supplier", None):
        return obj.source_supplier.name
    return "Mixed"


def _name(obj) -> str:
    return obj.name if obj is not None else ""


def _receipt_rows(filters) -> list[Movement]:
    qs = HqStockReceipt.objects.select_related(
        "process", "sub_process", "source_facility", "source_supplier"
    )
    if filters.get("process"):
        qs = qs.filter(process=filters["process"])
    if filters.get("source_facility"):
        qs = qs.filter(source_facility=filters["source_facility"])
    if filters.get("source_supplier"):
        qs = qs.filter(source_supplier=filters["source_supplier"])
    rows = []
    for r in qs:
        pure = Decimal(r.net_weight_kg) - Decimal(r.weight_of_bags_kg or 0)
        rows.append(
            Movement(
                date=r.arrival_date,
                item_type=r.item_type,
                movement_type=MovementType.RECEIVED,
                reference=r.receipt_number,
                reference_id=str(r.pk),
                description=f"Grade {r.grade}" if getattr(r, "grade", "") else "",
                qty_in=pure,
                qty_out=ZERO,
                process=_name(r.process),
                sub_process=_name(r.sub_process),
                source=_source_name(r),
            )
        )
    return rows


def _milled_rows(filters) -> list[Movement]:
    qs = DryMillBatchInput.objects.filter(
        batch__is_deleted=False, receipt__is_deleted=False
    ).select_related(
        "batch",
        "receipt",
        "receipt__process",
        "receipt__sub_process",
        "receipt__source_facility",
        "receipt__source_supplier",
    )
    if filters.get("process"):
        qs = qs.filter(receipt__process=filters["process"])
    if filters.get("source_facility"):
        qs = qs.filter(receipt__source_facility=filters["source_facility"])
    if filters.get("source_supplier"):
        qs = qs.filter(receipt__source_supplier=filters["source_supplier"])
    return [
        Movement(
            date=i.batch.processing_date,
            item_type=i.receipt.item_type,
            movement_type=MovementType.MILLED,
            reference=i.batch.batch_no,
            reference_id=str(i.batch_id),
            description=f"From receipt {i.receipt.receipt_number}",
            qty_in=ZERO,
            qty_out=Decimal(i.qty_kg),
            process=_name(i.receipt.process),
            sub_process=_name(i.receipt.sub_process),
            source=_source_name(i.receipt),
        )
        for i in qs
    ]


def _adjustment_rows(filters) -> list[Movement]:
    qs = StockAdjustment.objects.filter(receipt__is_deleted=False).select_related(
        "receipt",
        "receipt__process",
        "receipt__sub_process",
        "receipt__source_facility",
        "receipt__source_supplier",
    )
    if filters.get("process"):
        qs = qs.filter(receipt__process=filters["process"])
    if filters.get("source_facility"):
        qs = qs.filter(receipt__source_facility=filters["source_facility"])
    if filters.get("source_supplier"):
        qs = qs.filter(receipt__source_supplier=filters["source_supplier"])
    rows = []
    for a in qs:
        qty = Decimal(a.qty_kg)
        rows.append(
            Movement(
                date=a.adjusted_on,
                item_type=a.receipt.item_type,
                movement_type=MovementType.ADJUSTMENT,
                reference=a.receipt.receipt_number,
                reference_id=str(a.receipt_id),
                description=a.reason,
                qty_in=qty if qty > 0 else ZERO,
                qty_out=-qty if qty < 0 else ZERO,
                process=_name(a.receipt.process),
                sub_process=_name(a.receipt.sub_process),
                source=_source_name(a.receipt),
            )
        )
    return rows


def _green_produced_rows(filters) -> list[Movement]:
    qs = DryMillOutput.objects.filter(batch__is_deleted=False).select_related(
        "batch",
        "batch__process",
        "batch__sub_process",
        "batch__source_facility",
        "batch__source_supplier",
        "export_grade",
    )
    if filters.get("process"):
        qs = qs.filter(batch__process=filters["process"])
    if filters.get("source_facility"):
        qs = qs.filter(batch__source_facility=filters["source_facility"])
    if filters.get("source_supplier"):
        qs = qs.filter(batch__source_supplier=filters["source_supplier"])
    if filters.get("export_grade"):
        qs = qs.filter(export_grade=filters["export_grade"])
    return [
        Movement(
            date=o.batch.processing_date,
            item_type=GREEN,
            movement_type=MovementType.GREEN_PRODUCED,
            reference=o.batch.batch_no,
            reference_id=str(o.batch_id),
            description=o.batch.process_product or "",
            qty_in=Decimal(o.qty_kg),
            qty_out=ZERO,
            process=_name(o.batch.process),
            sub_process=_name(o.batch.sub_process),
            export_grade=o.export_grade.name,
            source=_source_name(o.batch),
        )
        for o in qs
    ]


def _shipped_rows(filters) -> list[Movement]:
    qs = ExportShipmentLine.objects.filter(shipment__is_deleted=False).select_related(
        "shipment",
        "shipment__client",
        "process",
        "sub_process",
        "source_facility",
        "source_supplier",
        "export_grade",
    )
    if filters.get("process"):
        qs = qs.filter(process=filters["process"])
    if filters.get("source_facility"):
        qs = qs.filter(source_facility=filters["source_facility"])
    if filters.get("source_supplier"):
        qs = qs.filter(source_supplier=filters["source_supplier"])
    if filters.get("export_grade"):
        qs = qs.filter(export_grade=filters["export_grade"])
    return [
        Movement(
            date=line.shipment.delivery_to_naeb_date,
            item_type=GREEN,
            movement_type=MovementType.SHIPPED,
            reference=line.shipment.shipment_no,
            reference_id=str(line.shipment_id),
            description=f"{line.shipment.client.name} - {line.process_product}".strip(" -"),
            qty_in=ZERO,
            qty_out=Decimal(line.qty_kg),
            process=_name(line.process),
            sub_process=_name(line.sub_process),
            export_grade=line.export_grade.name,
            source=(
                line.source_facility.name
                if line.source_facility
                else (line.source_supplier.name if line.source_supplier else "")
            ),
        )
        for line in qs
    ]


_ORDER = {
    MovementType.RECEIVED: 0,
    MovementType.GREEN_PRODUCED: 1,
    MovementType.ADJUSTMENT: 2,
    MovementType.MILLED: 3,
    MovementType.SHIPPED: 4,
}


def stock_ledger(
    *,
    item_type: str,
    date_from: date | None = None,
    date_to: date | None = None,
    process=None,
    source_facility=None,
    source_supplier=None,
    export_grade=None,
) -> dict:
    """Movements of one item type (PARCH or GREEN) with a running balance.

    `opening_balance` is the balance on the day before `date_from`; rows inside
    the period carry the running balance after each movement. An export grade
    filter only applies to green coffee (parchment has no export grade yet).
    """
    filters = {
        "process": process,
        "source_facility": source_facility,
        "source_supplier": source_supplier,
        "export_grade": export_grade,
    }
    rows: list[Movement] = []
    if not export_grade:
        rows += _receipt_rows(filters) + _milled_rows(filters) + _adjustment_rows(filters)
    if item_type == GREEN:
        rows += _green_produced_rows(filters) + _shipped_rows(filters)
    rows = [r for r in rows if r.item_type == item_type]
    rows.sort(key=lambda r: (r.date, _ORDER[r.movement_type], r.reference))

    opening = sum((r.net for r in rows if date_from and r.date < date_from), ZERO)
    balance = opening
    period = []
    for r in rows:
        if date_from and r.date < date_from:
            continue
        if date_to and r.date > date_to:
            break
        balance += r.net
        r.balance = balance
        period.append(r)

    return {
        "item_type": item_type,
        "opening_balance": opening,
        "total_in": sum((r.qty_in for r in period), ZERO),
        "total_out": sum((r.qty_out for r in period), ZERO),
        "closing_balance": balance,
        "rows": [r.as_dict() for r in period],
    }

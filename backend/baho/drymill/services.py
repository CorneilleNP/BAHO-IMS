"""Write operations for the HQ dry mill. Every multi-row write is one transaction.

Stock rules (see stock.py):
- a receipt's stock is deducted only by dry mill batch inputs and adjustments;
- only ACCEPTED parchment can be milled, never more than its balance;
- weights of a receipt are locked once stock has moved (use an adjustment instead);
- a receipt with stock movements cannot be voided; voiding a batch gives the stock back.
"""

from datetime import date
from decimal import Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from baho.core.dates import crop_year_for, hq_facility
from baho.core.numbering import next_sequence
from baho.processing.catalog import resolve_process_label

from .models import (
    DryMillBatch,
    DryMillBatchInput,
    DryMillOutput,
    HqStockReceipt,
    OriginType,
    StockAdjustment,
    Supplier,
)
from .stock import has_stock_movements, pure_weight, refresh_receipt_stock

CENT = Decimal("0.01")
WEIGHT_FIELDS = {"net_weight_kg", "weight_of_bags_kg", "number_of_bags", "tare_per_bag_kg"}


def _check_source(origin_type, source_facility, source_supplier) -> None:
    if origin_type == OriginType.OWN_CWS:
        if source_facility is None or source_supplier is not None:
            raise ValidationError(
                {"source_facility": ["Choose the Baho CWS this coffee came from."]}
            )
    elif origin_type == OriginType.PARTNER_SUPPLIER:
        if source_supplier is None or source_facility is not None:
            raise ValidationError({"source_supplier": ["Choose the partner supplier."]})
    else:
        raise ValidationError({"origin_type": ["A stock receipt comes from one CWS or supplier."]})


def _apply_process(fields: dict, *, require: bool) -> None:
    """Fill process/sub_process consistently (sub-process decides its process)."""
    sub = fields.get("sub_process")
    if sub is not None and sub.process_id:
        fields["process"] = sub.process
    raw = (fields.get("process_raw") or "").strip()
    if fields.get("process") is None and sub is None and raw:
        fields["process"], fields["sub_process"] = resolve_process_label(raw)
    if not fields.get("process_raw"):
        parts = [p.name for p in (fields.get("process"), fields.get("sub_process")) if p]
        fields["process_raw"] = " / ".join(parts)
    if require and fields.get("process") is None:
        raise ValidationError({"process": ["Choose one of the five processes."]})


def _bags_weight(fields: dict) -> None:
    bags, tare = fields.get("number_of_bags"), fields.get("tare_per_bag_kg")
    if not fields.get("weight_of_bags_kg") and bags and tare:
        fields["weight_of_bags_kg"] = (Decimal(bags) * Decimal(tare)).quantize(CENT)


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
    require_process: bool = True,
    **fields,
) -> HqStockReceipt:
    _check_source(origin_type, source_facility, source_supplier)
    _apply_process(fields, require=require_process)
    _bags_weight(fields)
    if Decimal(fields.get("weight_of_bags_kg") or 0) > Decimal(net_weight_kg):
        raise ValidationError(
            {"weight_of_bags_kg": ["Weight of bags cannot exceed the net weight."]}
        )
    if "grade" in fields:
        fields["grade"] = (fields["grade"] or "").strip().upper()

    crop_year = crop_year_for(arrival_date)
    number = next_sequence(f"hq-receipt:{crop_year.label}")
    receipt = HqStockReceipt.objects.create(
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
    return refresh_receipt_stock(receipt)


@transaction.atomic
def update_stock_receipt(*, user, receipt: HqStockReceipt, **fields) -> HqStockReceipt:
    """Edit a receipt (the same wizard as create). Weights lock once stock has moved."""
    receipt = HqStockReceipt.objects.select_for_update().get(pk=receipt.pk)
    weights = {f: fields.get(f, getattr(receipt, f)) for f in WEIGHT_FIELDS}
    if "weight_of_bags_kg" in fields and not fields["weight_of_bags_kg"]:
        weights["weight_of_bags_kg"] = None
        _bags_weight(weights)  # empty bag weight = bags x tare, as on create
        fields["weight_of_bags_kg"] = weights["weight_of_bags_kg"] or Decimal("0")
        weights["weight_of_bags_kg"] = fields["weight_of_bags_kg"]

    def _num(value):
        return Decimal(str(value or 0))

    changed_weights = {
        f for f in WEIGHT_FIELDS & fields.keys() if _num(fields[f]) != _num(getattr(receipt, f))
    }
    if _num(weights["weight_of_bags_kg"]) > _num(weights["net_weight_kg"]):
        raise ValidationError(
            {"weight_of_bags_kg": ["Weight of bags cannot exceed the net weight."]}
        )
    if changed_weights and has_stock_movements(receipt):
        raise ValidationError(
            {
                "net_weight_kg": [
                    "Weights cannot change after stock has been milled or adjusted. "
                    "Record a stock adjustment instead."
                ]
            }
        )
    origin = fields.pop("origin_type", receipt.origin_type)
    facility = fields.pop("source_facility", receipt.source_facility)
    supplier = fields.pop("source_supplier", receipt.source_supplier)
    _check_source(origin, facility, supplier)
    if {"process", "sub_process"} & fields.keys():
        fields.setdefault("process", receipt.process)
        fields.setdefault("sub_process", receipt.sub_process)
        fields["process_raw"] = ""
        _apply_process(fields, require=True)
    if "arrival_date" in fields:
        receipt.crop_year = crop_year_for(fields["arrival_date"])
    if "grade" in fields:
        fields["grade"] = (fields["grade"] or "").strip().upper()

    receipt.origin_type, receipt.source_facility, receipt.source_supplier = (
        origin,
        facility,
        supplier,
    )
    for name, value in fields.items():
        setattr(receipt, name, value)
    receipt.updated_by = user
    receipt.save()
    receipt.refresh_from_db()
    return refresh_receipt_stock(receipt)


@transaction.atomic
def set_quality_status(*, user, receipts, quality_status: str, comment: str = "") -> int:
    """Accept / reject / reset quality for one or many receipts."""
    comment = (comment or "").strip()
    if quality_status == HqStockReceipt.QualityStatus.REJECTED and not comment:
        raise ValidationError({"comment": ["Give the reason the coffee was rejected."]})
    locked = list(
        HqStockReceipt.objects.select_for_update().filter(pk__in=[r.pk for r in receipts])
    )
    if quality_status != HqStockReceipt.QualityStatus.ACCEPTED:
        milled = [r.receipt_number for r in locked if r.processed_kg > 0]
        if milled:
            raise ValidationError(
                {"quality_status": [f"Already milled, quality cannot change: {', '.join(milled)}"]}
            )
    for receipt in locked:
        receipt.quality_status = quality_status
        receipt.quality_comment = comment
        receipt.updated_by = user
        receipt.save(
            update_fields=["quality_status", "quality_comment", "updated_by", "updated_at"]
        )
    return len(locked)


@transaction.atomic
def adjust_stock(*, user, receipt, qty_kg, reason: str, adjusted_on: date | None = None):
    """Stock correction with a reason (negative = remove). Balance can never go below 0."""
    receipt = HqStockReceipt.objects.select_for_update().get(pk=receipt.pk)
    if not (reason or "").strip():
        raise ValidationError({"reason": ["Explain the adjustment."]})
    if Decimal(qty_kg) == 0:
        raise ValidationError({"qty_kg": ["Enter a quantity other than 0."]})
    if receipt.stock_balance_kg + Decimal(qty_kg) < 0:
        raise ValidationError(
            {"qty_kg": [f"Only {receipt.stock_balance_kg} kg is left on {receipt.receipt_number}."]}
        )
    if receipt.stock_balance_kg + Decimal(qty_kg) > pure_weight(receipt):
        raise ValidationError({"qty_kg": ["Balance cannot exceed the receipt's pure weight."]})
    StockAdjustment.objects.create(
        receipt=receipt,
        qty_kg=qty_kg,
        reason=reason.strip(),
        adjusted_on=adjusted_on or date.today(),
        created_by=user,
    )
    return refresh_receipt_stock(receipt)


def check_receipt_can_be_voided(receipt: HqStockReceipt) -> None:
    if has_stock_movements(receipt):
        raise ValidationError(
            ["This receipt has been milled or adjusted; void those batches/adjustments first."]
        )


def available_stock(
    *, process=None, sub_process=None, grade="", source_facility=None, source_supplier=None
):
    """Accepted parchment with a balance matching a selection, oldest first (FIFO order)."""
    qs = HqStockReceipt.objects.filter(
        quality_status=HqStockReceipt.QualityStatus.ACCEPTED,
        item_type=HqStockReceipt.ItemType.PARCH,
        stock_balance_kg__gt=0,
    )
    if process is not None:
        qs = qs.filter(process=process)
    if sub_process is not None:
        qs = qs.filter(sub_process=sub_process)
    if grade:
        qs = qs.filter(grade=grade.strip().upper())
    if source_facility is not None:
        qs = qs.filter(source_facility=source_facility)
    if source_supplier is not None:
        qs = qs.filter(source_supplier=source_supplier)
    return qs.order_by("arrival_date", "receipt_number")


def _describe(line) -> str:
    parts = [
        getattr(line.get("process"), "name", "") or "any process",
        getattr(line.get("sub_process"), "name", ""),
        (line.get("grade") or "").upper(),
        getattr(line.get("source_facility") or line.get("source_supplier"), "name", ""),
    ]
    return " / ".join(p for p in parts if p)


def allocate_from_stock(stock_lines) -> list[dict]:
    """Turn "mill N kg of <process / sub-process / grade / source>" into receipt deductions.

    Takes from the available (accepted, parchment) stock matching each line, oldest
    receipts first, so the user never has to pick receipts. Rows are locked.
    """
    taken: dict = {}  # receipt pk -> [receipt, kg] so two lines can share a receipt
    problems = []
    for line in stock_lines:
        need = Decimal(line["qty_kg"])
        if need <= 0:
            continue
        if line.get("process") is None:
            problems.append("Choose the process of the parchment being milled.")
            continue
        pool = available_stock(
            process=line.get("process"),
            sub_process=line.get("sub_process"),
            grade=line.get("grade") or "",
            source_facility=line.get("source_facility"),
            source_supplier=line.get("source_supplier"),
        ).select_for_update()
        receipts = list(pool)
        free = sum(
            (r.stock_balance_kg - taken.get(r.pk, [r, Decimal("0")])[1] for r in receipts),
            Decimal("0"),
        )
        if need > free:
            problems.append(
                f"Only {free:,.2f} kg available for {_describe(line)}; {need:,.2f} kg requested."
            )
            continue
        for receipt in receipts:
            if need <= 0:
                break
            already = taken.get(receipt.pk, [receipt, Decimal("0")])[1]
            take = min(receipt.stock_balance_kg - already, need)
            if take > 0:
                taken[receipt.pk] = [receipt, already + take]
                need -= take
    if problems:
        raise ValidationError({"stock_lines": problems})
    return [{"receipt": receipt, "qty_kg": kg} for receipt, kg in taken.values()]


@transaction.atomic
def create_dry_mill_batch(
    *,
    user,
    processing_date,
    process_product,
    outputs,
    stock_lines=None,
    inputs=None,
    batch_no="",
    status=DryMillBatch.Status.COMPLETED,
) -> DryMillBatch:
    """Mill parchment taken out of the available stock.

    `stock_lines`: [{"process", "sub_process"?, "grade"?, "source_facility"?, "source_supplier"?,
                    "qty_kg"}] — what was milled; deducted from matching stock, oldest first.
    `inputs`:      [{"receipt", "qty_kg"}] — explicit receipts (imports / corrections only).
    `outputs`:     [{"export_grade", "qty_kg"}] — zero lines are skipped.
    """
    if stock_lines:
        inputs = allocate_from_stock(stock_lines)
    inputs = [i for i in (inputs or []) if i["qty_kg"] > 0]
    if not inputs:
        raise ValidationError(
            {"stock_lines": ["Enter the parchment taken from stock (process and kg)."]}
        )
    ids = [i["receipt"].pk for i in inputs]
    if len(ids) != len(set(ids)):
        raise ValidationError({"inputs": ["Each stock receipt can be used once per batch."]})

    locked = {r.pk: r for r in HqStockReceipt.objects.select_for_update().filter(pk__in=ids)}
    problems = []
    for line in inputs:
        receipt = locked[line["receipt"].pk]
        if receipt.quality_status != HqStockReceipt.QualityStatus.ACCEPTED:
            problems.append(f"{receipt.receipt_number} is not quality-accepted")
        elif receipt.item_type != HqStockReceipt.ItemType.PARCH:
            problems.append(f"{receipt.receipt_number} is not parchment")
        elif Decimal(line["qty_kg"]) > receipt.stock_balance_kg:
            problems.append(f"{receipt.receipt_number} has only {receipt.stock_balance_kg} kg left")
    if problems:
        raise ValidationError({"inputs": problems})

    parch_input_kg = sum((Decimal(i["qty_kg"]) for i in inputs), Decimal("0"))
    outputs = [o for o in outputs if o["qty_kg"] > 0]
    grades = [o["export_grade"].id for o in outputs]
    if len(grades) != len(set(grades)):
        raise ValidationError({"outputs": ["Each grade can appear only once."]})
    if sum((o["qty_kg"] for o in outputs), Decimal("0")) > parch_input_kg:
        raise ValidationError(
            {"outputs": ["Green output cannot be more than the parchment input."]}
        )

    sources = {(r.origin_type, r.source_facility_id, r.source_supplier_id) for r in locked.values()}
    if len(sources) == 1:
        origin_type, facility_id, supplier_id = sources.pop()
    else:
        origin_type, facility_id, supplier_id = OriginType.MIXED, None, None

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
        source_facility_id=facility_id,
        source_supplier_id=supplier_id,
        process_product=process_product.strip(),
        parch_input_kg=parch_input_kg,
        status=status,
        created_by=user,
        updated_by=user,
    )
    DryMillBatchInput.objects.bulk_create(
        [
            DryMillBatchInput(batch=batch, receipt=locked[i["receipt"].pk], qty_kg=i["qty_kg"])
            for i in inputs
        ]
    )
    DryMillOutput.objects.bulk_create([DryMillOutput(batch=batch, **o) for o in outputs])
    for receipt in locked.values():
        refresh_receipt_stock(receipt)
    return batch


def release_batch_stock(batch: DryMillBatch) -> None:
    """After a batch is voided, give its parchment back to the receipts it came from."""
    for line in batch.inputs.select_related("receipt"):
        refresh_receipt_stock(line.receipt)

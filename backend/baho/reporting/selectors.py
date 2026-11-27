"""Dashboard figures, always calculated from the stored records (nothing cached)."""

import uuid
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Count, F, Min, Q, Sum, Value
from django.db.models.functions import Coalesce, NullIf

from baho.drymill.models import (
    DryMillBatch,
    DryMillBatchInput,
    DryMillOutput,
    ExportGrade,
    HqStockReceipt,
)
from baho.processing.models import LotGradeResult, Process, ProcessingLot
from baho.reception.models import CherryReceipt, CherryReceiptLine
from baho.sales.models import ExportShipmentLine

ZERO = Decimal("0")


def _live_outputs(*, process: str = "", sub_process: str = "", source: str = ""):
    """Dry mill outputs of batches that are not voided, optionally filtered to what
    the batch produced (one of the 5 processes / its sub-process; "none" = unassigned)
    and/or its source CWS or supplier (a batch pooled from several sources is "Mixed"
    and matches no source filter)."""
    qs = DryMillOutput.objects.filter(batch__is_deleted=False)
    if process == "none":
        qs = qs.filter(batch__process__isnull=True)
    elif process:
        qs = qs.filter(batch__process_id=process)
    if sub_process:
        qs = qs.filter(batch__sub_process_id=sub_process)
    if source:
        qs = qs.filter(
            Q(batch__source_facility__code=source) | Q(batch__source_supplier__name=source)
        )
    return qs


def _live_lines(*, process: str = "", sub_process: str = "", source: str = ""):
    """Shipment lines of shipments that are not voided, optionally filtered to the
    process / sub-process / source recorded on the line ("none" = unassigned process)."""
    qs = ExportShipmentLine.objects.filter(shipment__is_deleted=False)
    if process == "none":
        qs = qs.filter(process__isnull=True)
    elif process:
        qs = qs.filter(process_id=process)
    if sub_process:
        qs = qs.filter(sub_process_id=sub_process)
    if source:
        qs = qs.filter(Q(source_facility__code=source) | Q(source_supplier__name=source))
    return qs


def _in_range(qs, field, date_from, date_to):
    if date_from:
        qs = qs.filter(**{f"{field}__gte": date_from})
    if date_to:
        qs = qs.filter(**{f"{field}__lte": date_to})
    return qs


def _pct(part, whole) -> Decimal:
    if not whole:
        return ZERO
    return (Decimal(part) / Decimal(whole) * 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _ranked(rows, label_key, value_key="kg"):
    return sorted(
        ({"label": row[label_key] or "—", "kg": row[value_key] or ZERO} for row in rows),
        key=lambda r: r["kg"],
        reverse=True,
    )


def _source_label():
    return Coalesce("source_facility__code", "source_supplier__name")


# --- Stock update ----------------------------------------------------------------


def stock_summary(
    *,
    day: date | None = None,
    process: str = "",
    sub_process: str = "",
    grade: str = "",
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict:
    """`process` / `sub_process` are catalogue ids ("none" = not assigned yet)."""
    all_receipts = HqStockReceipt.objects.all()
    base = _in_range(all_receipts, "arrival_date", date_from, date_to)
    filtered = base
    if process == "none":
        filtered = filtered.filter(process__isnull=True)
    elif process:
        filtered = filtered.filter(process_id=process)
    if sub_process:
        filtered = filtered.filter(sub_process_id=sub_process)
    if grade:
        filtered = filtered.filter(grade=grade)

    if day is None:
        latest = filtered.order_by("-arrival_date").values_list("arrival_date", flat=True).first()
        day = latest or date.today()

    def totals(qs):
        agg = qs.aggregate(
            net=Coalesce(Sum("net_weight_kg"), ZERO),
            pure=Coalesce(Sum("pure_weight_kg"), ZERO),
            bags=Coalesce(Sum("weight_of_bags_kg"), ZERO),
            processed=Coalesce(Sum("processed_kg"), ZERO),
            adjusted=Coalesce(Sum("adjusted_kg"), ZERO),
            balance=Coalesce(Sum("stock_balance_kg"), ZERO),
            count=Count("id"),
        )
        return {
            "net_weight_kg": agg["net"],
            "pure_weight_kg": agg["pure"],
            "weight_of_bags_kg": agg["bags"],
            "processed_kg": agg["processed"],
            "adjusted_kg": agg["adjusted"],
            "stock_balance_kg": agg["balance"],
            "receipts": agg["count"],
        }

    previous_day = (
        filtered.filter(arrival_date__lt=day)
        .order_by("-arrival_date")
        .values_list("arrival_date", flat=True)
        .first()
    )
    day_totals = totals(filtered.filter(arrival_date=day))
    previous_totals = totals(filtered.filter(arrival_date=previous_day)) if previous_day else None
    change = None
    if previous_totals and previous_totals["net_weight_kg"]:
        change = _pct(
            day_totals["net_weight_kg"] - previous_totals["net_weight_kg"],
            previous_totals["net_weight_kg"],
        )

    return {
        "date": day,
        "day": day_totals,
        "previous_date": previous_day,
        "change_vs_previous_pct": change,
        "season": totals(filtered),
        "by_process": _ranked(
            (base.filter(grade=grade) if grade else base)
            .annotate(label=Coalesce("process__name", Value("Not assigned yet")))
            .values("label")
            .annotate(kg=Sum("net_weight_kg")),
            "label",
        ),
        "by_sub_process": _ranked(
            filtered.annotate(
                label=Coalesce("sub_process__name", "process__name", Value("Not assigned yet"))
            )
            .values("label")
            .annotate(kg=Sum("net_weight_kg")),
            "label",
        ),
        "by_grade": _ranked(
            filtered.annotate(label=Coalesce(NullIf("grade", Value("")), Value("No grade")))
            .values("label")
            .annotate(kg=Sum("net_weight_kg")),
            "label",
        ),
        "balance_by_grade": _ranked(
            filtered.filter(stock_balance_kg__gt=0)
            .annotate(label=Coalesce(NullIf("grade", Value("")), Value("No grade")))
            .values("label")
            .annotate(kg=Sum("stock_balance_kg")),
            "label",
        ),
        "awaiting_quality": totals(filtered.filter(quality_status="PENDING")),
        "by_source": _ranked(
            filtered.annotate(source=_source_label())
            .values("source")
            .annotate(kg=Sum("net_weight_kg")),
            "source",
        ),
        "options": {
            "processes": [
                {"id": str(p.id), "name": p.name} for p in Process.objects.filter(is_active=True)
            ],
            "grades": sorted({g for g in all_receipts.values_list("grade", flat=True) if g}),
            "dates": sorted(set(all_receipts.values_list("arrival_date", flat=True)), reverse=True)[
                :60
            ],
        },
    }


# --- Parchment processing -----------------------------------------------------------


def _receipt_filter(prefix: str, *, source="", process="", sub_process="", grade="") -> Q:
    """Filter on the stock receipts behind parchment (process "none" = unassigned)."""
    q = Q()
    if source:
        q &= Q(**{f"{prefix}source_facility__code": source}) | Q(
            **{f"{prefix}source_supplier__name": source}
        )
    if process == "none":
        q &= Q(**{f"{prefix}process__isnull": True})
    elif process:
        q &= Q(**{f"{prefix}process_id": process})
    if sub_process:
        q &= Q(**{f"{prefix}sub_process_id": sub_process})
    if grade:
        q &= Q(**{f"{prefix}grade": grade})
    return q


def parchment_stock(*, source="", process="", sub_process="", grade="") -> dict:
    """Received vs milled vs in stock for HQ parchment (all dates), for the same filters."""
    receipts = HqStockReceipt.objects.filter(item_type="PARCH").filter(
        _receipt_filter("", source=source, process=process, sub_process=sub_process, grade=grade)
    )
    agg = receipts.aggregate(
        received=Coalesce(Sum("pure_weight_kg"), ZERO),
        milled=Coalesce(Sum("processed_kg"), ZERO),
        adjusted=Coalesce(Sum("adjusted_kg"), ZERO),
        balance=Coalesce(Sum("stock_balance_kg"), ZERO),
        receipts=Count("id"),
    )
    available = receipts.filter(quality_status="ACCEPTED", stock_balance_kg__gt=0).aggregate(
        v=Coalesce(Sum("stock_balance_kg"), ZERO)
    )["v"]
    return {
        "receipts": agg["receipts"],
        "received_kg": agg["received"],
        "milled_kg": agg["milled"],
        "adjusted_kg": agg["adjusted"],
        "balance_kg": agg["balance"],
        "available_to_mill_kg": available,
        "balance_pct": _pct(agg["balance"], agg["received"]),
    }


def processing_summary(
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    source: str = "",
    process: str = "",
    sub_process: str = "",
    grade: str = "",
    process_product: str = "",
) -> dict:
    """Dry mill batches in the period. Process / sub-process / grade / source come from the
    stock receipts each batch milled; parchment input then counts only the matching receipts."""
    filters = {"source": source, "process": process, "sub_process": sub_process, "grade": grade}
    by_receipt = any(filters.values())

    batches = _in_range(DryMillBatch.objects.all(), "processing_date", date_from, date_to)
    if process_product:
        batches = batches.filter(process_product=process_product)
    inputs = DryMillBatchInput.objects.filter(batch__in=batches, batch__is_deleted=False)
    if by_receipt:
        inputs = inputs.filter(_receipt_filter("receipt__", **filters))
        batches = batches.filter(pk__in=inputs.values("batch"))

    outputs = _live_outputs().filter(batch__in=batches)
    input_kg = (
        inputs.aggregate(v=Coalesce(Sum("qty_kg"), ZERO))["v"]
        if by_receipt
        else batches.aggregate(v=Coalesce(Sum("parch_input_kg"), ZERO))["v"]
    )
    output_kg = outputs.aggregate(v=Coalesce(Sum("qty_kg"), ZERO))["v"]
    hg_kg = outputs.filter(export_grade__is_high_grade=True).aggregate(
        v=Coalesce(Sum("qty_kg"), ZERO)
    )["v"]

    produced = {
        row["export_grade"]: row["kg"]
        for row in outputs.values("export_grade").annotate(kg=Sum("qty_kg"))
    }
    by_grade = [
        {"code": g.code, "name": g.name, "kg": produced.get(g.id, ZERO)}
        for g in ExportGrade.objects.filter(is_active=True)
    ]

    # Green output on the last processing day vs the processing day before it.
    per_day = list(
        outputs.values("batch__processing_date")
        .annotate(kg=Sum("qty_kg"))
        .order_by("-batch__processing_date")[:2]
    )
    change = None
    if len(per_day) == 2 and per_day[1]["kg"]:
        change = _pct(per_day[0]["kg"] - per_day[1]["kg"], per_day[1]["kg"])

    all_receipts = HqStockReceipt.objects.filter(item_type="PARCH")
    return {
        "totals": {
            "batches": batches.count(),
            "parch_input_kg": input_kg,
            "green_output_kg": output_kg,
            "outturn_pct": _pct(output_kg, input_kg),
            "hg_kg": hg_kg,
            "hg_outturn_pct": _pct(hg_kg, input_kg),
        },
        "change_vs_previous_day_pct": change,
        "last_day": per_day[0]["batch__processing_date"] if per_day else None,
        "stock": parchment_stock(**filters),
        "by_grade": by_grade,
        "by_source": _ranked(
            inputs.annotate(
                source=Coalesce("receipt__source_facility__code", "receipt__source_supplier__name")
            )
            .values("source")
            .annotate(kg=Sum("qty_kg")),
            "source",
        ),
        "by_process": _ranked(
            inputs.annotate(label=Coalesce("receipt__process__name", Value("Not assigned yet")))
            .values("label")
            .annotate(kg=Sum("qty_kg")),
            "label",
        ),
        "options": {
            "sources": sorted(
                {
                    s
                    for s in all_receipts.annotate(s=_source_label()).values_list("s", flat=True)
                    if s
                }
            ),
            "processes": [
                {"id": str(p.id), "name": p.name} for p in Process.objects.filter(is_active=True)
            ],
            "grades": sorted({g for g in all_receipts.values_list("grade", flat=True) if g}),
            "process_products": sorted(
                set(DryMillBatch.objects.values_list("process_product", flat=True))
            ),
        },
    }


# --- Export -------------------------------------------------------------------------


def export_summary(
    *,
    client: str = "",
    export_grade: str = "",
    process: str = "",
    sub_process: str = "",
    source: str = "",
    process_product: str = "",
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict:
    """Processed (dry mill output) vs exported (shipment lines) green coffee, with the
    same process / sub-process / source / grade filters as the stock and processing
    pages - so a shipment can never claim more than what was actually milled for that
    selection, including which CWS or partner supplier it came from."""
    catalog_filters = {"process": process, "sub_process": sub_process, "source": source}
    lines = _live_lines(**catalog_filters)
    if client:
        lines = lines.filter(shipment__client_id=client)
    if export_grade:
        lines = lines.filter(export_grade_id=export_grade)
    if process_product:
        lines = lines.filter(process_product=process_product)
    if date_from:
        lines = lines.filter(shipment__delivery_to_naeb_date__gte=date_from)
    if date_to:
        lines = lines.filter(shipment__delivery_to_naeb_date__lte=date_to)

    exported = {
        row["export_grade"]: row["kg"]
        for row in lines.values("export_grade").annotate(kg=Sum("qty_kg"))
    }
    exported_all = {
        row["export_grade"]: row["kg"]
        for row in _live_lines(**catalog_filters).values("export_grade").annotate(kg=Sum("qty_kg"))
    }
    produced = {
        row["export_grade"]: row["kg"]
        for row in _live_outputs(**catalog_filters)
        .values("export_grade")
        .annotate(kg=Sum("qty_kg"))
    }

    by_grade = []
    for g in ExportGrade.objects.filter(is_active=True):
        made, shipped_total = produced.get(g.id, ZERO), exported_all.get(g.id, ZERO)
        by_grade.append(
            {
                "id": str(g.id),
                "code": g.code,
                "name": g.name,
                "exported_kg": exported.get(g.id, ZERO),
                "produced_kg": made,
                "balance_kg": made - shipped_total,
            }
        )

    produced_by_process = {
        row["batch__process"]: row["kg"]
        for row in _live_outputs().values("batch__process").annotate(kg=Sum("qty_kg"))
    }
    exported_by_process = {
        row["process"]: row["kg"]
        for row in _live_lines().values("process").annotate(kg=Sum("qty_kg"))
    }
    by_process = [
        {
            "id": str(p.id),
            "name": p.name,
            "produced_kg": produced_by_process.get(p.id, ZERO),
            "exported_kg": exported_by_process.get(p.id, ZERO),
            "balance_kg": produced_by_process.get(p.id, ZERO) - exported_by_process.get(p.id, ZERO),
        }
        for p in Process.objects.filter(is_active=True)
    ]

    produced_by_source = {
        row["label"]: row["kg"]
        for row in _live_outputs()
        .annotate(label=Coalesce("batch__source_facility__code", "batch__source_supplier__name"))
        .values("label")
        .annotate(kg=Sum("qty_kg"))
        if row["label"]
    }
    exported_by_source = {
        row["label"]: row["kg"]
        for row in _live_lines()
        .annotate(label=_source_label())
        .values("label")
        .annotate(kg=Sum("qty_kg"))
        if row["label"]
    }
    by_source = [
        {
            "label": s,
            "produced_kg": produced_by_source.get(s, ZERO),
            "exported_kg": exported_by_source.get(s, ZERO),
            "balance_kg": produced_by_source.get(s, ZERO) - exported_by_source.get(s, ZERO),
        }
        for s in sorted(set(produced_by_source) | set(exported_by_source))
    ]

    produced_total = sum(produced.values(), ZERO)
    return {
        "exported_kg": sum(exported.values(), ZERO),
        "produced_kg": produced_total,
        "stock_balance_kg": produced_total - sum(exported_all.values(), ZERO),
        "by_grade": by_grade,
        "by_process": by_process,
        "by_source": by_source,
        "by_client": _ranked(
            lines.values("shipment__client__name").annotate(kg=Sum("qty_kg")),
            "shipment__client__name",
        ),
        "options": {
            "processes": [
                {"id": str(p.id), "name": p.name} for p in Process.objects.filter(is_active=True)
            ],
            "sources": sorted(produced_by_source),
            "process_products": sorted(
                set(_live_lines().values_list("process_product", flat=True))
            ),
        },
    }


# --- Cherry reception (CWS) ---------------------------------------------------------


def cherry_summary(
    *,
    facility_ids: frozenset | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict:
    """Cherry Reception dashboard: total bought, good vs float, average cost per kg
    (the full cost - cherry price + transport + commission - the same total the
    farmer is paid), and quantity by station. `facility_ids=None` means every
    station (admin/HQ); otherwise only those stations (a CWS clerk's own)."""
    receipts = CherryReceipt.objects.all()
    if facility_ids is not None:
        receipts = receipts.filter(facility_id__in=facility_ids)
    receipts = _in_range(receipts, "received_on", date_from, date_to)

    full_amount = F("line_amount") + F("transport_cost") + F("commission")
    lines = CherryReceiptLine.objects.filter(receipt__in=receipts)
    by_grade = {
        row["cherry_grade"]: row
        for row in lines.values("cherry_grade").annotate(
            kg=Coalesce(Sum("quantity_kg"), ZERO), amount=Coalesce(Sum(full_amount), ZERO)
        )
    }
    good = by_grade.get("GOOD", {"kg": ZERO, "amount": ZERO})
    float_ = by_grade.get("FLOAT", {"kg": ZERO, "amount": ZERO})
    total_kg, total_amount = good["kg"] + float_["kg"], good["amount"] + float_["amount"]

    by_station = sorted(
        (
            {
                "label": row["facility__name"] or "—",
                "kg": row["kg"],
            }
            for row in receipts.values("facility__name").annotate(
                kg=Coalesce(Sum("lines__quantity_kg"), ZERO)
            )
        ),
        key=lambda r: r["kg"],
        reverse=True,
    )

    amount_paid = receipts.aggregate(v=Coalesce(Sum("amount_paid"), ZERO))["v"]
    by_status = dict(
        receipts.values_list("payment_status")
        .annotate(n=Count("id"))
        .values_list("payment_status", "n")
    )
    return {
        "receipts": receipts.count(),
        "total_kg": total_kg,
        "total_amount": total_amount,
        # Paid so far to the farmers for these GRNs, and what is still owed.
        "amount_paid": amount_paid,
        "amount_owed": total_amount - amount_paid,
        "payment_status_counts": {
            "PAID": by_status.get("PAID", 0),
            "PARTIAL": by_status.get("PARTIAL", 0),
            "UNPAID": by_status.get("UNPAID", 0),
        },
        "good": {
            "kg": good["kg"],
            "amount": good["amount"],
            "avg_cost_per_kg": _div(good["amount"], good["kg"]),
        },
        "float": {
            "kg": float_["kg"],
            "amount": float_["amount"],
            "avg_cost_per_kg": _div(float_["amount"], float_["kg"]),
        },
        "by_station": by_station,
    }


def _div(amount: Decimal, kg: Decimal) -> Decimal:
    if not kg:
        return ZERO
    return (Decimal(amount) / Decimal(kg)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def recent_receipts(*, facility_ids: frozenset | None = None, limit: int = 10) -> list[dict]:
    """The latest cherry deliveries (GRNs) with kg, amount and what is still owed."""
    from baho.reception.selectors import receipts_with_totals

    qs = receipts_with_totals()
    if facility_ids is not None:
        qs = qs.filter(facility_id__in=facility_ids)
    rows = []
    for r in qs.order_by("-received_on", "-created_at")[:limit]:
        good = next((line for line in r.lines.all() if line.cherry_grade == "GOOD"), None)
        float_ = next((line for line in r.lines.all() if line.cherry_grade == "FLOAT"), None)
        rows.append(
            {
                "id": str(r.id),
                "grn_number": r.grn_number,
                "received_on": r.received_on,
                "facility_name": r.facility.name,
                "farmer_name": r.farmer.full_name,
                "farmer_code": r.farmer.farmer_code,
                "good_kg": good.quantity_kg if good else ZERO,
                "float_kg": float_.quantity_kg if float_ else ZERO,
                "total_kg": r.total_kg,
                "total_amount": r.total_amount,
                "amount_paid": r.amount_paid,
                "balance": r.total_amount - r.amount_paid,
                "payment_status": r.payment_status,
            }
        )
    return rows


def lots_matching(lots, text: str):
    """Lots whose number contains `text` (any case), or the lot with that id."""
    text = (text or "").strip()
    if not text:
        return lots
    try:
        return lots.filter(Q(pk=uuid.UUID(text)) | Q(lot_number__icontains=text))
    except ValueError:
        return lots.filter(lot_number__icontains=text)


def _lot_scope(
    lots,
    *,
    facility_ids: frozenset | None = None,
    station: str = "",
    process: str = "",
    sub_process: str = "",
):
    """Narrow processing lots to the user's stations, then to the chosen
    station / process / sub-process. The station filter never widens a clerk's
    access: it only intersects it."""
    if facility_ids is not None:
        lots = lots.filter(facility_id__in=facility_ids)
    if station:
        lots = lots.filter(facility_id=station)
    if process:
        lots = lots.filter(process_type__process_id=process)
    if sub_process:
        lots = lots.filter(process_type__sub_process_ref_id=sub_process)
    return lots


def _variance(estimated_kg, actual_kg) -> dict:
    variance_kg = actual_kg - estimated_kg
    return {
        "variance_kg": variance_kg,
        "variance_pct": _pct(variance_kg, estimated_kg) if estimated_kg else None,
    }


def lot_summary(
    *,
    facility_ids: frozenset | None = None,
    station: str = "",
    process: str = "",
    sub_process: str = "",
    date_from: date | None = None,
    date_to: date | None = None,
    lot: str = "",
) -> dict:
    """Processing Lots dashboard: cherry input, estimated vs actual sorted kg,
    out-turn %, by grade / station / process. Admin/HQ roles see every station's
    lots; a CWS clerk sees their own (`facility_ids=None` means every station).
    `station` / `process` / `sub_process` (ids) narrow every figure on the page.

    Variance compares actuals with the estimates of the same grade results only
    (`compared_estimated_kg`), so lots still awaiting actuals don't show as losses."""
    scope = {
        "facility_ids": facility_ids,
        "station": station,
        "process": process,
        "sub_process": sub_process,
    }
    lots = _lot_scope(ProcessingLot.objects.all(), **scope)
    lots = _in_range(lots, "lot_date", date_from, date_to)
    lots = lots_matching(lots, lot)
    results = LotGradeResult.objects.filter(lot__in=lots)
    measured = Q(actual_kg__isnull=False)

    input_kg = lots.aggregate(v=Coalesce(Sum("cherry_input_kg"), ZERO))["v"]
    totals = {
        "est": Coalesce(Sum("estimated_kg"), ZERO),
        "act": Coalesce(Sum("actual_kg"), ZERO),
        "cmp": Coalesce(Sum("estimated_kg", filter=measured), ZERO),
    }
    result_totals = results.aggregate(**totals)
    actual_kg = result_totals["act"]

    by_grade = [
        {
            "code": row["grade__code"],
            "name": row["grade__name"],
            "estimated_kg": row["est"],
            "actual_kg": row["act"],
            "compared_estimated_kg": row["cmp"],
            **_variance(row["cmp"], row["act"]),
        }
        for row in results.values("grade__code", "grade__name")
        .annotate(**totals, order=Min("grade__display_order"))
        .order_by("order", "grade__code")
    ]

    by_station = _ranked(
        lots.values("facility__name").annotate(kg=Coalesce(Sum("cherry_input_kg"), ZERO)),
        "facility__name",
    )
    by_process = _ranked(
        lots.annotate(label=Coalesce("process_type__process__name", Value("Not assigned")))
        .values("label")
        .annotate(kg=Coalesce(Sum("cherry_input_kg"), ZERO)),
        "label",
    )

    # Actual sorted kg on the last lot date with actuals vs the day before it.
    per_day = list(
        results.filter(actual_kg__isnull=False)
        .values("lot__lot_date")
        .annotate(kg=Sum("actual_kg"))
        .order_by("-lot__lot_date")[:2]
    )
    change = None
    if len(per_day) == 2 and per_day[1]["kg"]:
        change = _pct(per_day[0]["kg"] - per_day[1]["kg"], per_day[1]["kg"])

    return {
        "lots": lots.count(),
        "open_lots": lots.filter(status=ProcessingLot.Status.IN_PROGRESS).count(),
        "cherry_input_kg": input_kg,
        "estimated_kg": result_totals["est"],
        "actual_kg": actual_kg,
        "compared_estimated_kg": result_totals["cmp"],
        **_variance(result_totals["cmp"], actual_kg),
        "outturn_pct": _pct(actual_kg, input_kg),
        "change_vs_previous_day_pct": change,
        "last_day": per_day[0]["lot__lot_date"] if per_day else None,
        "by_grade": by_grade,
        "by_station": by_station,
        "by_process": by_process,
        "cws_stock": cws_stock_balance(**scope),
    }


def cws_stock_balance(
    *,
    facility_ids: frozenset | None = None,
    station: str = "",
    process: str = "",
    sub_process: str = "",
) -> list[dict]:
    """How much sorted parchment each CWS has processed (actual kg from its
    lots) vs how much it has already delivered to HQ dry mill (parchment stock
    receipts sourced from it) - the balance still sitting at the station,
    awaiting delivery. Always all-time: a stock position, not a period total,
    same as the other stock balances in this app. `station` / `process` /
    `sub_process` (ids) narrow it like the rest of the lots report."""
    lots = _lot_scope(
        ProcessingLot.objects.all(),
        facility_ids=facility_ids,
        station=station,
        process=process,
        sub_process=sub_process,
    )
    processed_rows = (
        LotGradeResult.objects.filter(lot__in=lots, actual_kg__isnull=False)
        .values(
            "lot__facility_id",
            "lot__facility__name",
            "lot__process_type__process_id",
            "lot__process_type__process__name",
            "lot__process_type__sub_process_ref_id",
            "lot__process_type__sub_process_ref__name",
            "grade__code",
        )
        .annotate(kg=Coalesce(Sum("actual_kg"), ZERO))
    )

    receipts = HqStockReceipt.objects.filter(item_type="PARCH", source_facility__isnull=False)
    if facility_ids is not None:
        receipts = receipts.filter(source_facility_id__in=facility_ids)
    if station:
        receipts = receipts.filter(source_facility_id=station)
    if process:
        receipts = receipts.filter(process_id=process)
    if sub_process:
        receipts = receipts.filter(sub_process_id=sub_process)
    delivered_rows = receipts.values(
        "source_facility_id",
        "source_facility__name",
        "process_id",
        "process__name",
        "sub_process_id",
        "sub_process__name",
        "grade",
    ).annotate(kg=Coalesce(Sum("pure_weight_kg"), ZERO))

    def _key(facility_id, process_id, sub_process_id, grade_code) -> tuple:
        return (facility_id, process_id, sub_process_id, (grade_code or "").strip().upper())

    combined: dict[tuple, dict] = {}
    for row in processed_rows:
        key = _key(
            row["lot__facility_id"],
            row["lot__process_type__process_id"],
            row["lot__process_type__sub_process_ref_id"],
            row["grade__code"],
        )
        entry = combined.setdefault(
            key,
            {
                "facility_name": row["lot__facility__name"],
                "process_name": row["lot__process_type__process__name"] or "—",
                "sub_process_name": row["lot__process_type__sub_process_ref__name"] or "",
                "grade": key[3],
                "processed_kg": ZERO,
                "delivered_kg": ZERO,
            },
        )
        entry["processed_kg"] += row["kg"]

    for row in delivered_rows:
        key = _key(
            row["source_facility_id"], row["process_id"], row["sub_process_id"], row["grade"]
        )
        entry = combined.setdefault(
            key,
            {
                "facility_name": row["source_facility__name"],
                "process_name": row["process__name"] or "Not assigned",
                "sub_process_name": row["sub_process__name"] or "",
                "grade": key[3],
                "processed_kg": ZERO,
                "delivered_kg": ZERO,
            },
        )
        entry["delivered_kg"] += row["kg"]

    rows = []
    for entry in combined.values():
        entry["balance_kg"] = entry["processed_kg"] - entry["delivered_kg"]
        rows.append(entry)
    rows.sort(key=lambda r: (r["facility_name"], r["process_name"], r["grade"]))
    return rows


def transfer_reconciliation_summary(
    *, facility_ids=None, date_from: date | None = None, date_to: date | None = None
) -> dict:
    """Confirmed CWS -> dry mill transfers: the blind double-entry reconciliation,
    one row per process/sub-process/grade line (a delivery note can carry several).

    Gross/bags/net are dry mill's own confirmed weighing (the stock that
    actually exists). Stock loss is the total shortfall where the CWS
    claimed more than dry mill weighed; stock gain is the opposite."""
    from baho.transfers.models import DryMillTransferReceipt, DryMillTransferReceiptLine

    qs = DryMillTransferReceiptLine.objects.filter(
        receipt__status=DryMillTransferReceipt.Status.CONFIRMED
    ).select_related(
        "receipt",
        "cws_line",
        "cws_line__transfer",
        "cws_line__transfer__facility",
        "cws_line__process",
        "cws_line__sub_process",
        "cws_line__grade",
    )
    if facility_ids is not None:
        qs = qs.filter(cws_line__transfer__facility_id__in=facility_ids)
    if date_from:
        qs = qs.filter(cws_line__transfer__transfer_date__gte=date_from)
    if date_to:
        qs = qs.filter(cws_line__transfer__transfer_date__lte=date_to)

    totals = qs.aggregate(
        gross_weight_kg=Coalesce(Sum("gross_weight_kg"), ZERO),
        weight_of_bags_kg=Coalesce(Sum("weight_of_bags_kg"), ZERO),
        net_weight_kg=Coalesce(Sum("net_weight_kg"), ZERO),
    )
    loss_kg = qs.filter(variance_status="STOCK_LOSS").aggregate(
        kg=Coalesce(Sum(F("cws_line__net_weight_kg") - F("net_weight_kg")), ZERO)
    )["kg"]
    gain_kg = qs.filter(variance_status="STOCK_GAIN").aggregate(
        kg=Coalesce(Sum(F("net_weight_kg") - F("cws_line__net_weight_kg")), ZERO)
    )["kg"]

    rows = [
        {
            "delivery_note_no": r.cws_line.transfer.delivery_note_no,
            "facility_name": r.cws_line.transfer.facility.name,
            "transfer_date": r.cws_line.transfer.transfer_date,
            "process_name": r.cws_line.process.name,
            "sub_process_name": r.cws_line.sub_process.name if r.cws_line.sub_process else "",
            "grade": r.cws_line.grade.code,
            "cws_net_kg": r.cws_line.net_weight_kg,
            "dry_mill_net_kg": r.net_weight_kg,
            "variance_kg": r.cws_line.net_weight_kg - r.net_weight_kg,
            "variance_status": r.variance_status,
            "comment": r.receipt.comment,
        }
        for r in qs.order_by("-cws_line__transfer__transfer_date")
    ]
    return {
        "count": qs.count(),
        "gross_weight_kg": totals["gross_weight_kg"],
        "weight_of_bags_kg": totals["weight_of_bags_kg"],
        "net_weight_kg": totals["net_weight_kg"],
        "stock_loss_kg": loss_kg,
        "stock_gain_kg": gain_kg,
        "rows": rows,
    }

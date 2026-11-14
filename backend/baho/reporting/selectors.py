"""Dashboard figures, always calculated from the stored records (nothing cached)."""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Count, Q, Sum, Value
from django.db.models.functions import Coalesce, NullIf

from baho.drymill.models import (
    DryMillBatch,
    DryMillBatchInput,
    DryMillOutput,
    ExportGrade,
    HqStockReceipt,
)
from baho.processing.models import Process
from baho.sales.models import ExportShipmentLine

ZERO = Decimal("0")


def _live_outputs():
    """Dry mill outputs of batches that are not voided."""
    return DryMillOutput.objects.filter(batch__is_deleted=False)


def _live_lines():
    """Shipment lines of shipments that are not voided."""
    return ExportShipmentLine.objects.filter(shipment__is_deleted=False)


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
    process_product: str = "",
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict:
    lines = _live_lines()
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
        for row in _live_lines().values("export_grade").annotate(kg=Sum("qty_kg"))
    }
    produced = {
        row["export_grade"]: row["kg"]
        for row in _live_outputs().values("export_grade").annotate(kg=Sum("qty_kg"))
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

    produced_total = sum(produced.values(), ZERO)
    return {
        "exported_kg": sum(exported.values(), ZERO),
        "produced_kg": produced_total,
        "stock_balance_kg": produced_total - sum(exported_all.values(), ZERO),
        "by_grade": by_grade,
        "by_client": _ranked(
            lines.values("shipment__client__name").annotate(kg=Sum("qty_kg")),
            "shipment__client__name",
        ),
        "options": {
            "process_products": sorted(
                set(_live_lines().values_list("process_product", flat=True))
            ),
        },
    }

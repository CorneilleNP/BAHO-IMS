"""Read/query functions for the dry mill."""

from django.db.models import DecimalField, OuterRef, Subquery, Sum, Value
from django.db.models.functions import Coalesce

from baho.organization.models import Facility

from .models import DryMillBatch, DryMillOutput, HqStockReceipt, OriginType, Supplier

KG = DecimalField(max_digits=14, decimal_places=2)


def stock_receipts():
    return HqStockReceipt.objects.select_related(
        "source_facility", "source_supplier", "process", "sub_process", "created_by", "updated_by"
    )


def batches_with_totals():
    green = (
        DryMillOutput.objects.filter(batch=OuterRef("pk"))
        .values("batch")
        .annotate(total=Sum("qty_kg"))
        .values("total")
    )
    return (
        DryMillBatch.objects.select_related("source_facility", "source_supplier")
        .prefetch_related(
            "outputs__export_grade",
            "inputs__receipt__source_facility",
            "inputs__receipt__source_supplier",
            "inputs__receipt__process",
            "inputs__receipt__sub_process",
        )
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


# --- Change history ----------------------------------------------------------------------

HIDDEN_HISTORY_FIELDS = {
    "updated_at",
    "updated_by",
    "created_at",
    "created_by",
    # calculated stock position: its changes are shown as batch movements / adjustments
    "processed_kg",
    "adjusted_kg",
    "stock_balance_kg",
    "processing_status",
    "processing_date",
}


def _fk_namer():
    from baho.organization.models import CropYear, Facility
    from baho.processing.models import Process, SubProcess

    models = {
        "process": Process,
        "sub_process": SubProcess,
        "source_facility": Facility,
        "source_supplier": Supplier,
        "crop_year": CropYear,
    }
    cache = {}

    def name(field, value):
        if value in (None, "") or field not in models:
            return value
        key = (field, str(value))
        if key not in cache:
            obj = models[field].objects.filter(pk=value).first()
            cache[key] = str(obj) if obj else str(value)
        return cache[key]

    return name


def receipt_history(receipt: HqStockReceipt) -> list[dict]:
    """Newest first: who did what, with old -> new values for every changed field."""
    records = list(receipt.history.select_related("history_user").order_by("history_date"))
    verbose = {f.name: str(f.verbose_name).capitalize() for f in HqStockReceipt._meta.fields}
    name = _fk_namer()
    entries, previous = [], None
    for record in records:
        changes = []
        if previous is not None:
            for change in record.diff_against(previous).changes:
                if change.field in HIDDEN_HISTORY_FIELDS:
                    continue
                changes.append(
                    {
                        "field": verbose.get(change.field, change.field),
                        "old": name(change.field, change.old),
                        "new": name(change.field, change.new),
                    }
                )
        kind = {"+": "created", "~": "changed", "-": "deleted"}[record.history_type]
        if (
            kind == "created"
            or changes
            or record.is_deleted != getattr(previous, "is_deleted", False)
        ):
            entries.append(
                {
                    "date": record.history_date,
                    "user": getattr(record.history_user, "full_name", "") or "System",
                    "type": "voided"
                    if record.is_deleted and not getattr(previous, "is_deleted", False)
                    else kind,
                    "changes": changes,
                }
            )
        previous = record
    return list(reversed(entries))

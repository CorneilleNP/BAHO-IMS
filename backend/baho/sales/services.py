"""Write operations for sales/export. Every multi-row write is one transaction."""

from decimal import Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from baho.core.dates import crop_year_for
from baho.core.numbering import next_sequence

from .models import Client, ExportShipment, ExportShipmentLine


def green_balance(
    *, process=None, sub_process=None, source_facility=None, source_supplier=None, export_grade=None
) -> Decimal:
    """Green coffee available for one process / sub-process / source / export-grade
    selection: produced by live dry mill batches matching it, minus what's already
    shipped against that same selection. Any of these can be left out to widen the
    match. A batch pooled from several sources ("Mixed") only counts under no source
    filter, since its output can't be attributed to one CWS or supplier."""
    from django.db.models import Sum

    from baho.drymill.models import DryMillOutput

    outputs = DryMillOutput.objects.filter(batch__is_deleted=False)
    lines = ExportShipmentLine.objects.filter(shipment__is_deleted=False)
    if process is not None:
        outputs = outputs.filter(batch__process=process)
        lines = lines.filter(process=process)
    if sub_process is not None:
        outputs = outputs.filter(batch__sub_process=sub_process)
        lines = lines.filter(sub_process=sub_process)
    if source_facility is not None:
        outputs = outputs.filter(batch__source_facility=source_facility)
        lines = lines.filter(source_facility=source_facility)
    if source_supplier is not None:
        outputs = outputs.filter(batch__source_supplier=source_supplier)
        lines = lines.filter(source_supplier=source_supplier)
    if export_grade is not None:
        outputs = outputs.filter(export_grade=export_grade)
        lines = lines.filter(export_grade=export_grade)
    produced = outputs.aggregate(v=Sum("qty_kg"))["v"] or Decimal("0")
    shipped = lines.aggregate(v=Sum("qty_kg"))["v"] or Decimal("0")
    return produced - shipped


def lock_export_grades(grade_ids) -> None:
    """Serialise every write that can move green coffee stock of these grades.

    Shipment lines and dry mill outputs always name an export grade, so two
    transactions that compete for the same green coffee always share a grade.
    Locking the grade rows (in a fixed order, so no deadlocks) makes the
    "is there enough stock?" check and the write that depends on it atomic.
    """
    from baho.drymill.models import ExportGrade

    ids = sorted({str(i) for i in grade_ids})
    if ids:
        list(ExportGrade.objects.select_for_update().filter(pk__in=ids).order_by("pk"))


def _selections(batch):
    """Every shipment-line selection that would count this batch's green coffee:
    each combination of its known process / sub-process / source (None = any)."""
    from itertools import product

    attrs = {
        "process": batch.process,
        "sub_process": batch.sub_process,
        "source_facility": batch.source_facility,
        "source_supplier": batch.source_supplier,
    }
    known = [k for k, v in attrs.items() if v is not None]
    for picks in product([False, True], repeat=len(known)):
        yield {k: attrs[k] for k, pick in zip(known, picks, strict=True) if pick}


def ensure_batch_output_not_shipped(batch) -> None:
    """Call inside the transaction that voids `batch` (after it is marked deleted):
    refuses if green coffee from it has already been shipped."""
    outputs = list(batch.outputs.select_related("export_grade"))
    lock_export_grades(o.export_grade_id for o in outputs)
    for grade in {o.export_grade for o in outputs}:
        for selection in _selections(batch):
            available = green_balance(export_grade=grade, **selection)
            if available < 0:
                raise ValidationError(
                    {
                        "detail": (
                            f"Green coffee from this batch has already been shipped "
                            f"({grade.name}: {-available} kg would be missing). "
                            "Delete the shipment first, if it is still planned."
                        )
                    }
                )


def _check_green_stock(lines) -> None:
    """Each line can only claim green coffee actually milled for its own
    process / sub-process / source / grade selection - not just any stock of that grade."""
    lock_export_grades(line["export_grade"].pk for line in lines)
    wanted: dict = {}
    for line in lines:
        key = (
            line.get("process"),
            line.get("sub_process"),
            line.get("source_facility"),
            line.get("source_supplier"),
            line["export_grade"],
        )
        wanted[key] = wanted.get(key, Decimal("0")) + Decimal(line["qty_kg"])
    short = []
    for (process, sub_process, source_facility, source_supplier, grade), kg in wanted.items():
        available = green_balance(
            process=process,
            sub_process=sub_process,
            source_facility=source_facility,
            source_supplier=source_supplier,
            export_grade=grade,
        )
        if kg > available:
            source = source_facility or source_supplier
            parts = [
                process and process.name,
                sub_process and sub_process.name,
                source and source.name,
                grade.name,
            ]
            label = " / ".join(filter(None, parts))
            short.append(f"{label}: {available} kg available, {kg} kg requested")
    if short:
        raise ValidationError({"lines": ["Not enough green coffee in stock. " + "; ".join(short)]})


@transaction.atomic
def create_client(*, user, name, **fields) -> Client:
    name = name.strip()
    if Client.objects.filter(name__iexact=name).exists():
        raise ValidationError({"name": [f"Client {name} is already registered."]})
    return Client.objects.create(name=name, **fields)


@transaction.atomic
def create_shipment(
    *, user, client, delivery_to_naeb_date, lines, status=ExportShipment.Status.PLANNED, notes=""
) -> ExportShipment:
    """`lines`: [{"process"?, "sub_process"?, "process_product"?, "export_grade", "qty_kg"}].
    `process_product` is a display label, auto-built from process/sub_process when left blank."""
    lines = [line for line in lines if line["qty_kg"] > 0]
    if not lines:
        raise ValidationError({"lines": ["Add at least one product line with a quantity."]})
    _check_green_stock(lines)

    crop_year = crop_year_for(delivery_to_naeb_date)
    number = next_sequence(f"shipment:{crop_year.label}")
    shipment = ExportShipment.objects.create(
        shipment_no=f"EXP-{crop_year.label}-{number:04d}",
        client=client,
        crop_year=crop_year,
        delivery_to_naeb_date=delivery_to_naeb_date,
        status=status,
        notes=notes,
        created_by=user,
        updated_by=user,
    )

    def label(line) -> str:
        given = (line.get("process_product") or "").strip()
        if given:
            return given
        process, sub_process = line.get("process"), line.get("sub_process")
        parts = [process and process.name, sub_process and sub_process.name]
        return " ".join(filter(None, parts)).upper()

    ExportShipmentLine.objects.bulk_create(
        [
            ExportShipmentLine(shipment=shipment, **{**line, "process_product": label(line)})
            for line in lines
        ]
    )
    return shipment


@transaction.atomic
def update_shipment_status(*, user, shipment, status) -> ExportShipment:
    shipment.status = status
    shipment.updated_by = user
    shipment.save(update_fields=["status", "updated_by", "updated_at"])
    return shipment

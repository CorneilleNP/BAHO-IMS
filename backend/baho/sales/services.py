"""Write operations for sales/export. Every multi-row write is one transaction."""

from decimal import Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from baho.core.dates import crop_year_for
from baho.core.numbering import next_sequence

from .models import Client, ExportShipment, ExportShipmentLine


def green_balance_by_grade() -> dict:
    """Green coffee available per export grade: produced by live batches - shipped."""
    from django.db.models import Sum

    from baho.drymill.models import DryMillOutput

    produced = dict(
        DryMillOutput.objects.filter(batch__is_deleted=False)
        .values_list("export_grade")
        .annotate(kg=Sum("qty_kg"))
    )
    shipped = dict(
        ExportShipmentLine.objects.filter(shipment__is_deleted=False)
        .values_list("export_grade")
        .annotate(kg=Sum("qty_kg"))
    )
    return {
        g: produced.get(g, Decimal("0")) - shipped.get(g, Decimal("0")) for g in produced | shipped
    }


def _check_green_stock(lines) -> None:
    wanted: dict = {}
    for line in lines:
        grade = line["export_grade"]
        wanted[grade] = wanted.get(grade, Decimal("0")) + Decimal(line["qty_kg"])
    balance = green_balance_by_grade()
    short = [
        f"{grade.name}: {balance.get(grade.pk, Decimal('0'))} kg available, {kg} kg requested"
        for grade, kg in wanted.items()
        if kg > balance.get(grade.pk, Decimal("0"))
    ]
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
    """`lines`: [{"process_product": str, "export_grade": ExportGrade, "qty_kg": Decimal}]"""
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
    ExportShipmentLine.objects.bulk_create(
        [
            ExportShipmentLine(
                shipment=shipment, **{**line, "process_product": line["process_product"].strip()}
            )
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

"""Write operations for processing. Every multi-row write is one transaction."""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from baho.core.dates import crop_year_for
from baho.core.numbering import next_sequence
from baho.core.permissions import ensure_facility_access

from .models import GradeRatio, LotGradeResult, ProcessGrade, ProcessingLot, ProcessType
from .selectors import current_ratio

CENT = Decimal("0.01")


def estimate_kg(cherry_input_kg: Decimal, ratio: Decimal) -> Decimal:
    """Same formula as the frontend's calculateEstimate (round half up to 0.01 kg)."""
    return (cherry_input_kg * ratio).quantize(CENT, rounding=ROUND_HALF_UP)


@transaction.atomic
def register_process(*, user, facility, name, sub_process="", grades) -> ProcessType:
    """Create a process type at a station with its grades and estimate ratios.

    `grades`: [{"code": "A1", "name": "A1", "ratio": Decimal("0.14")}, ...]
    """
    ensure_facility_access(user, facility)
    name, sub_process = name.strip(), sub_process.strip()
    if ProcessType.objects.filter(
        facility=facility, name__iexact=name, sub_process__iexact=sub_process
    ).exists():
        raise ValidationError(
            {"name": [f"{name} / {sub_process or '—'} is already registered at {facility.name}."]}
        )
    codes = [g["code"].strip().upper() for g in grades]
    if not codes or len(codes) != len(set(codes)):
        raise ValidationError({"grades": ["Give each grade a unique code."]})
    if sum(g["ratio"] for g in grades) <= 0:
        raise ValidationError({"grades": ["Enter at least one estimate ratio above 0%."]})
    if sum(g["ratio"] for g in grades) > 1:
        raise ValidationError({"grades": ["Estimate ratios cannot add up to more than 100%."]})

    today = date.today()
    crop_year = crop_year_for(today)
    process = ProcessType.objects.create(facility=facility, name=name, sub_process=sub_process)
    for order, (code, grade) in enumerate(zip(codes, grades, strict=True), start=1):
        process_grade = ProcessGrade.objects.create(
            process_type=process, code=code, name=grade.get("name") or code, display_order=order
        )
        GradeRatio.objects.create(
            grade=process_grade,
            crop_year=crop_year,
            ratio=grade["ratio"],
            effective_from=crop_year.start_date if crop_year.start_date <= today else today,
        )
    return process


@transaction.atomic
def create_lot(
    *, user, process_type, lot_date, cherry_input_kg, lot_number="", actuals=None, notes=""
) -> ProcessingLot:
    """Open a processing lot; estimates per grade are fixed now from the current ratios.

    `actuals`: optional {grade_id: Decimal kg} sorted quantities known already.
    """
    facility = process_type.facility
    ensure_facility_access(user, facility)
    crop_year = crop_year_for(lot_date)
    grades = list(process_type.grades.prefetch_related("ratios"))
    if not grades:
        raise ValidationError({"process_type": ["This process has no grades configured."]})

    lot_number = (lot_number or "").strip()
    if lot_number:
        if ProcessingLot.all_objects.filter(lot_number__iexact=lot_number).exists():
            raise ValidationError({"lot_number": [f"Lot {lot_number} already exists."]})
    else:
        number = next_sequence(f"lot:{facility.code}:{crop_year.label}")
        lot_number = f"{facility.code}-{crop_year.label}-L{number:04d}"

    lot = ProcessingLot.objects.create(
        lot_number=lot_number,
        facility=facility,
        process_type=process_type,
        crop_year=crop_year,
        lot_date=lot_date,
        cherry_input_kg=cherry_input_kg,
        notes=notes,
        created_by=user,
        updated_by=user,
    )
    actuals = {str(k): v for k, v in (actuals or {}).items()}
    unknown = set(actuals) - {str(g.id) for g in grades}
    if unknown:
        raise ValidationError(
            {"actuals": ["Actuals refer to grades that are not part of this process."]}
        )

    for grade in grades:
        ratio = current_ratio(grade, lot_date)
        ratio_value = ratio.ratio if ratio else Decimal("0")
        LotGradeResult.objects.create(
            lot=lot,
            grade=grade,
            ratio_used=ratio_value,
            estimated_kg=estimate_kg(Decimal(cherry_input_kg), ratio_value),
            actual_kg=actuals.get(str(grade.id)),
        )
    _refresh_status(lot)
    return lot


@transaction.atomic
def record_actuals(*, user, lot: ProcessingLot, actuals) -> ProcessingLot:
    """Set actual sorted kg per grade: {grade_id: Decimal kg or None}."""
    ensure_facility_access(user, lot.facility)
    if lot.status == ProcessingLot.Status.CLOSED:
        raise ValidationError(["This lot is closed and can no longer be changed."])
    results = {str(r.grade_id): r for r in lot.results.all()}
    for grade_id, kg in actuals.items():
        result = results.get(str(grade_id))
        if result is None:
            raise ValidationError({"actuals": ["Unknown grade for this lot."]})
        result.actual_kg = kg
        result.save(update_fields=["actual_kg", "updated_at"])
    lot.updated_by = user
    lot.save(update_fields=["updated_by", "updated_at"])
    _refresh_status(lot)
    return lot


def _refresh_status(lot: ProcessingLot) -> None:
    if lot.status == ProcessingLot.Status.CLOSED:
        return
    all_sorted = not lot.results.filter(actual_kg__isnull=True).exists()
    status = ProcessingLot.Status.SORTED if all_sorted else ProcessingLot.Status.IN_PROGRESS
    if lot.status != status:
        lot.status = status
        lot.save(update_fields=["status", "updated_at"])

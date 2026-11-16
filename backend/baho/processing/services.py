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


def _validate_grades(grades) -> list[str]:
    codes = [g["code"].strip().upper() for g in grades]
    if not codes or len(codes) != len(set(codes)):
        raise ValidationError({"grades": ["Give each grade a unique code."]})
    if sum(g["ratio"] for g in grades) <= 0:
        raise ValidationError({"grades": ["Enter at least one estimate ratio above 0%."]})
    if sum(g["ratio"] for g in grades) > 1:
        raise ValidationError({"grades": ["Estimate ratios cannot add up to more than 100%."]})
    return codes


def _apply_grades(process, grades) -> None:
    """Create/reuse each grade under `process` and set its estimate ratio for
    today's crop year. Grades are shared company-wide per process, not per
    station: a code another station already registered is reused as-is (so dry
    mill reception, which sources its grade choices from here, keeps seeing one
    consistent list); a new code becomes available to everyone from now on."""
    codes = _validate_grades(grades)
    today = date.today()
    crop_year = crop_year_for(today)
    existing = {g.code: g for g in process.grades.all()}
    effective_from = crop_year.start_date if crop_year.start_date <= today else today
    for order, (code, grade) in enumerate(zip(codes, grades, strict=True), start=1):
        process_grade = existing.get(code)
        if process_grade is None:
            process_grade = ProcessGrade.objects.create(
                process=process, code=code, name=grade.get("name") or code, display_order=order
            )
            existing[code] = process_grade
        GradeRatio.objects.update_or_create(
            grade=process_grade,
            crop_year=crop_year,
            effective_from=effective_from,
            defaults={"ratio": grade["ratio"]},
        )


@transaction.atomic
def register_process(*, user, facility, process, sub_process=None, grades) -> ProcessType:
    """Register a station's process (one of the 5, with an optional catalogue
    sub-process) and its estimate ratios. `grades`: [{"code": "A1", "name": "A1",
    "ratio": Decimal("0.14")}, ...] - see `_apply_grades` for how they're shared."""
    ensure_facility_access(user, facility)
    if ProcessType.objects.filter(
        facility=facility, process=process, sub_process_ref=sub_process
    ).exists():
        label = f"{process.name}{f' / {sub_process.name}' if sub_process else ''}"
        raise ValidationError({"process": [f"{label} is already registered at {facility.name}."]})

    process_type = ProcessType.objects.create(
        facility=facility,
        process=process,
        sub_process_ref=sub_process,
        name=process.name,
        sub_process=sub_process.name if sub_process else "",
    )
    _apply_grades(process, grades)
    return process_type


@transaction.atomic
def update_process_type(
    *, user, process_type, process=None, sub_process=None, is_active=None, grades=None
) -> ProcessType:
    """Correct a station's process registration: move it to another catalogue
    process/sub-process, (de)activate it, and/or update its estimate ratios
    (same sharing rules as `register_process` - see `_apply_grades`)."""
    ensure_facility_access(user, process_type.facility)

    new_process = process if process is not None else process_type.process
    new_sub_process = sub_process if sub_process is not None else process_type.sub_process_ref
    if (new_process, new_sub_process) != (process_type.process, process_type.sub_process_ref):
        clash = ProcessType.objects.filter(
            facility=process_type.facility, process=new_process, sub_process_ref=new_sub_process
        ).exclude(pk=process_type.pk)
        if clash.exists():
            label = f"{new_process.name}{f' / {new_sub_process.name}' if new_sub_process else ''}"
            raise ValidationError(
                {"process": [f"{label} is already registered at {process_type.facility.name}."]}
            )

    fields = []
    if process is not None or sub_process is not None:
        process_type.process = new_process
        process_type.sub_process_ref = new_sub_process
        process_type.name = new_process.name
        process_type.sub_process = new_sub_process.name if new_sub_process else ""
        fields += ["process", "sub_process_ref", "name", "sub_process"]
    if is_active is not None:
        process_type.is_active = is_active
        fields.append("is_active")
    if fields:
        process_type.save(update_fields=[*fields, "updated_at"])

    if grades is not None:
        _apply_grades(new_process, grades)
    return process_type


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
    grades = list(process_type.process.grades.prefetch_related("ratios"))
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

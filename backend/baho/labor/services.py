"""Write operations for labor. Every multi-row write is @transaction.atomic."""

from datetime import date
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from baho.core.access import RoleCode, get_user_access
from baho.core.dates import crop_year_for
from baho.core.permissions import ensure_facility_access
from baho.organization.models import Facility

from .models import CasualLaborer, LaborAttendance, LaborPayPeriod

CLOSE_ROLES = (RoleCode.ADMIN, RoleCode.CWS_MANAGER)
MARK_PAID_ROLES = (RoleCode.ADMIN, RoleCode.CWS_MANAGER, RoleCode.HQ_FINANCE)


def _require_role(user, roles, action: str) -> None:
    if user.is_superuser or get_user_access(user).has_any_role(*roles):
        return
    raise PermissionDenied(f"Only {', '.join(roles)} can {action}.")


def _ensure_cws(facility) -> None:
    if facility.facility_type != Facility.FacilityType.CWS:
        raise ValidationError({"facility": ["Casual labor is recorded at a CWS."]})


def _clean_national_id(facility, national_id: str, exclude_pk=None) -> str:
    national_id = (national_id or "").strip()
    if national_id:
        clash = CasualLaborer.objects.filter(facility=facility, national_id=national_id)
        if exclude_pk is not None:
            clash = clash.exclude(pk=exclude_pk)
        if clash.exists():
            raise ValidationError(
                {"national_id": ["A laborer with this national ID is already registered here."]}
            )
    return national_id


# --- Laborers ---------------------------------------------------------------


@transaction.atomic
def register_laborer(*, user, facility, **fields) -> CasualLaborer:
    ensure_facility_access(user, facility)
    _ensure_cws(facility)
    fields["national_id"] = _clean_national_id(facility, fields.get("national_id", ""))
    return CasualLaborer.objects.create(
        facility=facility, created_by=user, updated_by=user, **fields
    )


UPDATABLE_LABORER_FIELDS = {
    "first_name",
    "last_name",
    "full_name",
    "national_id",
    "phone",
    "location",
    "daily_rate",
    "is_active",
}


@transaction.atomic
def update_laborer(*, user, laborer, **fields) -> CasualLaborer:
    """Edit details or (de)activate. The facility never changes: a laborer
    who moves station is registered again there."""
    ensure_facility_access(user, laborer.facility)
    unknown = set(fields) - UPDATABLE_LABORER_FIELDS
    if unknown:
        raise ValidationError({name: ["This field cannot be changed."] for name in unknown})
    if "national_id" in fields:
        fields["national_id"] = _clean_national_id(
            laborer.facility, fields["national_id"], exclude_pk=laborer.pk
        )
    for name, value in fields.items():
        setattr(laborer, name, value)
    laborer.updated_by = user
    laborer.save()
    return laborer


# --- Pay periods --------------------------------------------------------------


@transaction.atomic
def open_pay_period(
    *, user, facility, period_start: date, period_end: date, notes: str = ""
) -> LaborPayPeriod:
    ensure_facility_access(user, facility)
    _ensure_cws(facility)
    if period_end < period_start:
        raise ValidationError({"period_end": ["The period cannot end before it starts."]})
    # Serialise period creation per facility so two clerks can't open overlapping periods.
    Facility.objects.select_for_update().filter(pk=facility.pk).first()
    overlap = LaborPayPeriod.objects.filter(
        facility=facility, period_start__lte=period_end, period_end__gte=period_start
    ).first()
    if overlap is not None:
        raise ValidationError(
            [
                f"Overlaps the existing pay period {overlap.period_start} to "
                f"{overlap.period_end} at {facility.name}."
            ]
        )
    return LaborPayPeriod.objects.create(
        facility=facility,
        crop_year=crop_year_for(period_start),
        period_start=period_start,
        period_end=period_end,
        notes=notes,
        created_by=user,
        updated_by=user,
    )


def _lock_period(period) -> LaborPayPeriod:
    return LaborPayPeriod.objects.select_for_update().select_related("facility").get(pk=period.pk)


@transaction.atomic
def record_attendance(
    *,
    user,
    pay_period,
    work_date: date,
    present_laborers: list,
    daily_rate_overrides: dict | None = None,
) -> list[LaborAttendance]:
    """Set who was present on one day (the day's whole roll call).

    Laborers in `present_laborers` are marked present; laborers who already
    had a row for that day but are not in the list are marked absent. Sending
    the same day again updates the rows, never duplicates them. The rate is
    an override if given, else the rate already on the row, else the
    laborer's current daily rate.
    """
    period = _lock_period(pay_period)
    ensure_facility_access(user, period.facility)
    if period.status != LaborPayPeriod.Status.OPEN:
        raise ValidationError(["Attendance can only change while the pay period is open."])
    if not period.contains(work_date):
        raise ValidationError(
            {
                "work_date": [
                    f"Must be within the pay period ({period.period_start} to {period.period_end})."
                ]
            }
        )
    if work_date > timezone.localdate():
        raise ValidationError({"work_date": ["Attendance cannot be recorded for a future date."]})

    overrides = {str(k): Decimal(v) for k, v in (daily_rate_overrides or {}).items()}
    present_ids = {str(pk) for pk in present_laborers}
    unknown_overrides = set(overrides) - present_ids
    if unknown_overrides:
        raise ValidationError(
            {"daily_rate_overrides": ["Rates can only be set for laborers marked present."]}
        )
    if any(rate < 0 for rate in overrides.values()):
        raise ValidationError({"daily_rate_overrides": ["A daily rate cannot be negative."]})

    laborers = {str(lab.pk): lab for lab in CasualLaborer.objects.filter(pk__in=present_ids)}
    missing = present_ids - set(laborers)
    if missing:
        raise ValidationError({"present_laborers": ["Unknown laborer(s)."]})
    wrong_facility = [lab for lab in laborers.values() if lab.facility_id != period.facility_id]
    if wrong_facility:
        raise ValidationError(
            {
                "present_laborers": [
                    f"{lab.full_name} is not registered at {period.facility.name}."
                    for lab in wrong_facility
                ]
            }
        )

    existing = {
        str(row.laborer_id): row
        for row in LaborAttendance.objects.select_for_update().filter(
            laborer__facility=period.facility, work_date=work_date
        )
    }
    stray = [row for row in existing.values() if row.pay_period_id != period.pk]
    if stray:
        raise ValidationError({"work_date": ["This day already belongs to another pay period."]})

    inactive = [lab for pk, lab in laborers.items() if not lab.is_active and pk not in existing]
    if inactive:
        raise ValidationError(
            {
                "present_laborers": [
                    f"{lab.full_name} is inactive. Reactivate them first." for lab in inactive
                ]
            }
        )

    rows = []
    for pk, laborer in laborers.items():
        row = existing.get(pk)
        if row is None:
            row = LaborAttendance.objects.create(
                laborer=laborer,
                pay_period=period,
                work_date=work_date,
                present=True,
                daily_rate_applied=overrides.get(pk, laborer.daily_rate),
                created_by=user,
                updated_by=user,
            )
        else:
            row.present = True
            row.daily_rate_applied = overrides.get(pk, row.daily_rate_applied)
            row.updated_by = user
            row.save(update_fields=["present", "daily_rate_applied", "updated_by", "updated_at"])
        rows.append(row)

    for pk, row in existing.items():
        if pk not in laborers and row.present:
            row.present = False
            row.updated_by = user
            row.save(update_fields=["present", "updated_by", "updated_at"])
            rows.append(row)
    return rows


@transaction.atomic
def close_pay_period(*, user, pay_period) -> LaborPayPeriod:
    """OPEN -> CLOSED: attendance is frozen and the period is ready to pay."""
    _require_role(user, CLOSE_ROLES, "close a pay period")
    period = _lock_period(pay_period)
    ensure_facility_access(user, period.facility)
    if period.status != LaborPayPeriod.Status.OPEN:
        raise ValidationError(["Only an open pay period can be closed."])
    period.status = LaborPayPeriod.Status.CLOSED
    period.closed_at = timezone.now()
    period.closed_by = user
    period.updated_by = user
    period.save(update_fields=["status", "closed_at", "closed_by", "updated_by", "updated_at"])
    return period


@transaction.atomic
def mark_pay_period_paid(*, user, pay_period) -> LaborPayPeriod:
    """CLOSED -> PAID."""
    _require_role(user, MARK_PAID_ROLES, "mark a pay period as paid")
    period = _lock_period(pay_period)
    ensure_facility_access(user, period.facility)
    if period.status != LaborPayPeriod.Status.CLOSED:
        raise ValidationError(["Close the pay period before marking it as paid."])
    period.status = LaborPayPeriod.Status.PAID
    period.paid_at = timezone.now()
    period.paid_by = user
    period.updated_by = user
    period.save(update_fields=["status", "paid_at", "paid_by", "updated_by", "updated_at"])
    # Finance hook: post the period total (selectors.pay_period_summary) as a
    # cash-ledger payout here, in this same transaction, once the finance app exists.
    return period


@transaction.atomic
def void_pay_period(*, user, pay_period, reason: str) -> LaborPayPeriod:
    """Soft-delete an OPEN period opened by mistake, with its attendance rows.
    Frees its days for a new period."""
    period = _lock_period(pay_period)
    ensure_facility_access(user, period.facility)
    if period.status != LaborPayPeriod.Status.OPEN:
        raise ValidationError(["Only an open pay period can be deleted."])
    now = timezone.now()
    period.attendance.update(
        is_deleted=True, deleted_at=now, void_reason=reason, updated_by=user, updated_at=now
    )
    period.soft_delete(user=user, reason=reason)
    return period

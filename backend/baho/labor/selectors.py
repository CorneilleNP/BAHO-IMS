"""Read/query functions for labor."""

from decimal import Decimal

from django.db.models import Count, DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce

from .models import LaborAttendance, LaborPayPeriod

_ZERO = Value(Decimal("0"), output_field=DecimalField(max_digits=14, decimal_places=2))
_PRESENT = Q(attendance__present=True, attendance__is_deleted=False)


def pay_periods_with_totals():
    """Pay periods annotated with `days_present`, `laborer_count`, `total_amount`."""
    return LaborPayPeriod.objects.select_related("facility", "crop_year").annotate(
        days_present=Count("attendance", filter=_PRESENT),
        laborer_count=Count("attendance__laborer", filter=_PRESENT, distinct=True),
        total_amount=Coalesce(
            Sum("attendance__daily_rate_applied", filter=_PRESENT),
            _ZERO,
            output_field=DecimalField(max_digits=14, decimal_places=2),
        ),
    )


def period_attendance(period, work_date=None):
    rows = LaborAttendance.objects.filter(pay_period=period).select_related("laborer")
    if work_date is not None:
        rows = rows.filter(work_date=work_date)
    return rows


def pay_period_summary(period) -> dict:
    """Per laborer: days present and amount due (sum of the rates of present
    days), plus the period totals. Laborers with only absent rows show 0."""
    per_laborer = (
        LaborAttendance.objects.filter(pay_period=period)
        .values("laborer_id", "laborer__full_name", "laborer__national_id")
        .annotate(
            days_present=Count("id", filter=Q(present=True)),
            total_amount=Coalesce(
                Sum("daily_rate_applied", filter=Q(present=True)),
                _ZERO,
                output_field=DecimalField(max_digits=14, decimal_places=2),
            ),
        )
        .order_by("laborer__full_name", "laborer_id")
    )
    laborers = [
        {
            "laborer": row["laborer_id"],
            "full_name": row["laborer__full_name"],
            "national_id": row["laborer__national_id"],
            "days_present": row["days_present"],
            "total_amount": row["total_amount"],
        }
        for row in per_laborer
    ]
    return {
        "laborers": laborers,
        "laborer_count": sum(1 for row in laborers if row["days_present"]),
        "days_present": sum(row["days_present"] for row in laborers),
        "total_amount": sum((row["total_amount"] for row in laborers), Decimal("0")),
    }

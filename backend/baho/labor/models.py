"""Casual laborers, pay periods, attendance. Legacy: 0002_reception_finance.sql.

Normalised day rows (one LaborAttendance per laborer per date) replace the
old wide day-of-month Excel grid.
"""

from django.conf import settings
from django.db import models
from django.db.models import F, Q

from baho.core.models import AuditedModel
from baho.core.names import PersonNameMixin
from baho.organization.models import location_field


class CasualLaborer(PersonNameMixin, AuditedModel):
    """A day worker registered at one CWS. Never deleted: deactivate instead."""

    facility = models.ForeignKey(
        "organization.Facility", on_delete=models.PROTECT, related_name="casual_laborers"
    )
    full_name = models.CharField(max_length=150)
    national_id = models.CharField(max_length=30, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    # Where the laborer lives (Rwanda Province > District > Sector > Cell > Village).
    location = location_field()
    daily_rate = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text="Default pay per day present (RWF); copied onto each attendance row.",
    )
    is_active = models.BooleanField(default=True)

    class Meta(AuditedModel.Meta):
        ordering = ["full_name"]
        indexes = [models.Index(fields=["facility", "full_name"])]
        constraints = [
            models.CheckConstraint(
                condition=Q(daily_rate__gte=0), name="casual_laborer_daily_rate_non_negative"
            ),
        ]

    def __str__(self):
        return self.full_name


class LaborPayPeriod(AuditedModel):
    """A stretch of days at one CWS whose attendance is paid out together.

    OPEN (attendance editable) -> CLOSED (frozen, ready to pay) -> PAID.
    Periods of one facility never overlap (checked in services).
    """

    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        CLOSED = "CLOSED", "Closed"
        PAID = "PAID", "Paid"

    facility = models.ForeignKey(
        "organization.Facility", on_delete=models.PROTECT, related_name="labor_pay_periods"
    )
    crop_year = models.ForeignKey("organization.CropYear", on_delete=models.PROTECT)
    period_start = models.DateField()
    period_end = models.DateField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    notes = models.TextField(blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    paid_at = models.DateTimeField(null=True, blank=True)
    paid_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    class Meta(AuditedModel.Meta):
        ordering = ["-period_start"]
        indexes = [models.Index(fields=["facility", "period_start"])]
        constraints = [
            models.CheckConstraint(
                condition=Q(period_end__gte=F("period_start")),
                name="labor_pay_period_end_after_start",
            ),
        ]

    def __str__(self):
        return f"{self.facility.code} {self.period_start} - {self.period_end} ({self.status})"

    def contains(self, day) -> bool:
        return self.period_start <= day <= self.period_end


class LaborAttendance(AuditedModel):
    """One laborer on one day. Absent rows are kept (present=False) so a
    correction is visible, and they never count towards pay."""

    laborer = models.ForeignKey(CasualLaborer, on_delete=models.PROTECT, related_name="attendance")
    pay_period = models.ForeignKey(
        LaborPayPeriod, on_delete=models.PROTECT, related_name="attendance"
    )
    work_date = models.DateField()
    present = models.BooleanField(default=True)
    daily_rate_applied = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta(AuditedModel.Meta):
        ordering = ["work_date", "laborer__full_name"]
        indexes = [models.Index(fields=["pay_period", "work_date"])]
        constraints = [
            # Voided rows (e.g. of a voided pay period) free the day up again.
            models.UniqueConstraint(
                fields=["laborer", "work_date"],
                condition=Q(is_deleted=False),
                name="labor_attendance_unique_laborer_day",
            ),
            models.CheckConstraint(
                condition=Q(daily_rate_applied__gte=0),
                name="labor_attendance_rate_non_negative",
            ),
        ]

    def __str__(self):
        return f"{self.laborer} {self.work_date} {'present' if self.present else 'absent'}"

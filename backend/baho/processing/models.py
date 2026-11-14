"""CWS wet processing: process types, grades, estimate ratios, lots.

Legacy: 0003_processing.sql. Process types are per station because each CWS
runs its own set (and its own estimate ratios).
"""

from django.db import models
from django.db.models import Q

from baho.core.models import AuditedModel, TimeStampedModel


class ProcessType(TimeStampedModel):
    """E.g. "Fully Washed / Standard Run" at Gitoki."""

    facility = models.ForeignKey(
        "organization.Facility", on_delete=models.PROTECT, related_name="process_types"
    )
    name = models.CharField(max_length=80)
    sub_process = models.CharField(max_length=80, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["facility", "name", "sub_process"]
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "name", "sub_process"], name="process_type_unique_per_station"
            ),
        ]

    def __str__(self):
        label = f"{self.name} / {self.sub_process}" if self.sub_process else self.name
        return f"{label} @ {self.facility.code}"


class ProcessGrade(TimeStampedModel):
    """Output grade of a process (A1, A2, A3, HPC for washed; HG, HPC for naturals)."""

    process_type = models.ForeignKey(ProcessType, on_delete=models.CASCADE, related_name="grades")
    code = models.CharField(max_length=20)
    name = models.CharField(max_length=50)
    display_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["display_order", "code"]
        constraints = [
            models.UniqueConstraint(
                fields=["process_type", "code"], name="grade_unique_per_process"
            ),
        ]

    def __str__(self):
        return self.code


class GradeRatio(TimeStampedModel):
    """Estimate ratio (share of cherry input expected as this grade).

    Versioned by date so a mid-season change never rewrites lots already
    estimated under the old ratio.
    """

    grade = models.ForeignKey(ProcessGrade, on_delete=models.CASCADE, related_name="ratios")
    crop_year = models.ForeignKey("organization.CropYear", on_delete=models.PROTECT)
    ratio = models.DecimalField(max_digits=7, decimal_places=5)
    effective_from = models.DateField()

    class Meta:
        ordering = ["-effective_from"]
        constraints = [
            models.UniqueConstraint(
                fields=["grade", "crop_year", "effective_from"], name="ratio_unique_per_date"
            ),
            models.CheckConstraint(
                condition=Q(ratio__gte=0) & Q(ratio__lte=1), name="ratio_between_0_and_1"
            ),
        ]


class ProcessingLot(AuditedModel):
    class Status(models.TextChoices):
        IN_PROGRESS = "IN_PROGRESS", "In progress"
        SORTED = "SORTED", "Sorted"
        CLOSED = "CLOSED", "Closed"

    lot_number = models.CharField(max_length=40, unique=True)
    facility = models.ForeignKey(
        "organization.Facility", on_delete=models.PROTECT, related_name="processing_lots"
    )
    process_type = models.ForeignKey(ProcessType, on_delete=models.PROTECT, related_name="lots")
    crop_year = models.ForeignKey("organization.CropYear", on_delete=models.PROTECT)
    lot_date = models.DateField()
    cherry_input_kg = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.IN_PROGRESS)
    notes = models.TextField(blank=True)

    class Meta(AuditedModel.Meta):
        ordering = ["-lot_date", "-created_at"]
        constraints = [
            models.CheckConstraint(condition=Q(cherry_input_kg__gt=0), name="lot_input_positive"),
        ]

    def __str__(self):
        return self.lot_number


class LotGradeResult(TimeStampedModel):
    """Per-grade estimate (fixed at entry time) and actual sorted quantity."""

    lot = models.ForeignKey(ProcessingLot, on_delete=models.CASCADE, related_name="results")
    grade = models.ForeignKey(ProcessGrade, on_delete=models.PROTECT)
    ratio_used = models.DecimalField(max_digits=7, decimal_places=5)
    estimated_kg = models.DecimalField(max_digits=10, decimal_places=2)
    actual_kg = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    class Meta:
        ordering = ["grade__display_order"]
        constraints = [
            models.UniqueConstraint(fields=["lot", "grade"], name="lot_result_one_per_grade"),
            models.CheckConstraint(
                condition=Q(actual_kg__isnull=True) | Q(actual_kg__gte=0),
                name="lot_actual_non_negative",
            ),
        ]

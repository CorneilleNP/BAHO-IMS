"""CWS wet processing: process types, grades, estimate ratios, lots.

Legacy: 0003_processing.sql. Process types are per station because each CWS
runs its own set (and its own estimate ratios).
"""

import uuid

from django.db import models
from django.db.models import Q

from baho.core.models import AuditedModel, TimeStampedModel

from .labels import label_key


class ProcessType(TimeStampedModel):
    """A station's registration of one of the 5 processes (e.g. "Fully Washed /
    Standard Run" at Gitoki), linked to the shared catalogue below so its grades
    are the same ones dry mill reception uses - registered once, reused everywhere.
    """

    facility = models.ForeignKey(
        "organization.Facility", on_delete=models.PROTECT, related_name="process_types"
    )
    process = models.ForeignKey(
        "processing.Process",
        on_delete=models.PROTECT,
        related_name="process_types",
        help_text="One of the 5 company-wide processes.",
    )
    sub_process_ref = models.ForeignKey(
        "processing.SubProcess",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="process_types",
        help_text="Optional catalogue sub-process.",
    )
    # Display labels, kept in sync with process/sub_process_ref at registration time.
    name = models.CharField(max_length=80)
    sub_process = models.CharField(max_length=80, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["facility", "name", "sub_process"]
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "process", "sub_process_ref"],
                name="process_type_unique_per_station",
            ),
        ]

    def __str__(self):
        label = f"{self.name} / {self.sub_process}" if self.sub_process else self.name
        return f"{label} @ {self.facility.code}"


class ProcessGrade(TimeStampedModel):
    """Output grade of a process (A1, A2, A3, HPC for washed; HG, HPC for naturals).

    Shared company-wide per process (not per station): a station registering a
    process it already knows reuses these same grades instead of recreating them,
    and dry mill reception sources its grade choices from here too.
    """

    process = models.ForeignKey(
        "processing.Process", on_delete=models.CASCADE, related_name="grades"
    )
    code = models.CharField(max_length=20)
    name = models.CharField(max_length=50)
    display_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["display_order", "code"]
        constraints = [
            models.UniqueConstraint(fields=["process", "code"], name="grade_unique_per_process"),
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


# --- Company-wide process catalogue -----------------------------------------------
# Baho runs exactly five processes; every other label used in the field
# ("WASHED NO 1", "NAT NO 2 MTC LOT", "ECLIPSE NAT"…) is a sub-process of one
# of them. Sub-processes can sit "unassigned" (process = NULL) until someone
# assigns them on the Processes screen; aliases make spelling variants of the
# same label resolve to one sub-process.


class Process(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=80, unique=True)
    display_order = models.PositiveSmallIntegerField(default=0)
    aliases = models.JSONField(
        default=list,
        blank=True,
        help_text="Normalised labels that mean this process itself (no sub-process), e.g. FW.",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "name"]
        verbose_name_plural = "processes"

    def __str__(self):
        return self.name


class SubProcess(TimeStampedModel):
    process = models.ForeignKey(
        Process,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="sub_processes",
        help_text="Empty = not assigned to a process yet.",
    )
    name = models.CharField(max_length=120)
    key = models.CharField(max_length=120, unique=True, editable=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "sub-processes"

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.key:
            self.key = label_key(self.name)
        super().save(*args, **kwargs)


class SubProcessAlias(models.Model):
    """Another spelling that resolves to the same sub-process (e.g. "WASHED NO1")."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sub_process = models.ForeignKey(SubProcess, on_delete=models.CASCADE, related_name="aliases")
    label = models.CharField(max_length=120)
    key = models.CharField(max_length=120, unique=True)

    class Meta:
        ordering = ["label"]
        verbose_name_plural = "sub-process aliases"

    def __str__(self):
        return self.label

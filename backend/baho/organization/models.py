"""Crop years, facilities (CWS + HQ dry mill) and the Rwanda address hierarchy.

Legacy reference: legacy/sql/migrations/0001_core_schema.sql
"""

from django.db import models
from django.db.models import F, Q

from baho.core.models import TimeStampedModel


class CropYear(TimeStampedModel):
    label = models.CharField(max_length=20, unique=True)
    start_date = models.DateField()
    end_date = models.DateField()
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["-start_date"]
        constraints = [
            models.CheckConstraint(
                condition=Q(end_date__gte=F("start_date")),
                name="crop_year_end_after_start",
            ),
        ]

    def __str__(self):
        return self.label


class AdminUnit(TimeStampedModel):
    """Province > District > Sector > Cell > Village, as a self-referencing tree."""

    class Level(models.TextChoices):
        PROVINCE = "PROVINCE", "Province"
        DISTRICT = "DISTRICT", "District"
        SECTOR = "SECTOR", "Sector"
        CELL = "CELL", "Cell"
        VILLAGE = "VILLAGE", "Village"

    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="children"
    )
    level = models.CharField(max_length=10, choices=Level.choices)
    name = models.CharField(max_length=120)

    class Meta:
        ordering = ["level", "name"]
        indexes = [models.Index(fields=["level", "name"])]
        constraints = [
            models.UniqueConstraint(
                fields=["parent", "level", "name"], name="admin_unit_unique_in_parent"
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.get_level_display()})"


def location_field():
    """The one way every model stores where it is: the most precise Rwanda admin unit known."""
    return models.ForeignKey(
        "organization.AdminUnit",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
        help_text="Most precise known level (usually the village).",
    )


class Facility(TimeStampedModel):
    """A CWS washing station or the HQ dry mill: one concept so stock logic is generic."""

    class FacilityType(models.TextChoices):
        CWS = "CWS", "Coffee washing station"
        HQ_DRY_MILL = "HQ_DRY_MILL", "HQ dry mill"

    facility_type = models.CharField(max_length=20, choices=FacilityType.choices)
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=120)

    location = location_field()
    contact_name = models.CharField(max_length=120, blank=True)
    contact_phone = models.CharField(max_length=30, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["facility_type", "name"]
        verbose_name_plural = "facilities"

    def __str__(self):
        return f"{self.name} ({self.code})"

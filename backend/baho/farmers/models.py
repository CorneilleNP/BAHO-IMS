"""Farmer registry. Legacy: farmers (0001_core_schema.sql)."""

from django.db import models
from django.db.models import Q

from baho.core.models import AuditedModel
from baho.organization.models import location_field


class Farmer(AuditedModel):
    class Gender(models.TextChoices):
        MALE = "M", "Male"
        FEMALE = "F", "Female"
        OTHER = "O", "Other"

    farmer_code = models.CharField(max_length=40, unique=True, editable=False)
    full_name = models.CharField(max_length=150)
    gender = models.CharField(max_length=1, choices=Gender.choices, blank=True)
    national_id = models.CharField(max_length=30, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    home_facility = models.ForeignKey(
        "organization.Facility", on_delete=models.PROTECT, related_name="farmers"
    )
    location = location_field()
    is_active = models.BooleanField(default=True)

    class Meta(AuditedModel.Meta):
        ordering = ["full_name"]
        indexes = [models.Index(fields=["full_name"])]
        constraints = [
            models.UniqueConstraint(
                fields=["national_id"],
                condition=~Q(national_id=""),
                name="farmer_unique_national_id",
            ),
        ]

    def __str__(self):
        return f"{self.full_name} ({self.farmer_code})"

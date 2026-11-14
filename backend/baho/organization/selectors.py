"""Read/query functions for organization."""

from .models import CropYear, Facility


def current_crop_year() -> CropYear | None:
    return CropYear.objects.filter(is_active=True).order_by("-start_date").first()


def active_facilities():
    return Facility.objects.filter(is_active=True)

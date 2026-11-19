from datetime import date

from rest_framework.exceptions import ValidationError

from baho.organization.models import CropYear, Facility


def _default_crop_year_bounds(day: date) -> tuple[str, date, date]:
    """Rwanda's coffee season runs December to November, not the calendar
    year: 1 Dec 2025 - 30 Nov 2026 is crop year "2026". A December date
    already belongs to the following label."""
    label_year = day.year + 1 if day.month == 12 else day.year
    return str(label_year), date(label_year - 1, 12, 1), date(label_year, 11, 30)


def crop_year_for(day: date) -> CropYear:
    """The crop year a transaction dated `day` belongs to.

    Never blocks a transaction: if an admin already created a crop year
    covering this date (even with custom boundaries), that one is used;
    otherwise one is created automatically with the default December-to-
    November boundaries, so nobody has to pre-create crop years by hand."""
    crop_year = (
        CropYear.objects.filter(start_date__lte=day, end_date__gte=day, is_active=True)
        .order_by("-start_date")
        .first()
    )
    if crop_year is not None:
        return crop_year
    label, start, end = _default_crop_year_bounds(day)
    crop_year, _ = CropYear.objects.get_or_create(
        label=label, defaults={"start_date": start, "end_date": end, "is_active": True}
    )
    return crop_year


def hq_facility() -> Facility:
    facility = Facility.objects.filter(
        facility_type=Facility.FacilityType.HQ_DRY_MILL, is_active=True
    ).first()
    if facility is None:
        raise ValidationError("No HQ dry mill facility is configured. Ask an admin to add one.")
    return facility

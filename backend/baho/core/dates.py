from datetime import date

from rest_framework.exceptions import ValidationError

from baho.organization.models import CropYear, Facility


def crop_year_for(day: date) -> CropYear:
    """The crop year a transaction dated `day` belongs to."""
    crop_year = (
        CropYear.objects.filter(start_date__lte=day, end_date__gte=day, is_active=True)
        .order_by("-start_date")
        .first()
    )
    if crop_year is None:
        raise ValidationError(
            {"date": f"No active crop year covers {day:%Y-%m-%d}. Ask an admin to create one."}
        )
    return crop_year


def hq_facility() -> Facility:
    facility = Facility.objects.filter(
        facility_type=Facility.FacilityType.HQ_DRY_MILL, is_active=True
    ).first()
    if facility is None:
        raise ValidationError("No HQ dry mill facility is configured. Ask an admin to add one.")
    return facility

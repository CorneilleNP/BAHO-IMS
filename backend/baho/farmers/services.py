"""Write operations for farmers."""

from django.db import transaction
from rest_framework.exceptions import ValidationError

from baho.core.numbering import next_sequence
from baho.core.permissions import ensure_facility_access

from .models import Farmer


@transaction.atomic
def register_farmer(*, user, home_facility, **fields) -> Farmer:
    ensure_facility_access(user, home_facility)
    national_id = (fields.get("national_id") or "").strip()
    if national_id and Farmer.all_objects.filter(national_id=national_id).exists():
        raise ValidationError(
            {"national_id": "A farmer with this national ID is already registered."}
        )

    number = next_sequence(f"farmer:{home_facility.code}")
    return Farmer.objects.create(
        farmer_code=f"{home_facility.code}-F{number:05d}",
        home_facility=home_facility,
        created_by=user,
        updated_by=user,
        **{**fields, "national_id": national_id},
    )

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


@transaction.atomic
def update_farmer(*, user, farmer: Farmer, **fields) -> Farmer:
    """Edit a farmer's details. The farmer code never changes, even when the
    farmer moves to another station (you need access to both stations)."""
    farmer = Farmer.objects.select_for_update().get(pk=farmer.pk)
    ensure_facility_access(user, farmer.home_facility)
    if "home_facility" in fields:
        ensure_facility_access(user, fields["home_facility"])
    if "national_id" in fields:
        national_id = (fields["national_id"] or "").strip()
        fields["national_id"] = national_id
        taken = Farmer.all_objects.filter(national_id=national_id).exclude(pk=farmer.pk)
        if national_id and taken.exists():
            raise ValidationError(
                {"national_id": "A farmer with this national ID is already registered."}
            )
    for name, value in fields.items():
        setattr(farmer, name, value)
    farmer.updated_by = user
    farmer.save()
    return farmer

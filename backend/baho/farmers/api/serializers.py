from rest_framework import serializers

from baho.core.fields import ActiveFlagField
from baho.organization.api.serializers import LocationFieldsMixin

from ..models import Farmer


class FarmerSerializer(LocationFieldsMixin, serializers.ModelSerializer):
    is_active = ActiveFlagField()

    home_facility_name = serializers.CharField(source="home_facility.name", read_only=True)

    class Meta:
        model = Farmer
        fields = [
            "id",
            "farmer_code",
            "full_name",
            "gender",
            "national_id",
            "phone",
            "home_facility",
            "home_facility_name",
            *LocationFieldsMixin.LOCATION_FIELDS,
            "household_size",
            "land_area_ha",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["farmer_code", "created_at"]

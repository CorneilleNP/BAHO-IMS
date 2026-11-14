from rest_framework import serializers

from baho.core.fields import ActiveFlagField

from ..models import Farmer


class FarmerSerializer(serializers.ModelSerializer):
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
            "province",
            "district",
            "sector",
            "cell",
            "village",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["farmer_code", "created_at"]

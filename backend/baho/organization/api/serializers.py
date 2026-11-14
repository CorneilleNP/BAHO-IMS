from rest_framework import serializers

from ..models import AdminUnit, CropYear, Facility


class CropYearSerializer(serializers.ModelSerializer):
    class Meta:
        model = CropYear
        fields = ["id", "label", "start_date", "end_date", "is_active"]

    def validate(self, attrs):
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start and end and end < start:
            raise serializers.ValidationError({"end_date": "Must be on or after start_date."})
        return attrs


class FacilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Facility
        fields = [
            "id",
            "facility_type",
            "code",
            "name",
            "province",
            "district",
            "sector",
            "cell",
            "village_name",
            "village",
            "contact_name",
            "contact_phone",
            "is_active",
        ]


class AdminUnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = AdminUnit
        fields = ["id", "parent", "level", "name"]

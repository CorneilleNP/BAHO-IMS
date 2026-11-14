from rest_framework import serializers

from baho.core.fields import ActiveFlagField

from ..locations import location_label, location_path
from ..models import AdminUnit, CropYear, Facility


class LocationRefSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()


class LocationPathSerializer(serializers.Serializer):
    province = LocationRefSerializer(allow_null=True)
    district = LocationRefSerializer(allow_null=True)
    sector = LocationRefSerializer(allow_null=True)
    cell = LocationRefSerializer(allow_null=True)
    village = LocationRefSerializer(allow_null=True)


class LocationFieldsMixin(serializers.Serializer):
    """The single location shape used by every API: write `location` (an admin
    unit id at any level), read back its full path and a display label.

    Querysets should select_related("location__parent__parent__parent__parent").
    """

    location = serializers.PrimaryKeyRelatedField(
        queryset=AdminUnit.objects.all(), required=False, allow_null=True
    )
    location_path = serializers.SerializerMethodField()
    location_label = serializers.SerializerMethodField()

    LOCATION_FIELDS = ["location", "location_path", "location_label"]

    def get_location_path(self, obj) -> LocationPathSerializer:
        return location_path(obj.location)

    def get_location_label(self, obj) -> str:
        return location_label(obj.location)


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


class FacilitySerializer(LocationFieldsMixin, serializers.ModelSerializer):
    is_active = ActiveFlagField()

    class Meta:
        model = Facility
        fields = [
            "id",
            "facility_type",
            "code",
            "name",
            *LocationFieldsMixin.LOCATION_FIELDS,
            "contact_name",
            "contact_phone",
            "is_active",
        ]


class AdminUnitSerializer(serializers.ModelSerializer):
    has_children = serializers.SerializerMethodField()

    class Meta:
        model = AdminUnit
        fields = ["id", "parent", "level", "name", "has_children"]

    def get_has_children(self, obj) -> bool:
        return obj.level != AdminUnit.Level.VILLAGE


class AdminUnitSearchSerializer(serializers.ModelSerializer):
    """Search hit with its full path, e.g. "Gitoki, Gitoki, Nyamyumba, Rubavu"."""

    label = serializers.SerializerMethodField()

    class Meta:
        model = AdminUnit
        fields = ["id", "level", "name", "label"]

    def get_label(self, obj) -> str:
        return location_label(obj)

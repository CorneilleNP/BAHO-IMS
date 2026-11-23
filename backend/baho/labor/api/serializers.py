from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from baho.core.fields import ActiveFlagField

from ..models import CasualLaborer, LaborAttendance, LaborPayPeriod
from ..selectors import pay_period_summary


class CasualLaborerSerializer(serializers.ModelSerializer):
    is_active = ActiveFlagField()
    facility_name = serializers.CharField(source="facility.name", read_only=True)

    class Meta:
        model = CasualLaborer
        fields = [
            "id",
            "facility",
            "facility_name",
            "full_name",
            "national_id",
            "phone",
            "daily_rate",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def validate_daily_rate(self, value):
        if value < 0:
            raise serializers.ValidationError("A daily rate cannot be negative.")
        return value

    def validate(self, attrs):
        if self.instance is not None and "facility" in attrs:
            if attrs["facility"] != self.instance.facility:
                raise serializers.ValidationError(
                    {"facility": "A laborer cannot move station. Register them at the new one."}
                )
            attrs.pop("facility")
        return attrs


class LaborPayPeriodSerializer(serializers.ModelSerializer):
    facility_name = serializers.CharField(source="facility.name", read_only=True)
    crop_year_label = serializers.CharField(source="crop_year.label", read_only=True)
    days_present = serializers.IntegerField(read_only=True)
    laborer_count = serializers.IntegerField(read_only=True)
    total_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = LaborPayPeriod
        fields = [
            "id",
            "facility",
            "facility_name",
            "crop_year",
            "crop_year_label",
            "period_start",
            "period_end",
            "status",
            "notes",
            "days_present",
            "laborer_count",
            "total_amount",
            "closed_at",
            "closed_by",
            "paid_at",
            "paid_by",
            "created_at",
        ]
        read_only_fields = [
            "crop_year",
            "status",
            "closed_at",
            "closed_by",
            "paid_at",
            "paid_by",
            "created_at",
        ]


class SummaryLaborerSerializer(serializers.Serializer):
    laborer = serializers.UUIDField()
    full_name = serializers.CharField()
    national_id = serializers.CharField()
    days_present = serializers.IntegerField()
    total_amount = serializers.DecimalField(max_digits=14, decimal_places=2)


class PayPeriodSummarySerializer(serializers.Serializer):
    laborers = SummaryLaborerSerializer(many=True)
    laborer_count = serializers.IntegerField()
    days_present = serializers.IntegerField()
    total_amount = serializers.DecimalField(max_digits=14, decimal_places=2)


class LaborPayPeriodDetailSerializer(LaborPayPeriodSerializer):
    summary = serializers.SerializerMethodField()

    class Meta(LaborPayPeriodSerializer.Meta):
        fields = [*LaborPayPeriodSerializer.Meta.fields, "summary"]

    @extend_schema_field(PayPeriodSummarySerializer)
    def get_summary(self, obj) -> dict:
        return PayPeriodSummarySerializer(pay_period_summary(obj)).data


class LaborAttendanceSerializer(serializers.ModelSerializer):
    laborer_name = serializers.CharField(source="laborer.full_name", read_only=True)

    class Meta:
        model = LaborAttendance
        fields = ["id", "laborer", "laborer_name", "work_date", "present", "daily_rate_applied"]
        read_only_fields = fields


class AttendanceQuerySerializer(serializers.Serializer):
    work_date = serializers.DateField(required=False)


class RecordAttendanceSerializer(serializers.Serializer):
    work_date = serializers.DateField()
    present_laborers = serializers.ListField(
        child=serializers.UUIDField(), allow_empty=True, max_length=1000
    )
    daily_rate_overrides = serializers.DictField(
        child=serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0),
        required=False,
        help_text="Optional {laborer_id: rate} for laborers paid differently that day.",
    )

    def validate_present_laborers(self, value):
        if len(set(value)) != len(value):
            raise serializers.ValidationError("A laborer is listed twice.")
        return value

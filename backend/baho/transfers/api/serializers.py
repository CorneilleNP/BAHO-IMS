from decimal import Decimal

from rest_framework import serializers

from baho.organization.models import Facility
from baho.processing.models import Process, ProcessGrade, SubProcess

from ..models import (
    CwsTransfer,
    CwsTransferLine,
    CwsTransferWeighing,
    DryMillTransferReceipt,
    DryMillTransferReceiptLine,
    DryMillTransferWeighing,
)

ZERO = Decimal("0")


class CwsTransferWeighingSerializer(serializers.ModelSerializer):
    bags = serializers.IntegerField(min_value=1)
    weight_kg = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"))

    class Meta:
        model = CwsTransferWeighing
        fields = ["id", "bags", "weight_kg"]
        read_only_fields = ["id"]


class DryMillTransferWeighingSerializer(serializers.ModelSerializer):
    bags = serializers.IntegerField(min_value=1)
    weight_kg = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"))

    class Meta:
        model = DryMillTransferWeighing
        fields = ["id", "bags", "weight_kg"]
        read_only_fields = ["id"]


def _validate_catalog(attrs, instance=None):
    process = attrs.get("process") or getattr(instance, "process", None)
    sub_process = attrs.get("sub_process", getattr(instance, "sub_process", None))
    grade = attrs.get("grade") or getattr(instance, "grade", None)
    if sub_process and sub_process.process_id and process and sub_process.process_id != process.id:
        raise serializers.ValidationError({"sub_process": ["Does not belong to the chosen process."]})
    if grade and process and grade.process_id != process.id:
        raise serializers.ValidationError({"grade": ["Does not belong to the chosen process."]})
    return attrs


class CwsTransferLineSerializer(serializers.ModelSerializer):
    """Full detail: the CWS's own view, and dry mill's view once confirmed."""

    process = serializers.PrimaryKeyRelatedField(queryset=Process.objects.filter(is_active=True))
    process_name = serializers.CharField(source="process.name", read_only=True)
    sub_process = serializers.PrimaryKeyRelatedField(
        queryset=SubProcess.objects.all(), required=False, allow_null=True
    )
    sub_process_name = serializers.CharField(source="sub_process.name", read_only=True, default="")
    grade = serializers.PrimaryKeyRelatedField(queryset=ProcessGrade.objects.all())
    grade_code = serializers.CharField(source="grade.code", read_only=True)
    weighings = CwsTransferWeighingSerializer(many=True)
    number_of_bags = serializers.IntegerField(read_only=True)
    gross_weight_kg = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    net_weight_kg = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = CwsTransferLine
        fields = [
            "id",
            "process",
            "process_name",
            "sub_process",
            "sub_process_name",
            "grade",
            "grade_code",
            "moisture_content_pct",
            "number_of_bags",
            "gross_weight_kg",
            "weight_of_bags_kg",
            "net_weight_kg",
            "weighings",
        ]
        read_only_fields = ["id"]

    def validate(self, attrs):
        return _validate_catalog(attrs)


class CwsTransferLineBlindSerializer(serializers.ModelSerializer):
    """What dry mill sees for a line before it has confirmed its own weighing."""

    process_name = serializers.CharField(source="process.name", read_only=True)
    sub_process_name = serializers.CharField(source="sub_process.name", read_only=True, default="")
    grade_code = serializers.CharField(source="grade.code", read_only=True)

    class Meta:
        model = CwsTransferLine
        fields = ["id", "process_name", "sub_process_name", "grade_code"]


class CwsTransferSerializer(serializers.ModelSerializer):
    facility = serializers.PrimaryKeyRelatedField(queryset=Facility.objects.filter(is_active=True))
    facility_name = serializers.CharField(source="facility.name", read_only=True)
    lines = CwsTransferLineSerializer(many=True)

    class Meta:
        model = CwsTransfer
        fields = [
            "id",
            "delivery_note_no",
            "facility",
            "facility_name",
            "transfer_date",
            "status",
            "notes",
            "lines",
            "created_at",
        ]
        read_only_fields = ["status", "created_at"]


class DryMillTransferReceiptLineSerializer(serializers.ModelSerializer):
    cws_line = serializers.SerializerMethodField()
    weighings = DryMillTransferWeighingSerializer(many=True)
    number_of_bags = serializers.IntegerField(read_only=True)
    gross_weight_kg = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    net_weight_kg = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    variance_kg = serializers.SerializerMethodField()
    variance = serializers.SerializerMethodField()
    stock_receipt_number = serializers.CharField(
        source="stock_receipt.receipt_number", read_only=True, default=""
    )

    class Meta:
        model = DryMillTransferReceiptLine
        fields = [
            "id",
            "cws_line",
            "moisture_content_pct",
            "number_of_bags",
            "gross_weight_kg",
            "weight_of_bags_kg",
            "net_weight_kg",
            "variance_status",
            "variance_kg",
            "variance",
            "stock_receipt_number",
            "weighings",
        ]
        read_only_fields = ["id", "variance_status"]

    def _revealed(self, obj) -> bool:
        """The CWS's own numbers are hidden until dry mill has locked its own
        weighing in (status PENDING = still blind)."""
        return obj.receipt.status != DryMillTransferReceipt.Status.PENDING

    def get_cws_line(self, obj):
        serializer = CwsTransferLineSerializer if self._revealed(obj) else CwsTransferLineBlindSerializer
        return serializer(obj.cws_line).data

    def get_variance_kg(self, obj):
        if not self._revealed(obj):
            return None
        return obj.variance_kg

    def get_variance(self, obj):
        """Per-field difference (station minus ours) - bags, gross, bag
        weight, net - so dry mill can see exactly where the numbers differ."""
        if not self._revealed(obj):
            return None
        c = obj.cws_line
        return {
            "number_of_bags": c.number_of_bags - obj.number_of_bags,
            "gross_weight_kg": str(c.gross_weight_kg - obj.gross_weight_kg),
            "weight_of_bags_kg": str(c.weight_of_bags_kg - obj.weight_of_bags_kg),
            "net_weight_kg": str(c.net_weight_kg - obj.net_weight_kg),
        }


class DryMillTransferReceiptSerializer(serializers.ModelSerializer):
    delivery_note_no = serializers.CharField(source="transfer.delivery_note_no", read_only=True)
    facility_name = serializers.CharField(source="transfer.facility_name", read_only=True)
    transfer_date = serializers.DateField(source="transfer.transfer_date", read_only=True)
    lines = DryMillTransferReceiptLineSerializer(many=True, read_only=True)
    is_locked = serializers.BooleanField(read_only=True)
    confirmed_by_name = serializers.CharField(
        source="confirmed_by.full_name", read_only=True, default=""
    )
    unlocked_by_name = serializers.CharField(
        source="unlocked_by.full_name", read_only=True, default=""
    )

    class Meta:
        model = DryMillTransferReceipt
        fields = [
            "id",
            "delivery_note_no",
            "facility_name",
            "transfer_date",
            "status",
            "comment",
            "is_locked",
            "confirmed_by_name",
            "confirmed_at",
            "unlocked_by_name",
            "unlocked_at",
            "lines",
            "created_at",
        ]
        read_only_fields = ["status", "created_at"]


class DryMillTransferLineUpdateSerializer(serializers.Serializer):
    """Dry mill's own blind weighing of one line - never includes the CWS's numbers."""

    moisture_content_pct = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, allow_null=True
    )
    weight_of_bags_kg = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, min_value=ZERO
    )
    weighings = DryMillTransferWeighingSerializer(many=True, required=False)


class SubmitReceiptSerializer(serializers.Serializer):
    comment = serializers.CharField(required=False, allow_blank=True, default="")
    arrival_date = serializers.DateField(required=False, allow_null=True)


class LookupSerializer(serializers.Serializer):
    delivery_note_no = serializers.CharField(max_length=60)

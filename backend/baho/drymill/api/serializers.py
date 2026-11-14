from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from rest_framework import serializers

from baho.core.fields import ActiveFlagField
from baho.organization.models import Facility

from ..models import DryMillBatch, DryMillOutput, ExportGrade, HqStockReceipt, Supplier

ZERO = Decimal("0")
CWS_FACILITIES = Facility.objects.filter(facility_type=Facility.FacilityType.CWS, is_active=True)


class SupplierSerializer(serializers.ModelSerializer):
    is_active = ActiveFlagField()

    class Meta:
        model = Supplier
        fields = [
            "id",
            "name",
            "tin",
            "contact_name",
            "phone",
            "province",
            "district",
            "sector",
            "notes",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["created_at"]
        # uniqueness is checked case-insensitively in the service
        extra_kwargs = {"name": {"validators": []}}


class ExportGradeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExportGrade
        fields = ["id", "code", "name", "display_order"]


class CoffeeSourceSerializer(serializers.Serializer):
    origin_type = serializers.CharField()
    id = serializers.UUIDField()
    code = serializers.CharField()
    name = serializers.CharField()


class SourceFieldsMixin(serializers.Serializer):
    source_facility = serializers.PrimaryKeyRelatedField(
        queryset=CWS_FACILITIES, required=False, allow_null=True
    )
    source_supplier = serializers.PrimaryKeyRelatedField(
        queryset=Supplier.objects.filter(is_active=True), required=False, allow_null=True
    )
    source_name = serializers.CharField(read_only=True)
    source_code = serializers.CharField(read_only=True)


class HqStockReceiptSerializer(SourceFieldsMixin, serializers.ModelSerializer):
    arrival_date = serializers.DateField(default=date.today)
    net_weight_kg = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.01")
    )
    weight_of_bags_kg = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=ZERO, required=False, default=ZERO
    )
    variance_kg = serializers.SerializerMethodField()

    class Meta:
        model = HqStockReceipt
        fields = [
            "id",
            "receipt_number",
            "arrival_date",
            "origin_type",
            "source_facility",
            "source_supplier",
            "source_name",
            "source_code",
            "item_type",
            "process",
            "grade",
            "lot_reference",
            "delivery_note_no",
            "delivery_note_qty_kg",
            "gross_weight_kg",
            "net_weight_kg",
            "number_of_bags",
            "tare_per_bag_kg",
            "weight_of_bags_kg",
            "pure_weight_kg",
            "variance_kg",
            "wrn_number",
            "warehouse_cell",
            "stock_card_number",
            "quality_status",
            "processing_status",
            "created_at",
        ]
        read_only_fields = ["receipt_number", "pure_weight_kg", "created_at"]

    def get_variance_kg(self, obj) -> str | None:
        if obj.delivery_note_qty_kg is None:
            return None
        return str(obj.net_weight_kg - obj.delivery_note_qty_kg)


class StockReceiptStatusSerializer(serializers.Serializer):
    quality_status = serializers.ChoiceField(
        choices=HqStockReceipt.QualityStatus.choices, required=False
    )
    processing_status = serializers.ChoiceField(
        choices=HqStockReceipt.ProcessingStatus.choices, required=False
    )


class DryMillOutputSerializer(serializers.ModelSerializer):
    export_grade = serializers.PrimaryKeyRelatedField(
        queryset=ExportGrade.objects.filter(is_active=True)
    )
    grade_name = serializers.CharField(source="export_grade.name", read_only=True)
    qty_kg = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=ZERO)

    class Meta:
        model = DryMillOutput
        fields = ["export_grade", "grade_name", "qty_kg"]


class DryMillBatchSerializer(SourceFieldsMixin, serializers.ModelSerializer):
    processing_date = serializers.DateField(default=date.today)
    batch_no = serializers.CharField(max_length=40, required=False, allow_blank=True, default="")
    parch_input_kg = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.01")
    )
    outputs = DryMillOutputSerializer(many=True)
    green_output_kg = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    outturn_pct = serializers.SerializerMethodField()

    class Meta:
        model = DryMillBatch
        fields = [
            "id",
            "batch_no",
            "processing_date",
            "origin_type",
            "source_facility",
            "source_supplier",
            "source_name",
            "source_code",
            "process_product",
            "parch_input_kg",
            "outputs",
            "green_output_kg",
            "outturn_pct",
            "status",
            "created_at",
        ]
        read_only_fields = ["created_at"]
        extra_kwargs = {"batch_no": {"validators": []}}

    def get_outturn_pct(self, obj) -> str:
        if not obj.parch_input_kg:
            return "0"
        pct = Decimal(obj.green_output_kg) / obj.parch_input_kg * 100
        return str(pct.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from rest_framework import serializers

from baho.core.fields import ActiveFlagField
from baho.organization.api.serializers import LocationFieldsMixin
from baho.organization.models import Facility
from baho.processing.models import Process, SubProcess

from ..models import (
    DryMillBatch,
    DryMillBatchInput,
    DryMillOutput,
    ExportGrade,
    HqStockReceipt,
    StockAdjustment,
    Supplier,
)

ZERO = Decimal("0")
CWS_FACILITIES = Facility.objects.filter(facility_type=Facility.FacilityType.CWS, is_active=True)


class SupplierSerializer(LocationFieldsMixin, serializers.ModelSerializer):
    is_active = ActiveFlagField()

    class Meta:
        model = Supplier
        fields = [
            "id",
            "name",
            "tin",
            "contact_name",
            "phone",
            *LocationFieldsMixin.LOCATION_FIELDS,
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


# --- Stock receipts ------------------------------------------------------------------


class HqStockReceiptSerializer(serializers.ModelSerializer):
    """Every column of the BAHO STOCK UPDATE sheet. Stock position fields are read-only:
    they are calculated from dry mill batches and adjustments."""

    arrival_date = serializers.DateField(default=date.today)
    source_facility = serializers.PrimaryKeyRelatedField(
        queryset=CWS_FACILITIES, required=False, allow_null=True
    )
    source_supplier = serializers.PrimaryKeyRelatedField(
        queryset=Supplier.objects.filter(is_active=True), required=False, allow_null=True
    )
    source_name = serializers.CharField(read_only=True)
    source_code = serializers.CharField(read_only=True)
    process = serializers.PrimaryKeyRelatedField(
        queryset=Process.objects.filter(is_active=True), required=False, allow_null=True
    )
    sub_process = serializers.PrimaryKeyRelatedField(
        queryset=SubProcess.objects.filter(is_active=True), required=False, allow_null=True
    )
    process_name = serializers.CharField(source="process.name", read_only=True, default="")
    sub_process_name = serializers.CharField(source="sub_process.name", read_only=True, default="")
    net_weight_kg = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.01")
    )
    weight_of_bags_kg = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=ZERO, required=False, allow_null=True
    )
    variance_kg = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(
        source="created_by.full_name", read_only=True, default=""
    )
    updated_by_name = serializers.CharField(
        source="updated_by.full_name", read_only=True, default=""
    )

    class Meta:
        model = HqStockReceipt
        fields = [
            "id",
            "receipt_number",
            "arrival_date",
            "crop_year",
            "origin_type",
            "source_facility",
            "source_supplier",
            "source_name",
            "source_code",
            "source_raw",
            "item_type",
            "process",
            "process_name",
            "sub_process",
            "sub_process_name",
            "process_raw",
            "grade",
            "lot_reference",
            "purchase_contract_number",
            "weighing_status",
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
            "quality_comment",
            "processing_status",
            "processing_date",
            "processed_kg",
            "adjusted_kg",
            "stock_balance_kg",
            "import_batch",
            "source_row",
            "created_by_name",
            "updated_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "receipt_number",
            "crop_year",
            "origin_type",
            "source_raw",
            "process_raw",
            "pure_weight_kg",
            "quality_comment",
            "processing_status",
            "processing_date",
            "processed_kg",
            "adjusted_kg",
            "stock_balance_kg",
            "import_batch",
            "source_row",
            "created_at",
            "updated_at",
        ]

    def get_variance_kg(self, obj) -> str | None:
        if obj.delivery_note_qty_kg is None:
            return None
        return str(obj.net_weight_kg - obj.delivery_note_qty_kg)

    def validate(self, attrs):
        # Origin follows the chosen source: a Baho CWS -> BAHO, a supplier -> PARTNER.
        if "source_facility" in attrs or "source_supplier" in attrs or self.instance is None:
            facility, supplier = attrs.get("source_facility"), attrs.get("source_supplier")
            if facility and supplier:
                raise serializers.ValidationError(
                    {"source_facility": "Choose either a CWS or a supplier, not both."}
                )
            if not (facility or supplier):
                raise serializers.ValidationError(
                    {"source_facility": "Choose the CWS or supplier the coffee came from."}
                )
            attrs["origin_type"] = "OWN_CWS" if facility else "PARTNER_SUPPLIER"
            attrs["source_facility"], attrs["source_supplier"] = facility, supplier
        return attrs


class BatchInputDetailSerializer(serializers.ModelSerializer):
    batch_no = serializers.CharField(source="batch.batch_no")
    processing_date = serializers.DateField(source="batch.processing_date")

    class Meta:
        model = DryMillBatchInput
        fields = ["batch", "batch_no", "processing_date", "qty_kg"]


class StockAdjustmentSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(
        source="created_by.full_name", read_only=True, default=""
    )
    adjusted_on = serializers.DateField(default=date.today)

    class Meta:
        model = StockAdjustment
        fields = ["id", "qty_kg", "reason", "adjusted_on", "created_by_name", "created_at"]
        read_only_fields = ["id", "created_by_name", "created_at"]


class HqStockReceiptDetailSerializer(HqStockReceiptSerializer):
    """One receipt with where its stock went."""

    movements = serializers.SerializerMethodField()
    adjustments = StockAdjustmentSerializer(many=True, read_only=True)

    class Meta(HqStockReceiptSerializer.Meta):
        fields = [*HqStockReceiptSerializer.Meta.fields, "movements", "adjustments"]

    def get_movements(self, obj) -> list[dict]:
        lines = obj.batch_inputs.filter(batch__is_deleted=False).select_related("batch")
        return BatchInputDetailSerializer(lines, many=True).data


class QualityUpdateSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.UUIDField(), min_length=1)
    quality_status = serializers.ChoiceField(choices=HqStockReceipt.QualityStatus.choices)
    comment = serializers.CharField(required=False, allow_blank=True, default="")


class StockTotalsSerializer(serializers.Serializer):
    receipts = serializers.IntegerField()
    net_weight_kg = serializers.DecimalField(max_digits=14, decimal_places=2)
    weight_of_bags_kg = serializers.DecimalField(max_digits=14, decimal_places=2)
    pure_weight_kg = serializers.DecimalField(max_digits=14, decimal_places=2)
    processed_kg = serializers.DecimalField(max_digits=14, decimal_places=2)
    adjusted_kg = serializers.DecimalField(max_digits=14, decimal_places=2)
    stock_balance_kg = serializers.DecimalField(max_digits=14, decimal_places=2)


# --- Dry mill batches -------------------------------------------------------------------


class DryMillOutputSerializer(serializers.ModelSerializer):
    export_grade = serializers.PrimaryKeyRelatedField(
        queryset=ExportGrade.objects.filter(is_active=True)
    )
    grade_name = serializers.CharField(source="export_grade.name", read_only=True)
    qty_kg = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=ZERO)

    class Meta:
        model = DryMillOutput
        fields = ["export_grade", "grade_name", "qty_kg"]


class DryMillInputSerializer(serializers.ModelSerializer):
    receipt = serializers.PrimaryKeyRelatedField(queryset=HqStockReceipt.objects.all())
    receipt_number = serializers.CharField(source="receipt.receipt_number", read_only=True)
    source_name = serializers.CharField(source="receipt.source_name", read_only=True)
    process_name = serializers.CharField(source="receipt.process.name", read_only=True, default="")
    sub_process_name = serializers.CharField(
        source="receipt.sub_process.name", read_only=True, default=""
    )
    grade = serializers.CharField(source="receipt.grade", read_only=True)
    qty_kg = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=ZERO)

    class Meta:
        model = DryMillBatchInput
        fields = [
            "receipt",
            "receipt_number",
            "source_name",
            "process_name",
            "sub_process_name",
            "grade",
            "qty_kg",
        ]


class StockLineSerializer(serializers.Serializer):
    """What was milled: N kg of a process (optionally sub-process / grade / source)."""

    process = serializers.PrimaryKeyRelatedField(queryset=Process.objects.filter(is_active=True))
    sub_process = serializers.PrimaryKeyRelatedField(
        queryset=SubProcess.objects.all(), required=False, allow_null=True
    )
    grade = serializers.CharField(required=False, allow_blank=True, default="")
    source_facility = serializers.PrimaryKeyRelatedField(
        queryset=CWS_FACILITIES, required=False, allow_null=True
    )
    source_supplier = serializers.PrimaryKeyRelatedField(
        queryset=Supplier.objects.all(), required=False, allow_null=True
    )
    qty_kg = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=ZERO)


class AvailableStockSerializer(serializers.Serializer):
    available_kg = serializers.DecimalField(max_digits=14, decimal_places=2)
    receipts = serializers.IntegerField()
    oldest_arrival = serializers.DateField(allow_null=True)


class DryMillBatchSerializer(serializers.ModelSerializer):
    processing_date = serializers.DateField(default=date.today)
    batch_no = serializers.CharField(max_length=40, required=False, allow_blank=True, default="")
    process = serializers.PrimaryKeyRelatedField(
        queryset=Process.objects.filter(is_active=True), required=False, allow_null=True
    )
    sub_process = serializers.PrimaryKeyRelatedField(
        queryset=SubProcess.objects.all(), required=False, allow_null=True
    )
    process_name = serializers.CharField(source="process.name", read_only=True, default="")
    sub_process_name = serializers.CharField(
        source="sub_process.name", read_only=True, default=""
    )
    stock_lines = StockLineSerializer(many=True, write_only=True, required=False)
    inputs = DryMillInputSerializer(many=True, required=False)
    outputs = DryMillOutputSerializer(many=True)
    source_name = serializers.CharField(read_only=True)
    source_code = serializers.CharField(read_only=True)
    green_output_kg = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    outturn_pct = serializers.SerializerMethodField()

    class Meta:
        model = DryMillBatch
        fields = [
            "id",
            "batch_no",
            "processing_date",
            "origin_type",
            "source_name",
            "source_code",
            "process",
            "process_name",
            "sub_process",
            "sub_process_name",
            "process_product",
            "parch_input_kg",
            "stock_lines",
            "inputs",
            "outputs",
            "green_output_kg",
            "outturn_pct",
            "status",
            "created_at",
        ]
        read_only_fields = ["origin_type", "parch_input_kg", "created_at"]
        extra_kwargs = {"batch_no": {"validators": []}}

    def validate(self, attrs):
        if not attrs.get("stock_lines") and not attrs.get("inputs"):
            raise serializers.ValidationError(
                {"stock_lines": "Enter the parchment taken from stock (process and kg)."}
            )
        return attrs

    def get_outturn_pct(self, obj) -> str:
        if not obj.parch_input_kg:
            return "0"
        pct = Decimal(obj.green_output_kg) / obj.parch_input_kg * 100
        return str(pct.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

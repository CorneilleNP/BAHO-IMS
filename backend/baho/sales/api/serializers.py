from datetime import date
from decimal import Decimal

from rest_framework import serializers

from baho.core.fields import ActiveFlagField
from baho.drymill.models import ExportGrade, Supplier
from baho.organization.models import Facility
from baho.processing.models import Process, SubProcess

from ..models import Client, ExportShipment, ExportShipmentLine

CWS_FACILITIES = Facility.objects.filter(facility_type=Facility.FacilityType.CWS, is_active=True)


class ClientSerializer(serializers.ModelSerializer):
    is_active = ActiveFlagField()

    class Meta:
        model = Client
        fields = [
            "id",
            "name",
            "country",
            "contact_name",
            "email",
            "phone",
            "tin",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["created_at"]
        extra_kwargs = {"name": {"validators": []}}  # case-insensitive check in the service


class ShipmentLineSerializer(serializers.ModelSerializer):
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
    source_facility = serializers.PrimaryKeyRelatedField(
        queryset=CWS_FACILITIES, required=False, allow_null=True
    )
    source_supplier = serializers.PrimaryKeyRelatedField(
        queryset=Supplier.objects.all(), required=False, allow_null=True
    )
    source_name = serializers.SerializerMethodField()
    process_product = serializers.CharField(required=False, allow_blank=True, default="")
    export_grade = serializers.PrimaryKeyRelatedField(
        queryset=ExportGrade.objects.filter(is_active=True)
    )
    grade_name = serializers.CharField(source="export_grade.name", read_only=True)
    qty_kg = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"))

    class Meta:
        model = ExportShipmentLine
        fields = [
            "process",
            "process_name",
            "sub_process",
            "sub_process_name",
            "source_facility",
            "source_supplier",
            "source_name",
            "process_product",
            "export_grade",
            "grade_name",
            "qty_kg",
        ]

    def get_source_name(self, obj) -> str:
        source = obj.source_facility or obj.source_supplier
        return source.name if source else ""


class ExportShipmentSerializer(serializers.ModelSerializer):
    client = serializers.PrimaryKeyRelatedField(queryset=Client.objects.filter(is_active=True))
    client_name = serializers.CharField(source="client.name", read_only=True)
    delivery_to_naeb_date = serializers.DateField(default=date.today)
    lines = ShipmentLineSerializer(many=True)
    total_qty_kg = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = ExportShipment
        fields = [
            "id",
            "shipment_no",
            "client",
            "client_name",
            "delivery_to_naeb_date",
            "status",
            "notes",
            "lines",
            "total_qty_kg",
            "created_at",
        ]
        read_only_fields = ["shipment_no", "created_at"]


class ShipmentStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=ExportShipment.Status.choices)

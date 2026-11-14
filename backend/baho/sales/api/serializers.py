from datetime import date
from decimal import Decimal

from rest_framework import serializers

from baho.core.fields import ActiveFlagField
from baho.drymill.models import ExportGrade

from ..models import Client, ExportShipment, ExportShipmentLine


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
    export_grade = serializers.PrimaryKeyRelatedField(
        queryset=ExportGrade.objects.filter(is_active=True)
    )
    grade_name = serializers.CharField(source="export_grade.name", read_only=True)
    qty_kg = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"))

    class Meta:
        model = ExportShipmentLine
        fields = ["process_product", "export_grade", "grade_name", "qty_kg"]


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

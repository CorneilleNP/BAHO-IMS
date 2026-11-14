from decimal import Decimal

from rest_framework import serializers

from baho.farmers.models import Farmer
from baho.organization.models import Facility

from ..models import CherryReceipt, CherryReceiptLine

ZERO = Decimal("0")


class CherryReceiptLineSerializer(serializers.ModelSerializer):
    quantity_kg = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=ZERO)
    price_per_kg = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=ZERO)
    transport_cost = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=ZERO, default=ZERO
    )
    commission = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=ZERO, default=ZERO
    )

    class Meta:
        model = CherryReceiptLine
        fields = [
            "cherry_grade",
            "quantity_kg",
            "price_per_kg",
            "transport_cost",
            "commission",
            "line_amount",
        ]
        read_only_fields = ["line_amount"]


class CherryReceiptSerializer(serializers.ModelSerializer):
    facility = serializers.PrimaryKeyRelatedField(queryset=Facility.objects.filter(is_active=True))
    farmer = serializers.PrimaryKeyRelatedField(queryset=Farmer.objects.filter(is_active=True))
    lines = CherryReceiptLineSerializer(many=True)
    facility_name = serializers.CharField(source="facility.name", read_only=True)
    farmer_name = serializers.CharField(source="farmer.full_name", read_only=True)
    farmer_code = serializers.CharField(source="farmer.farmer_code", read_only=True)
    total_kg = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)
    total_amount = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)

    class Meta:
        model = CherryReceipt
        fields = [
            "id",
            "grn_number",
            "facility",
            "facility_name",
            "farmer",
            "farmer_name",
            "farmer_code",
            "received_on",
            "payment_method",
            "payment_status",
            "notes",
            "lines",
            "total_kg",
            "total_amount",
            "created_at",
        ]
        read_only_fields = ["grn_number", "created_at"]

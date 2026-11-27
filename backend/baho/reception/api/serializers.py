from decimal import Decimal

from rest_framework import serializers

from baho.farmers.models import Farmer
from baho.organization.api.serializers import LocationPathSerializer
from baho.organization.locations import location_path
from baho.organization.models import Facility

from ..models import CherryPayment, CherryReceipt, CherryReceiptLine

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
    # For the printable GRN/payment voucher given to the farmer.
    farmer_phone = serializers.CharField(source="farmer.phone", read_only=True, default="")
    farmer_national_id = serializers.CharField(
        source="farmer.national_id", read_only=True, default=""
    )
    farmer_location = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(
        source="created_by.full_name", read_only=True, default=""
    )
    total_kg = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)
    total_amount = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)
    # In: amount paid at weighing when payment_status is PARTIAL. Out: total paid so far.
    amount_paid = serializers.DecimalField(
        max_digits=16, decimal_places=2, min_value=ZERO, required=False, allow_null=True
    )
    balance = serializers.SerializerMethodField(help_text="Still owed to the farmer.")

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
            "farmer_phone",
            "farmer_national_id",
            "farmer_location",
            "created_by_name",
            "received_on",
            "payment_method",
            "payment_status",
            "notes",
            "lines",
            "total_kg",
            "total_amount",
            "amount_paid",
            "balance",
            "created_at",
        ]
        read_only_fields = ["grn_number", "created_at"]

    def get_balance(self, obj) -> Decimal:
        return getattr(obj, "total_amount", ZERO) - obj.amount_paid

    def get_farmer_location(self, obj) -> dict:
        return LocationPathSerializer(location_path(obj.farmer.location)).data


class PaymentInputSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=16, decimal_places=2, min_value=Decimal("0.01"))
    paid_on = serializers.DateField(required=False)
    method = serializers.ChoiceField(choices=CherryReceipt.PaymentMethod.choices)
    reference = serializers.CharField(max_length=100, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)


class CherryPaymentSerializer(serializers.ModelSerializer):
    grn_number = serializers.CharField(source="receipt.grn_number", read_only=True)
    farmer_name = serializers.CharField(source="receipt.farmer.full_name", read_only=True)
    facility = serializers.UUIDField(source="receipt.facility_id", read_only=True)
    facility_name = serializers.CharField(source="receipt.facility.name", read_only=True)
    created_by_name = serializers.CharField(
        source="created_by.full_name", read_only=True, default=""
    )

    class Meta:
        model = CherryPayment
        fields = [
            "id",
            "receipt",
            "grn_number",
            "farmer_name",
            "facility",
            "facility_name",
            "paid_on",
            "amount",
            "method",
            "reference",
            "notes",
            "created_by_name",
            "created_at",
        ]
        read_only_fields = fields

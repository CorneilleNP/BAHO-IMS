from rest_framework import serializers

from baho.core.fields import ActiveFlagField
from baho.core.names import PersonNameSerializerMixin
from baho.organization.api.serializers import LocationFieldsMixin

from ..models import Farmer


class FarmerSerializer(PersonNameSerializerMixin, LocationFieldsMixin, serializers.ModelSerializer):
    is_active = ActiveFlagField()

    home_facility_name = serializers.CharField(source="home_facility.name", read_only=True)

    class Meta:
        model = Farmer
        fields = [
            "id",
            "farmer_code",
            "first_name",
            "last_name",
            "full_name",
            "gender",
            "national_id",
            "phone",
            "home_facility",
            "home_facility_name",
            *LocationFieldsMixin.LOCATION_FIELDS,
            "household_size",
            "land_area_ha",
            "is_active",
            "created_at",
            "grn_count",
            "delivered_kg",
            "last_delivery",
        ]
        read_only_fields = ["farmer_code", "created_at"]
        # Derived from first/last name; still accepted on its own from older clients.
        extra_kwargs = {"full_name": {"required": False}}

    # Present on list/detail (annotated by selectors.farmers_with_totals).
    grn_count = serializers.IntegerField(read_only=True, default=0)
    delivered_kg = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True, default=0
    )
    last_delivery = serializers.DateField(read_only=True, default=None)


class FarmerDeliverySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    grn_number = serializers.CharField()
    received_on = serializers.DateField()
    facility_name = serializers.CharField(source="facility.name")
    payment_status = serializers.CharField()
    is_voided = serializers.BooleanField(source="is_deleted")
    good_kg = serializers.SerializerMethodField()
    float_kg = serializers.SerializerMethodField()
    total_amount = serializers.SerializerMethodField()
    amount_paid = serializers.DecimalField(max_digits=16, decimal_places=2)
    balance = serializers.SerializerMethodField()

    def _total(self, receipt):
        return sum(
            (
                line.line_amount + line.transport_cost + line.commission
                for line in receipt.lines.all()
            ),
            0,
        )

    def get_total_amount(self, receipt) -> str:
        return str(self._total(receipt))

    def get_balance(self, receipt) -> str:
        return str(self._total(receipt) - receipt.amount_paid)

    def _kg(self, receipt, grade):
        return str(
            sum((line.quantity_kg for line in receipt.lines.all() if line.cherry_grade == grade), 0)
        )

    def get_good_kg(self, receipt) -> str:
        return self._kg(receipt, "GOOD")

    def get_float_kg(self, receipt) -> str:
        return self._kg(receipt, "FLOAT")

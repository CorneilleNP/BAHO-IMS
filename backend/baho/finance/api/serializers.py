from decimal import Decimal

from rest_framework import serializers

from baho.organization.models import Facility

from ..models import Expense, ExpenseCategory, FundAllocation

CWS = Facility.objects.filter(facility_type=Facility.FacilityType.CWS, is_active=True)


class ExpenseCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ExpenseCategory
        fields = ["id", "code", "name", "description", "display_order"]


class FundAllocationSerializer(serializers.ModelSerializer):
    facility = serializers.PrimaryKeyRelatedField(queryset=CWS)
    facility_name = serializers.CharField(source="facility.name", read_only=True)
    amount = serializers.DecimalField(max_digits=16, decimal_places=2, min_value=Decimal("0.01"))
    created_by_name = serializers.CharField(
        source="created_by.full_name", read_only=True, default=""
    )

    class Meta:
        model = FundAllocation
        fields = [
            "id",
            "allocation_number",
            "facility",
            "facility_name",
            "allocated_on",
            "amount",
            "reference",
            "notes",
            "created_by_name",
            "created_at",
        ]
        read_only_fields = ["allocation_number", "created_at"]


class ExpenseSerializer(serializers.ModelSerializer):
    facility = serializers.PrimaryKeyRelatedField(queryset=CWS)
    facility_name = serializers.CharField(source="facility.name", read_only=True)
    category = serializers.PrimaryKeyRelatedField(queryset=ExpenseCategory.objects.all())
    category_name = serializers.CharField(source="category.name", read_only=True)
    amount = serializers.DecimalField(max_digits=16, decimal_places=2, min_value=Decimal("0.01"))
    quantity = serializers.DecimalField(
        max_digits=14,
        decimal_places=3,
        min_value=Decimal("0.001"),
        required=False,
        allow_null=True,
    )
    unit_price = serializers.DecimalField(
        max_digits=16, decimal_places=2, min_value=Decimal("0"), required=False, allow_null=True
    )
    created_by_name = serializers.CharField(
        source="created_by.full_name", read_only=True, default=""
    )

    class Meta:
        model = Expense
        fields = [
            "id",
            "expense_number",
            "facility",
            "facility_name",
            "category",
            "category_name",
            "spent_on",
            "amount",
            "description",
            "quantity",
            "unit",
            "unit_price",
            "paid_to",
            "reference",
            "created_by_name",
            "created_at",
        ]
        read_only_fields = ["expense_number", "created_at"]


class FinanceFilterSerializer(serializers.Serializer):
    station = serializers.UUIDField(required=False, allow_null=True)
    date_from = serializers.DateField(required=False, allow_null=True)
    date_to = serializers.DateField(required=False, allow_null=True)
    group = serializers.ChoiceField(choices=["day", "week", "month"], required=False)

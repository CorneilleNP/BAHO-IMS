from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from baho.core.access import DRYMILL_READ_ROLES, DRYMILL_WRITE_ROLES
from baho.core.permissions import RoleAccess
from baho.drymill.models import ExportGrade, HqStockReceipt, Supplier
from baho.organization.models import Facility
from baho.processing.models import Process

from ..selectors import stock_ledger


class LedgerQuerySerializer(serializers.Serializer):
    item_type = serializers.ChoiceField(choices=HqStockReceipt.ItemType.choices, default="PARCH")
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    process = serializers.PrimaryKeyRelatedField(queryset=Process.objects.all(), required=False)
    source_facility = serializers.PrimaryKeyRelatedField(
        queryset=Facility.objects.all(), required=False
    )
    source_supplier = serializers.PrimaryKeyRelatedField(
        queryset=Supplier.objects.all(), required=False
    )
    export_grade = serializers.PrimaryKeyRelatedField(
        queryset=ExportGrade.objects.all(), required=False
    )

    def validate(self, attrs):
        if (
            attrs.get("date_from")
            and attrs.get("date_to")
            and attrs["date_to"] < attrs["date_from"]
        ):
            raise serializers.ValidationError({"date_to": ["Must be on or after the start date."]})
        return attrs


class StockLedgerView(APIView):
    """HQ stock ledger: every parchment or green coffee movement with a running balance."""

    permission_classes = [IsAuthenticated, RoleAccess]
    read_roles = DRYMILL_READ_ROLES
    write_roles = DRYMILL_WRITE_ROLES

    @extend_schema(
        parameters=[
            OpenApiParameter("item_type", str, enum=["PARCH", "GREEN"]),
            OpenApiParameter("date_from", OpenApiTypes.DATE),
            OpenApiParameter("date_to", OpenApiTypes.DATE),
            OpenApiParameter("process", OpenApiTypes.UUID),
            OpenApiParameter("source_facility", OpenApiTypes.UUID),
            OpenApiParameter("source_supplier", OpenApiTypes.UUID),
            OpenApiParameter("export_grade", OpenApiTypes.UUID),
        ],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        params = LedgerQuerySerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        return Response(stock_ledger(**params.validated_data))

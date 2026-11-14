from decimal import Decimal

import django_filters
from django.db.models import Q, Sum
from django.db.models.functions import Coalesce
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from baho.core.access import DRYMILL_READ_ROLES, DRYMILL_WRITE_ROLES
from baho.core.mixins import VoidActionMixin
from baho.core.permissions import RoleAccess
from baho.organization.locations import ANCESTORS

from ..models import DryMillBatch, ExportGrade, HqStockReceipt, Supplier
from ..selectors import batches_with_totals, coffee_sources, receipt_history, stock_receipts
from ..services import (
    adjust_stock,
    check_receipt_can_be_voided,
    create_dry_mill_batch,
    create_stock_receipt,
    create_supplier,
    release_batch_stock,
    set_quality_status,
    update_stock_receipt,
)
from .serializers import (
    CoffeeSourceSerializer,
    DryMillBatchSerializer,
    ExportGradeSerializer,
    HqStockReceiptDetailSerializer,
    HqStockReceiptSerializer,
    QualityUpdateSerializer,
    StockAdjustmentSerializer,
    StockTotalsSerializer,
    SupplierSerializer,
)

ZERO = Decimal("0")


class DryMillAccess:
    permission_classes = [RoleAccess]
    read_roles = DRYMILL_READ_ROLES
    write_roles = DRYMILL_WRITE_ROLES


class SupplierViewSet(
    DryMillAccess,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Partner suppliers. Baho's own CWS stations are facilities, see /drymill/sources/."""

    queryset = Supplier.objects.select_related(f"location__{ANCESTORS}")
    serializer_class = SupplierSerializer
    filterset_fields = ["is_active"]
    search_fields = ["name", "contact_name", "location__name"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def perform_create(self, serializer):
        serializer.instance = create_supplier(user=self.request.user, **serializer.validated_data)


class ExportGradeViewSet(DryMillAccess, mixins.ListModelMixin, viewsets.GenericViewSet):
    """Green coffee grades/products (15+, 13/14, GTR…). Managed in Django admin."""

    queryset = ExportGrade.objects.filter(is_active=True)
    serializer_class = ExportGradeSerializer
    pagination_class = None


class CoffeeSourcesView(DryMillAccess, APIView):
    """All sources for dropdowns: Baho CWS stations + partner suppliers."""

    @extend_schema(responses=CoffeeSourceSerializer(many=True))
    def get(self, request):
        return Response(CoffeeSourceSerializer(coffee_sources(), many=True).data)


class StockReceiptFilter(django_filters.FilterSet):
    arrival_date__gte = django_filters.DateFilter(field_name="arrival_date", lookup_expr="gte")
    arrival_date__lte = django_filters.DateFilter(field_name="arrival_date", lookup_expr="lte")
    process_unassigned = django_filters.BooleanFilter(
        field_name="process", lookup_expr="isnull", label="Receipts without a process"
    )
    has_balance = django_filters.BooleanFilter(method="filter_has_balance")
    source = django_filters.CharFilter(
        method="filter_source", label="Station code or supplier name"
    )

    class Meta:
        model = HqStockReceipt
        fields = [
            "process",
            "sub_process",
            "grade",
            "origin_type",
            "source_facility",
            "source_supplier",
            "quality_status",
            "processing_status",
            "weighing_status",
            "item_type",
            "crop_year",
            "import_batch",
        ]

    def filter_has_balance(self, queryset, name, value):
        return (
            queryset.filter(stock_balance_kg__gt=0)
            if value
            else queryset.filter(stock_balance_kg__lte=0)
        )

    def filter_source(self, queryset, name, value):
        return queryset.filter(Q(source_facility__code=value) | Q(source_supplier__name=value))


class HqStockReceiptViewSet(
    VoidActionMixin,
    DryMillAccess,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Inbound parchment/green coffee at HQ (every column of the BAHO STOCK UPDATE sheet).

    Pure weight = net − bags. Processed, balance, processing status and date are
    calculated from dry mill batches and stock adjustments, never typed in.
    """

    queryset = stock_receipts()
    serializer_class = HqStockReceiptSerializer
    filterset_class = StockReceiptFilter
    search_fields = [
        "receipt_number",
        "lot_reference",
        "delivery_note_no",
        "wrn_number",
        "purchase_contract_number",
        "stock_card_number",
        "process_raw",
    ]
    ordering_fields = [
        "arrival_date",
        "net_weight_kg",
        "pure_weight_kg",
        "stock_balance_kg",
        "receipt_number",
    ]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return HqStockReceiptDetailSerializer
        return HqStockReceiptSerializer

    def perform_create(self, serializer):
        receipt = create_stock_receipt(user=self.request.user, **serializer.validated_data)
        serializer.instance = stock_receipts().get(pk=receipt.pk)

    def perform_update(self, serializer):
        receipt = update_stock_receipt(
            user=self.request.user, receipt=serializer.instance, **serializer.validated_data
        )
        serializer.instance = stock_receipts().get(pk=receipt.pk)

    def check_can_void(self, instance):
        check_receipt_can_be_voided(instance)

    @extend_schema(request=QualityUpdateSerializer, responses=OpenApiTypes.OBJECT)
    @action(detail=False, methods=["post"])
    def quality(self, request):
        """Accept / reject / reset quality for one or many receipts at once."""
        data = QualityUpdateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        receipts = list(self.get_queryset().filter(pk__in=data.validated_data["ids"]))
        count = set_quality_status(
            user=request.user,
            receipts=receipts,
            quality_status=data.validated_data["quality_status"],
            comment=data.validated_data["comment"],
        )
        return Response({"updated": count})

    @extend_schema(request=StockAdjustmentSerializer, responses=HqStockReceiptDetailSerializer)
    @action(detail=True, methods=["post"])
    def adjust(self, request, pk=None):
        """Correct the stock of this receipt (negative = remove) with a reason."""
        data = StockAdjustmentSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        adjust_stock(user=request.user, receipt=self.get_object(), **data.validated_data)
        return Response(HqStockReceiptDetailSerializer(stock_receipts().get(pk=pk)).data)

    @extend_schema(responses=StockTotalsSerializer)
    @action(detail=False)
    def totals(self, request):
        """Sums for exactly the receipts matching the current filters (table footer)."""
        qs = self.filter_queryset(self.get_queryset())
        agg = qs.aggregate(
            net_weight_kg=Coalesce(Sum("net_weight_kg"), ZERO),
            weight_of_bags_kg=Coalesce(Sum("weight_of_bags_kg"), ZERO),
            pure_weight_kg=Coalesce(Sum("pure_weight_kg"), ZERO),
            processed_kg=Coalesce(Sum("processed_kg"), ZERO),
            adjusted_kg=Coalesce(Sum("adjusted_kg"), ZERO),
            stock_balance_kg=Coalesce(Sum("stock_balance_kg"), ZERO),
        )
        return Response(StockTotalsSerializer({"receipts": qs.count(), **agg}).data)

    @extend_schema(responses=OpenApiTypes.OBJECT)
    @action(detail=True)
    def history(self, request, pk=None):
        """Who changed what and when (old value -> new value)."""
        return Response(receipt_history(self.get_object()))


class DryMillBatchViewSet(
    VoidActionMixin,
    DryMillAccess,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """Parchment -> green batches. Each batch takes parchment from specific stock receipts."""

    queryset = batches_with_totals()
    serializer_class = DryMillBatchSerializer
    filterset_fields = {
        "processing_date": ["exact", "gte", "lte"],
        "origin_type": ["exact"],
        "process_product": ["exact"],
        "status": ["exact"],
    }
    search_fields = ["batch_no", "process_product", "inputs__receipt__receipt_number"]

    def get_queryset(self):
        queryset = super().get_queryset()
        params = self.request.query_params
        q = Q()
        if params.get("source"):  # station code or supplier name
            q &= Q(inputs__receipt__source_facility__code=params["source"]) | Q(
                inputs__receipt__source_supplier__name=params["source"]
            )
        if params.get("process") == "none":
            q &= Q(inputs__receipt__process__isnull=True)
        elif params.get("process"):
            q &= Q(inputs__receipt__process_id=params["process"])
        if params.get("sub_process"):
            q &= Q(inputs__receipt__sub_process_id=params["sub_process"])
        if params.get("grade"):
            q &= Q(inputs__receipt__grade=params["grade"])
        if q:
            queryset = queryset.filter(pk__in=DryMillBatch.objects.filter(q).values("pk"))
        return queryset

    def perform_create(self, serializer):
        batch = create_dry_mill_batch(user=self.request.user, **serializer.validated_data)
        serializer.instance = batches_with_totals().get(pk=batch.pk)

    def after_void(self, instance):
        release_batch_stock(instance)

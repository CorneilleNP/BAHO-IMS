from django.db.models import Q
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from baho.core.access import DRYMILL_READ_ROLES, DRYMILL_WRITE_ROLES
from baho.core.permissions import RoleAccess

from ..models import ExportGrade, Supplier
from ..selectors import batches_with_totals, coffee_sources, stock_receipts
from ..services import (
    create_dry_mill_batch,
    create_stock_receipt,
    create_supplier,
    update_stock_receipt_status,
)
from .serializers import (
    CoffeeSourceSerializer,
    DryMillBatchSerializer,
    ExportGradeSerializer,
    HqStockReceiptSerializer,
    StockReceiptStatusSerializer,
    SupplierSerializer,
)


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

    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    filterset_fields = ["is_active", "district"]
    search_fields = ["name", "contact_name", "district"]
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


class HqStockReceiptViewSet(
    DryMillAccess,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """Inbound parchment/green coffee at HQ. Pure weight = net weight − weight of bags."""

    queryset = stock_receipts()
    serializer_class = HqStockReceiptSerializer
    filterset_fields = {
        "arrival_date": ["exact", "gte", "lte"],
        "process": ["exact"],
        "grade": ["exact"],
        "origin_type": ["exact"],
        "source_facility": ["exact"],
        "source_supplier": ["exact"],
        "quality_status": ["exact"],
        "processing_status": ["exact"],
    }
    search_fields = ["receipt_number", "lot_reference", "delivery_note_no", "wrn_number"]

    def perform_create(self, serializer):
        receipt = create_stock_receipt(user=self.request.user, **serializer.validated_data)
        serializer.instance = stock_receipts().get(pk=receipt.pk)

    @extend_schema(request=StockReceiptStatusSerializer, responses=HqStockReceiptSerializer)
    @action(detail=True, methods=["post"])
    def status(self, request, pk=None):
        data = StockReceiptStatusSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        receipt = update_stock_receipt_status(
            user=request.user, receipt=self.get_object(), **data.validated_data
        )
        return Response(HqStockReceiptSerializer(receipt).data)


class DryMillBatchViewSet(
    DryMillAccess,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """Parchment -> green batches with output per export grade."""

    queryset = batches_with_totals()
    serializer_class = DryMillBatchSerializer
    filterset_fields = {
        "processing_date": ["exact", "gte", "lte"],
        "origin_type": ["exact"],
        "source_facility": ["exact"],
        "source_supplier": ["exact"],
        "process_product": ["exact"],
        "status": ["exact"],
    }
    search_fields = ["batch_no", "process_product"]

    def get_queryset(self):
        queryset = super().get_queryset()
        source = self.request.query_params.get("source")  # station code or supplier name
        if source:
            queryset = queryset.filter(
                Q(source_facility__code=source) | Q(source_supplier__name=source)
            )
        return queryset

    def perform_create(self, serializer):
        batch = create_dry_mill_batch(user=self.request.user, **serializer.validated_data)
        serializer.instance = batches_with_totals().get(pk=batch.pk)

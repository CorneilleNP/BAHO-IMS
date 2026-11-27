from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from baho.core.access import CWS_READ_ROLES, CWS_WRITE_ROLES
from baho.core.mixins import FacilityScopedViewSetMixin, VoidActionMixin, VoidSerializer
from baho.core.permissions import RoleAccess

from ..models import CherryPayment, CherryReceipt
from ..selectors import receipts_with_totals
from ..services import (
    create_cherry_receipt,
    is_admin,
    record_payment,
    update_cherry_receipt,
    void_payment,
)
from .serializers import CherryPaymentSerializer, CherryReceiptSerializer, PaymentInputSerializer


class CherryReceiptViewSet(
    VoidActionMixin,
    FacilityScopedViewSetMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Cherry deliveries (GRNs). The GRN number is assigned by the server.
    A saved GRN is locked: only an administrator may correct it (PATCH) or
    delete it. Station staff record payments with POST <id>/pay/."""

    queryset = CherryReceipt.objects.all()
    serializer_class = CherryReceiptSerializer
    permission_classes = [RoleAccess]
    read_roles = CWS_READ_ROLES
    write_roles = CWS_WRITE_ROLES
    http_method_names = ["get", "post", "patch", "head", "options"]
    filterset_fields = {
        "facility": ["exact"],
        "farmer": ["exact"],
        "payment_status": ["exact", "in"],
        "received_on": ["exact", "gte", "lte"],
    }
    search_fields = ["grn_number", "farmer__full_name", "farmer__farmer_code"]
    ordering_fields = ["received_on", "created_at"]

    def get_queryset(self):
        self.queryset = receipts_with_totals()
        return super().get_queryset()

    def check_can_void(self, instance):
        if not is_admin(self.request.user):
            raise PermissionDenied("Only an administrator can delete a saved GRN.")
        if instance.payments.exists():
            raise ValidationError(
                ["This GRN has payments: delete its payments first, then the GRN."]
            )

    def perform_create(self, serializer):
        receipt = create_cherry_receipt(user=self.request.user, **serializer.validated_data)
        serializer.instance = receipts_with_totals().get(pk=receipt.pk)

    def perform_update(self, serializer):
        receipt = update_cherry_receipt(
            user=self.request.user, receipt=serializer.instance, **serializer.validated_data
        )
        serializer.instance = receipts_with_totals().get(pk=receipt.pk)

    @extend_schema(request=PaymentInputSerializer, responses=CherryReceiptSerializer)
    @action(detail=True, methods=["post"])
    def pay(self, request, pk=None):
        """Record a payment (full or part of the balance). Changes nothing else."""
        receipt = self.get_object()
        data = PaymentInputSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        record_payment(user=request.user, receipt=receipt, **data.validated_data)
        receipt = receipts_with_totals().get(pk=receipt.pk)
        return Response(CherryReceiptSerializer(receipt).data, status=status.HTTP_200_OK)


class CherryPaymentViewSet(
    FacilityScopedViewSetMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Payments made to farmers (each GRN can be paid in parts). Delete a wrong
    one with POST <id>/void/ {reason} (administrator only)."""

    queryset = CherryPayment.objects.select_related(
        "receipt", "receipt__facility", "receipt__farmer", "created_by"
    ).filter(receipt__is_deleted=False)
    serializer_class = CherryPaymentSerializer
    permission_classes = [RoleAccess]
    read_roles = CWS_READ_ROLES
    write_roles = CWS_WRITE_ROLES
    facility_field = "receipt__facility"
    filterset_fields = {
        "receipt": ["exact"],
        "receipt__facility": ["exact"],
        "paid_on": ["exact", "gte", "lte"],
    }
    ordering_fields = ["paid_on", "created_at"]

    @extend_schema(request=VoidSerializer, responses=CherryReceiptSerializer)
    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        payment = self.get_object()
        data = VoidSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        receipt = void_payment(
            user=request.user, payment=payment, reason=data.validated_data["reason"]
        )
        return Response(CherryReceiptSerializer(receipts_with_totals().get(pk=receipt.pk)).data)

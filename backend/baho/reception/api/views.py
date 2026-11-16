from rest_framework import mixins, viewsets

from baho.core.access import CWS_READ_ROLES, CWS_WRITE_ROLES
from baho.core.mixins import FacilityScopedViewSetMixin, VoidActionMixin
from baho.core.permissions import RoleAccess

from ..models import CherryReceipt
from ..selectors import receipts_with_totals
from ..services import create_cherry_receipt, update_cherry_receipt
from .serializers import CherryReceiptSerializer


class CherryReceiptViewSet(
    VoidActionMixin,
    FacilityScopedViewSetMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Cherry deliveries (GRNs). The GRN number is assigned by the server; any
    field (including lines) can be corrected afterwards with PATCH."""

    queryset = CherryReceipt.objects.all()
    serializer_class = CherryReceiptSerializer
    permission_classes = [RoleAccess]
    read_roles = CWS_READ_ROLES
    write_roles = CWS_WRITE_ROLES
    http_method_names = ["get", "post", "patch", "head", "options"]
    filterset_fields = {
        "facility": ["exact"],
        "farmer": ["exact"],
        "payment_status": ["exact"],
        "received_on": ["exact", "gte", "lte"],
    }
    search_fields = ["grn_number", "farmer__full_name", "farmer__farmer_code"]
    ordering_fields = ["received_on", "created_at"]

    def get_queryset(self):
        self.queryset = receipts_with_totals()
        return super().get_queryset()

    def perform_create(self, serializer):
        receipt = create_cherry_receipt(user=self.request.user, **serializer.validated_data)
        serializer.instance = receipts_with_totals().get(pk=receipt.pk)

    def perform_update(self, serializer):
        receipt = update_cherry_receipt(
            user=self.request.user, receipt=serializer.instance, **serializer.validated_data
        )
        serializer.instance = receipts_with_totals().get(pk=receipt.pk)

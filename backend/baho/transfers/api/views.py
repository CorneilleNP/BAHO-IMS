from django.shortcuts import get_object_or_404
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from baho.core.access import CWS_READ_ROLES, CWS_WRITE_ROLES, DRYMILL_READ_ROLES, DRYMILL_WRITE_ROLES, RoleCode
from baho.core.mixins import FacilityScopedViewSetMixin
from baho.core.permissions import HasAnyRole, RoleAccess

from ..models import CwsTransfer, DryMillTransferReceipt
from ..selectors import dry_mill_receipts, transfers_with_lines
from ..services import (
    create_transfer,
    lock_dry_mill_receipt,
    lookup_for_dry_mill,
    submit_dry_mill_receipt,
    submit_transfer,
    unlock_dry_mill_receipt,
    update_dry_mill_line,
    update_transfer,
)
from .serializers import (
    CwsTransferSerializer,
    DryMillTransferLineUpdateSerializer,
    DryMillTransferReceiptLineSerializer,
    DryMillTransferReceiptSerializer,
    LookupSerializer,
    SubmitReceiptSerializer,
)


class CwsTransferViewSet(
    FacilityScopedViewSetMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """A CWS's own delivery notes to dry mill. Dry mill never reads these
    directly - it only sees a transfer through its own blind receipt, which
    hides these figures until it has confirmed its own weighing."""

    queryset = CwsTransfer.objects.all()
    serializer_class = CwsTransferSerializer
    permission_classes = [RoleAccess]
    read_roles = CWS_READ_ROLES
    write_roles = CWS_WRITE_ROLES
    http_method_names = ["get", "post", "patch", "head", "options"]
    filterset_fields = {
        "facility": ["exact"],
        "status": ["exact"],
        "transfer_date": ["exact", "gte", "lte"],
    }
    search_fields = ["delivery_note_no"]
    ordering_fields = ["transfer_date", "created_at"]

    def get_queryset(self):
        self.queryset = transfers_with_lines()
        return super().get_queryset()

    def perform_create(self, serializer):
        transfer = create_transfer(user=self.request.user, **serializer.validated_data)
        serializer.instance = transfers_with_lines().get(pk=transfer.pk)

    def perform_update(self, serializer):
        transfer = update_transfer(
            user=self.request.user, transfer=serializer.instance, **serializer.validated_data
        )
        serializer.instance = transfers_with_lines().get(pk=transfer.pk)

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        transfer = submit_transfer(user=request.user, transfer=self.get_object())
        return Response(CwsTransferSerializer(transfers_with_lines().get(pk=transfer.pk)).data)


class DryMillTransferReceiptViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """HQ dry mill's own, independent weighing of a CWS's delivery note, line by line."""

    queryset = DryMillTransferReceipt.objects.all()
    serializer_class = DryMillTransferReceiptSerializer
    permission_classes = [RoleAccess]
    read_roles = DRYMILL_READ_ROLES
    write_roles = DRYMILL_WRITE_ROLES
    http_method_names = ["get", "post", "patch", "head", "options"]
    filterset_fields = {"status": ["exact"]}
    ordering_fields = ["created_at"]

    def get_queryset(self):
        return dry_mill_receipts()

    @action(detail=False, methods=["get"], permission_classes=[HasAnyRole(*DRYMILL_WRITE_ROLES)])
    def lookup(self, request):
        """Find (or start) this delivery note's blind receipt. Never returns the
        CWS's own numbers unless this receipt has already been confirmed."""
        data = LookupSerializer(data=request.query_params)
        data.is_valid(raise_exception=True)
        receipt = lookup_for_dry_mill(**data.validated_data)
        return Response(DryMillTransferReceiptSerializer(dry_mill_receipts().get(pk=receipt.pk)).data)

    @action(detail=True, methods=["patch"], url_path=r"lines/(?P<line_id>[0-9a-f-]+)")
    def update_line(self, request, pk=None, line_id=None):
        receipt = self.get_object()
        line = get_object_or_404(receipt.lines, pk=line_id)
        data = DryMillTransferLineUpdateSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        line = update_dry_mill_line(user=request.user, line=line, **data.validated_data)
        return Response(DryMillTransferReceiptLineSerializer(line).data)

    @action(detail=True, methods=["post"])
    def lock(self, request, pk=None):
        """Freeze the weighing and reveal the variance against the station's figures."""
        receipt = lock_dry_mill_receipt(user=request.user, receipt=self.get_object())
        return Response(DryMillTransferReceiptSerializer(dry_mill_receipts().get(pk=receipt.pk)).data)

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        """Attach the comment and create the matching stock receipt(s). Final."""
        data = SubmitReceiptSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        receipt = submit_dry_mill_receipt(
            user=request.user, receipt=self.get_object(), **data.validated_data
        )
        return Response(DryMillTransferReceiptSerializer(dry_mill_receipts().get(pk=receipt.pk)).data)

    @action(detail=True, methods=["post"], permission_classes=[HasAnyRole(RoleCode.ADMIN)])
    def unlock(self, request, pk=None):
        receipt = unlock_dry_mill_receipt(user=request.user, receipt=self.get_object())
        return Response(DryMillTransferReceiptSerializer(dry_mill_receipts().get(pk=receipt.pk)).data)

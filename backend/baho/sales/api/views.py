from django.db.models import Q
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from baho.core.access import DRYMILL_READ_ROLES, EXPORT_WRITE_ROLES
from baho.core.mixins import VoidActionMixin
from baho.core.permissions import RoleAccess

from ..models import Client, ExportShipment
from ..selectors import shipments_with_totals
from ..services import create_client, create_shipment, green_balance, update_shipment_status
from .serializers import ClientSerializer, ExportShipmentSerializer, ShipmentStatusSerializer


class ExportAccess:
    permission_classes = [RoleAccess]
    read_roles = DRYMILL_READ_ROLES
    write_roles = EXPORT_WRITE_ROLES


class ClientViewSet(
    ExportAccess,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Client.objects.all()
    serializer_class = ClientSerializer
    filterset_fields = ["is_active", "country"]
    search_fields = ["name", "country", "contact_name"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def perform_create(self, serializer):
        serializer.instance = create_client(user=self.request.user, **serializer.validated_data)


class ExportShipmentViewSet(
    VoidActionMixin,
    ExportAccess,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """Shipments to clients. The shipment number is assigned by the server."""

    queryset = shipments_with_totals()
    serializer_class = ExportShipmentSerializer
    filterset_fields = {
        "client": ["exact"],
        "status": ["exact"],
        "delivery_to_naeb_date": ["exact", "gte", "lte"],
        "lines__process": ["exact"],
        "lines__sub_process": ["exact"],
        "lines__source_facility": ["exact"],
        "lines__source_supplier": ["exact"],
        "lines__export_grade": ["exact"],
        "lines__process_product": ["exact"],
    }
    search_fields = ["shipment_no", "client__name"]

    def get_queryset(self):
        queryset = super().get_queryset()
        source = self.request.query_params.get("source")  # station code or supplier name
        if source:
            queryset = queryset.filter(
                Q(lines__source_facility__code=source) | Q(lines__source_supplier__name=source)
            )
        return queryset.distinct()

    def check_can_void(self, instance):
        if instance.status != ExportShipment.Status.PLANNED:
            raise ValidationError(["Only planned shipments can be voided."])

    def perform_create(self, serializer):
        shipment = create_shipment(user=self.request.user, **serializer.validated_data)
        serializer.instance = shipments_with_totals().get(pk=shipment.pk)

    @extend_schema(request=ShipmentStatusSerializer, responses=ExportShipmentSerializer)
    @action(detail=True, methods=["post"], url_path="status")
    def set_status(self, request, pk=None):
        data = ShipmentStatusSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        update_shipment_status(user=request.user, shipment=self.get_object(), **data.validated_data)
        return Response(ExportShipmentSerializer(shipments_with_totals().get(pk=pk)).data)

    @extend_schema(responses=OpenApiTypes.OBJECT)
    @action(detail=False)
    def available(self, request):
        """Green coffee available to ship for a process / sub-process / source / grade."""
        params = request.query_params
        available_kg = green_balance(
            process=params.get("process") or None,
            sub_process=params.get("sub_process") or None,
            source_facility=params.get("source_facility") or None,
            source_supplier=params.get("source_supplier") or None,
            export_grade=params.get("export_grade") or None,
        )
        return Response({"available_kg": str(available_kg)})

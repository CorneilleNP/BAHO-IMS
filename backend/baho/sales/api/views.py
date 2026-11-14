from drf_spectacular.utils import extend_schema
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from baho.core.access import DRYMILL_READ_ROLES, EXPORT_WRITE_ROLES
from baho.core.permissions import RoleAccess

from ..models import Client
from ..selectors import shipments_with_totals
from ..services import create_client, create_shipment, update_shipment_status
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
        "lines__export_grade": ["exact"],
        "lines__process_product": ["exact"],
    }
    search_fields = ["shipment_no", "client__name"]

    def get_queryset(self):
        return super().get_queryset().distinct()

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

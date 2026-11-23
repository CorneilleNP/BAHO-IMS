from drf_spectacular.utils import extend_schema
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from baho.core.access import CWS_READ_ROLES, CWS_WRITE_ROLES
from baho.core.mixins import FacilityScopedViewSetMixin
from baho.core.permissions import RoleAccess

from ..selectors import farmer_deliveries, farmers_with_totals
from ..services import register_farmer, update_farmer
from .serializers import FarmerDeliverySerializer, FarmerSerializer


class FarmerViewSet(
    FacilityScopedViewSetMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Farmers of the stations you are assigned to. `?search=` matches name, code, phone, ID."""

    queryset = farmers_with_totals()
    http_method_names = ["get", "post", "patch", "head", "options"]
    serializer_class = FarmerSerializer
    permission_classes = [RoleAccess]
    read_roles = CWS_READ_ROLES
    write_roles = CWS_WRITE_ROLES
    facility_field = "home_facility"
    filterset_fields = ["home_facility", "is_active"]
    search_fields = ["full_name", "farmer_code", "phone", "national_id", "location__name"]
    ordering_fields = ["full_name", "farmer_code", "delivered_kg", "last_delivery", "created_at"]

    def perform_create(self, serializer):
        data = dict(serializer.validated_data)
        serializer.instance = register_farmer(
            user=self.request.user, home_facility=data.pop("home_facility"), **data
        )

    def perform_update(self, serializer):
        farmer = update_farmer(
            user=self.request.user, farmer=serializer.instance, **serializer.validated_data
        )
        serializer.instance = farmers_with_totals().get(pk=farmer.pk)

    @extend_schema(responses=FarmerDeliverySerializer(many=True))
    @action(detail=True, methods=["get"], pagination_class=None)
    def deliveries(self, request, pk=None):
        """Every GRN of this farmer, newest first (voided ones flagged)."""
        farmer = self.get_object()
        return Response(FarmerDeliverySerializer(farmer_deliveries(farmer), many=True).data)

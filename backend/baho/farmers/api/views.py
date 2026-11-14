from rest_framework import mixins, viewsets

from baho.core.access import CWS_READ_ROLES, CWS_WRITE_ROLES
from baho.core.mixins import FacilityScopedViewSetMixin
from baho.core.permissions import RoleAccess

from ..models import Farmer
from ..services import register_farmer
from .serializers import FarmerSerializer


class FarmerViewSet(
    FacilityScopedViewSetMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """Farmers of the stations you are assigned to. `?search=` matches name, code, phone, ID."""

    queryset = Farmer.objects.select_related("home_facility")
    serializer_class = FarmerSerializer
    permission_classes = [RoleAccess]
    read_roles = CWS_READ_ROLES
    write_roles = CWS_WRITE_ROLES
    facility_field = "home_facility"
    filterset_fields = ["home_facility", "is_active"]
    search_fields = ["full_name", "farmer_code", "phone", "national_id"]

    def perform_create(self, serializer):
        data = dict(serializer.validated_data)
        serializer.instance = register_farmer(
            user=self.request.user, home_facility=data.pop("home_facility"), **data
        )

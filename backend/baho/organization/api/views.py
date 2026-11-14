from rest_framework import viewsets

from baho.core.permissions import IsAdminOrReadOnly

from ..models import AdminUnit, CropYear, Facility
from .serializers import AdminUnitSerializer, CropYearSerializer, FacilitySerializer


class CropYearViewSet(viewsets.ModelViewSet):
    """Reference data: everyone signed in can read, ADMIN can change."""

    queryset = CropYear.objects.all()
    serializer_class = CropYearSerializer
    permission_classes = [IsAdminOrReadOnly]
    filterset_fields = ["is_active"]
    http_method_names = ["get", "post", "patch", "head", "options"]


class FacilityViewSet(viewsets.ModelViewSet):
    """All facilities are visible to every signed-in user (needed for dropdowns
    and transfers); per-station *transactional* data is scoped elsewhere."""

    queryset = Facility.objects.all()
    serializer_class = FacilitySerializer
    permission_classes = [IsAdminOrReadOnly]
    filterset_fields = ["facility_type", "is_active", "district"]
    search_fields = ["code", "name", "district", "sector"]
    ordering_fields = ["name", "code"]
    http_method_names = ["get", "post", "patch", "head", "options"]


class AdminUnitViewSet(viewsets.ModelViewSet):
    """Address tree. Filter by `?parent=<id>` or `?level=DISTRICT` for cascading pickers."""

    queryset = AdminUnit.objects.all()
    serializer_class = AdminUnitSerializer
    permission_classes = [IsAdminOrReadOnly]
    filterset_fields = ["parent", "level"]
    search_fields = ["name"]
    http_method_names = ["get", "post", "patch", "head", "options"]

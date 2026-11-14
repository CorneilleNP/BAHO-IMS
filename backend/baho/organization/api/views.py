from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from baho.core.permissions import IsAdminOrReadOnly

from ..locations import ANCESTORS, location_path
from ..models import AdminUnit, CropYear, Facility
from .serializers import (
    AdminUnitSearchSerializer,
    AdminUnitSerializer,
    CropYearSerializer,
    FacilitySerializer,
    LocationPathSerializer,
)


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

    queryset = Facility.objects.select_related(f"location__{ANCESTORS}")
    serializer_class = FacilitySerializer
    permission_classes = [IsAdminOrReadOnly]
    filterset_fields = ["facility_type", "is_active"]
    search_fields = ["code", "name", "location__name"]
    ordering_fields = ["name", "code"]
    http_method_names = ["get", "post", "patch", "head", "options"]


class AdminUnitViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Rwanda locations (Province > District > Sector > Cell > Village), read-only.

    - no parameters: the 5 provinces
    - `?parent=<id>`: the children of a unit (for cascading pickers)
    - `?search=<text>[&level=VILLAGE]`: up to 20 matches with their full path
    """

    queryset = AdminUnit.objects.all()
    serializer_class = AdminUnitSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None
    filter_backends = []  # filtering is explicit below, so the 15k villages never list at once

    @extend_schema(
        parameters=[
            OpenApiParameter("parent", OpenApiTypes.UUID),
            OpenApiParameter("search", str),
            OpenApiParameter("level", str, enum=[c for c, _ in AdminUnit.Level.choices]),
        ]
    )
    def list(self, request):
        params = request.query_params
        units = AdminUnit.objects.order_by("name")
        level = params.get("level")
        if level:
            units = units.filter(level=level)

        search = params.get("search", "").strip()
        if search:
            hits = units.filter(name__icontains=search).select_related(ANCESTORS)[:20]
            return Response(AdminUnitSearchSerializer(hits, many=True).data)

        parent = params.get("parent")
        units = units.filter(parent_id=parent) if parent else units.filter(parent__isnull=True)
        return Response(AdminUnitSerializer(units, many=True).data)

    @extend_schema(responses=LocationPathSerializer)
    @action(detail=True)
    def path(self, request, pk=None):
        """The unit and its ancestors, to pre-fill a location picker."""
        unit = AdminUnit.objects.select_related(ANCESTORS).get(pk=self.get_object().pk)
        return Response(location_path(unit))

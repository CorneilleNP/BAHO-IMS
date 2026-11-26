from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from baho.core.access import CWS_READ_ROLES, CWS_WRITE_ROLES
from baho.core.mixins import FacilityScopedViewSetMixin, VoidActionMixin
from baho.core.permissions import RoleAccess

from ..models import ProcessingLot, ProcessType
from ..selectors import lots_with_results, process_types_with_grades
from ..services import create_lot, record_actuals, register_process, update_process_type
from .serializers import (
    LotActualsSerializer,
    LotCreateSerializer,
    ProcessingLotSerializer,
    ProcessTypeCreateSerializer,
    ProcessTypeSerializer,
    ProcessTypeUpdateSerializer,
)


class ProcessTypeViewSet(
    FacilityScopedViewSetMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Processes registered per station, with grades and current estimate ratios.
    Both the registration and its ratios can be corrected afterwards with PATCH."""

    queryset = ProcessType.objects.all()
    serializer_class = ProcessTypeSerializer
    permission_classes = [RoleAccess]
    read_roles = CWS_READ_ROLES
    write_roles = CWS_WRITE_ROLES
    http_method_names = ["get", "post", "patch", "head", "options"]
    filterset_fields = ["facility", "process", "is_active"]
    pagination_class = None  # a station has a handful of processes

    def get_queryset(self):
        self.queryset = process_types_with_grades()
        return super().get_queryset()

    @extend_schema(request=ProcessTypeCreateSerializer, responses=ProcessTypeSerializer)
    def create(self, request):
        data = ProcessTypeCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        process = register_process(user=request.user, **data.validated_data)
        process = process_types_with_grades().get(pk=process.pk)
        return Response(ProcessTypeSerializer(process).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=ProcessTypeUpdateSerializer, responses=ProcessTypeSerializer)
    def partial_update(self, request, pk=None):
        process_type = self.get_object()
        data = ProcessTypeUpdateSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        updated = update_process_type(
            user=request.user, process_type=process_type, **data.validated_data
        )
        updated = process_types_with_grades().get(pk=updated.pk)
        return Response(ProcessTypeSerializer(updated).data)


class ProcessingLotViewSet(
    VoidActionMixin,
    FacilityScopedViewSetMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Processing lots: estimates are fixed at creation; actuals can be added later."""

    queryset = ProcessingLot.objects.all()
    serializer_class = ProcessingLotSerializer
    permission_classes = [RoleAccess]
    read_roles = CWS_READ_ROLES
    write_roles = CWS_WRITE_ROLES
    filterset_fields = {
        "id": ["exact"],
        "facility": ["exact"],
        "process_type": ["exact"],
        "process_type__process": ["exact"],
        "process_type__sub_process_ref": ["exact"],
        "status": ["exact"],
        "lot_date": ["exact", "gte", "lte"],
    }
    search_fields = ["lot_number"]

    def get_queryset(self):
        self.queryset = lots_with_results()
        return super().get_queryset()

    def check_can_void(self, instance):
        if instance.status == ProcessingLot.Status.CLOSED:
            raise ValidationError(["A closed lot cannot be deleted."])

    @staticmethod
    def _actuals_map(rows):
        return {str(row["grade"]): row["actual_kg"] for row in rows}

    @extend_schema(request=LotCreateSerializer, responses=ProcessingLotSerializer)
    def create(self, request):
        data = LotCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        values = dict(data.validated_data)
        actuals = self._actuals_map(values.pop("actuals"))
        lot = create_lot(user=request.user, actuals=actuals, **values)
        lot = lots_with_results().get(pk=lot.pk)
        return Response(ProcessingLotSerializer(lot).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=LotActualsSerializer, responses=ProcessingLotSerializer)
    @action(detail=True, methods=["post"])
    def actuals(self, request, pk=None):
        lot = self.get_object()
        data = LotActualsSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        record_actuals(
            user=request.user, lot=lot, actuals=self._actuals_map(data.validated_data["actuals"])
        )
        return Response(ProcessingLotSerializer(lots_with_results().get(pk=lot.pk)).data)

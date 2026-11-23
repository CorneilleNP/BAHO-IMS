from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from baho.core.access import CWS_READ_ROLES, CWS_WRITE_ROLES
from baho.core.mixins import FacilityScopedViewSetMixin, VoidSerializer
from baho.core.permissions import HasAnyRole, RoleAccess

from ..models import CasualLaborer
from ..selectors import pay_periods_with_totals, period_attendance
from ..services import (
    CLOSE_ROLES,
    MARK_PAID_ROLES,
    close_pay_period,
    mark_pay_period_paid,
    open_pay_period,
    record_attendance,
    register_laborer,
    update_laborer,
    void_pay_period,
)
from .serializers import (
    AttendanceQuerySerializer,
    CasualLaborerSerializer,
    LaborAttendanceSerializer,
    LaborPayPeriodDetailSerializer,
    LaborPayPeriodSerializer,
    RecordAttendanceSerializer,
)


class CasualLaborerViewSet(
    FacilityScopedViewSetMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Casual laborers of your stations. No delete: PATCH `is_active=false` instead."""

    queryset = CasualLaborer.objects.select_related("facility")
    serializer_class = CasualLaborerSerializer
    permission_classes = [RoleAccess]
    read_roles = CWS_READ_ROLES
    write_roles = CWS_WRITE_ROLES
    http_method_names = ["get", "post", "patch", "head", "options"]
    filterset_fields = ["facility", "is_active"]
    search_fields = ["full_name", "national_id", "phone"]
    ordering_fields = ["full_name", "created_at"]

    def perform_create(self, serializer):
        data = dict(serializer.validated_data)
        serializer.instance = register_laborer(
            user=self.request.user, facility=data.pop("facility"), **data
        )

    def perform_update(self, serializer):
        serializer.instance = update_laborer(
            user=self.request.user, laborer=serializer.instance, **serializer.validated_data
        )


class LaborPayPeriodViewSet(
    FacilityScopedViewSetMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """Pay periods: OPEN (record attendance) -> CLOSED -> PAID.

    The detail view carries a per-laborer `summary` (days present, amount due).
    """

    permission_classes = [RoleAccess]
    read_roles = CWS_READ_ROLES
    write_roles = CWS_WRITE_ROLES
    filterset_fields = {
        "facility": ["exact"],
        "status": ["exact"],
        "period_start": ["gte", "lte"],
        "period_end": ["gte", "lte"],
    }
    ordering_fields = ["period_start", "created_at"]

    def get_queryset(self):
        self.queryset = pay_periods_with_totals()
        return super().get_queryset()

    def get_serializer_class(self):
        if self.action == "list":
            return LaborPayPeriodSerializer
        return LaborPayPeriodDetailSerializer

    def _detail(self, period, code=status.HTTP_200_OK):
        fresh = pay_periods_with_totals().get(pk=period.pk)
        return Response(LaborPayPeriodDetailSerializer(fresh).data, status=code)

    def create(self, request, *args, **kwargs):
        serializer = LaborPayPeriodSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        period = open_pay_period(user=request.user, **serializer.validated_data)
        return self._detail(period, status.HTTP_201_CREATED)

    @extend_schema(
        methods=["GET"],
        parameters=[AttendanceQuerySerializer],
        request=None,
        responses=LaborAttendanceSerializer(many=True),
    )
    @extend_schema(
        methods=["POST"],
        request=RecordAttendanceSerializer,
        responses=LaborPayPeriodDetailSerializer,
    )
    @action(detail=True, methods=["get", "post"])
    def attendance(self, request, pk=None):
        """GET: the period's attendance rows (`?work_date=` for one day).
        POST: the roll call for one day; resending a day updates it."""
        period = self.get_object()
        if request.method == "GET":
            query = AttendanceQuerySerializer(data=request.query_params)
            query.is_valid(raise_exception=True)
            rows = period_attendance(period, query.validated_data.get("work_date"))
            return Response(LaborAttendanceSerializer(rows, many=True).data)
        data = RecordAttendanceSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        record_attendance(user=request.user, pay_period=period, **data.validated_data)
        return self._detail(period)

    @extend_schema(request=None, responses=LaborPayPeriodDetailSerializer)
    @action(detail=True, methods=["post"], permission_classes=[HasAnyRole(*CLOSE_ROLES)])
    def close(self, request, pk=None):
        return self._detail(close_pay_period(user=request.user, pay_period=self.get_object()))

    @extend_schema(request=None, responses=LaborPayPeriodDetailSerializer)
    @action(
        detail=True,
        methods=["post"],
        url_path="mark-paid",
        permission_classes=[HasAnyRole(*MARK_PAID_ROLES)],
    )
    def mark_paid(self, request, pk=None):
        return self._detail(mark_pay_period_paid(user=request.user, pay_period=self.get_object()))

    @extend_schema(request=VoidSerializer, responses=VoidSerializer)
    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        """Soft-delete an OPEN period opened by mistake (with its attendance)."""
        data = VoidSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        period = void_pay_period(
            user=request.user, pay_period=self.get_object(), reason=data.validated_data["reason"]
        )
        return Response({"reason": period.void_reason})

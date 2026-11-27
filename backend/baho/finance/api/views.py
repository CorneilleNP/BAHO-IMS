from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from baho.core.access import (
    EXPENSE_WRITE_ROLES,
    FINANCE_ADMIN_ROLES,
    FINANCE_READ_ROLES,
    get_user_access,
)
from baho.core.mixins import FacilityScopedViewSetMixin, VoidActionMixin
from baho.core.permissions import RoleAccess

from ..models import Expense, ExpenseCategory, FundAllocation
from ..selectors import finance_ledger, finance_summary
from ..services import (
    create_allocation,
    create_expense,
    require_finance_admin,
    update_allocation,
    update_expense,
)
from .serializers import (
    ExpenseCategorySerializer,
    ExpenseSerializer,
    FinanceFilterSerializer,
    FundAllocationSerializer,
)

FILTER_PARAMS = [
    OpenApiParameter("station", OpenApiTypes.UUID, description="One CWS"),
    OpenApiParameter("date_from", OpenApiTypes.DATE),
    OpenApiParameter("date_to", OpenApiTypes.DATE),
]


class FinanceAccess:
    permission_classes = [RoleAccess]
    read_roles = FINANCE_READ_ROLES


class ExpenseCategoryViewSet(FinanceAccess, mixins.ListModelMixin, viewsets.GenericViewSet):
    """Expense categories (managed in Django admin)."""

    queryset = ExpenseCategory.objects.filter(is_active=True)
    serializer_class = ExpenseCategorySerializer
    write_roles = ()
    pagination_class = None


class FundAllocationViewSet(
    FinanceAccess,
    VoidActionMixin,
    FacilityScopedViewSetMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Funds given to a station by HQ (administrator / HQ finance only)."""

    queryset = FundAllocation.objects.select_related("facility", "created_by")
    serializer_class = FundAllocationSerializer
    write_roles = FINANCE_ADMIN_ROLES
    http_method_names = ["get", "post", "patch", "head", "options"]
    filterset_fields = {"facility": ["exact"], "allocated_on": ["exact", "gte", "lte"]}
    search_fields = ["allocation_number", "reference", "notes"]
    ordering_fields = ["allocated_on", "amount", "created_at"]

    def perform_create(self, serializer):
        serializer.instance = create_allocation(user=self.request.user, **serializer.validated_data)

    def perform_update(self, serializer):
        serializer.instance = update_allocation(
            user=self.request.user, allocation=serializer.instance, **serializer.validated_data
        )


class ExpenseViewSet(
    FinanceAccess,
    VoidActionMixin,
    FacilityScopedViewSetMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Station expenses. Managers record them for their station; once saved only
    an administrator / HQ finance may correct (PATCH) or delete (void) one."""

    queryset = Expense.objects.select_related("facility", "category", "created_by")
    serializer_class = ExpenseSerializer
    write_roles = EXPENSE_WRITE_ROLES
    http_method_names = ["get", "post", "patch", "head", "options"]
    filterset_fields = {
        "facility": ["exact"],
        "category": ["exact"],
        "spent_on": ["exact", "gte", "lte"],
    }
    search_fields = ["expense_number", "description", "paid_to", "reference"]
    ordering_fields = ["spent_on", "amount", "created_at"]

    def check_can_void(self, instance):
        require_finance_admin(self.request.user)

    def perform_create(self, serializer):
        serializer.instance = create_expense(user=self.request.user, **serializer.validated_data)

    def perform_update(self, serializer):
        serializer.instance = update_expense(
            user=self.request.user, expense=serializer.instance, **serializer.validated_data
        )


def _scope(request) -> tuple[frozenset | None, dict]:
    data = FinanceFilterSerializer(data=request.query_params)
    data.is_valid(raise_exception=True)
    access = get_user_access(request.user)
    return (None if access.is_global else access.facility_ids), data.validated_data


class FinanceSummaryView(FinanceAccess, APIView):
    """Finance dashboard: funds given vs spent (expenses, cherry payments, casual
    labor), balance per station (may be negative), by category and over time."""

    write_roles = ()

    @extend_schema(
        parameters=[
            *FILTER_PARAMS,
            OpenApiParameter("group", str, description="day | week | month (default month)"),
        ],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        facility_ids, f = _scope(request)
        return Response(
            finance_summary(
                facility_ids=facility_ids,
                station=f.get("station"),
                date_from=f.get("date_from"),
                date_to=f.get("date_to"),
                group=f.get("group") or "month",
            )
        )


class FinanceLedgerView(FinanceAccess, APIView):
    """Cash book for the finance report: every movement with a running balance."""

    write_roles = ()

    @extend_schema(parameters=FILTER_PARAMS, responses=OpenApiTypes.OBJECT)
    def get(self, request):
        facility_ids, f = _scope(request)
        return Response(
            finance_ledger(
                facility_ids=facility_ids,
                station=f.get("station"),
                date_from=f.get("date_from"),
                date_to=f.get("date_to"),
            )
        )

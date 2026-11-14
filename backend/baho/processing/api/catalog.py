"""API for the company-wide process catalogue (5 processes, their sub-processes)."""

from decimal import Decimal

from django.db.models import Count, DecimalField, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.response import Response

from baho.core.access import (
    CWS_READ_ROLES,
    DRYMILL_READ_ROLES,
    DRYMILL_WRITE_ROLES,
    get_user_access,
)
from baho.drymill.models import HqStockReceipt

from ..catalog import (
    add_alias,
    assign_sub_processes,
    create_sub_process,
    merge_sub_processes,
    rename_sub_process,
    set_sub_processes_active,
    suggest_process,
)
from ..models import Process, SubProcess

KG = DecimalField(max_digits=14, decimal_places=2)
READ_ROLES = tuple(set(CWS_READ_ROLES) | set(DRYMILL_READ_ROLES))


class CatalogAccess(BasePermission):
    """Everyone in CWS or dry mill can read; dry mill operators and admins manage it."""

    def has_permission(self, request, view):
        user = request.user
        if not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        roles = READ_ROLES if request.method in SAFE_METHODS else DRYMILL_WRITE_ROLES
        return get_user_access(user).has_any_role(*roles)


def _usage(queryset, path: str):
    """Annotate receipt count and net kg of non-voided stock receipts."""
    receipts = HqStockReceipt.objects.filter(**{path: OuterRef("pk")})
    count = receipts.values(path).annotate(n=Count("pk")).values("n")
    kg = receipts.values(path).annotate(t=Sum("net_weight_kg")).values("t")
    return queryset.annotate(
        receipts=Coalesce(Subquery(count), Value(0)),
        net_weight_kg=Coalesce(Subquery(kg, output_field=KG), Value(Decimal("0"), output_field=KG)),
    )


class ProcessSerializer(serializers.ModelSerializer):
    sub_processes = serializers.IntegerField(source="sub_process_count", read_only=True)
    receipts = serializers.IntegerField(read_only=True)
    net_weight_kg = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = Process
        fields = [
            "id",
            "code",
            "name",
            "display_order",
            "sub_processes",
            "receipts",
            "net_weight_kg",
        ]


class SubProcessSerializer(serializers.ModelSerializer):
    process_name = serializers.CharField(source="process.name", read_only=True, default="")
    aliases = serializers.SerializerMethodField()
    receipts = serializers.IntegerField(read_only=True, default=0)
    net_weight_kg = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True, default=Decimal("0")
    )
    suggested_process = serializers.SerializerMethodField()

    class Meta:
        model = SubProcess
        fields = [
            "id",
            "name",
            "process",
            "process_name",
            "suggested_process",
            "is_active",
            "aliases",
            "receipts",
            "net_weight_kg",
        ]

    def get_suggested_process(self, obj) -> dict | None:
        if obj.process_id:
            return None
        process = suggest_process(obj.name)
        return {"id": str(process.id), "name": process.name} if process else None

    def get_aliases(self, obj) -> list[str]:
        return [a.label for a in obj.aliases.all()]


class SelectionSerializer(serializers.Serializer):
    ids = serializers.PrimaryKeyRelatedField(
        queryset=SubProcess.objects.all(), many=True, allow_empty=False
    )


class AssignSerializer(SelectionSerializer):
    process = serializers.PrimaryKeyRelatedField(
        queryset=Process.objects.filter(is_active=True), allow_null=True
    )


class MergeSerializer(SelectionSerializer):
    into = serializers.PrimaryKeyRelatedField(queryset=SubProcess.objects.all())


class ActiveSerializer(SelectionSerializer):
    is_active = serializers.BooleanField()


class SubProcessWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120, required=False)
    process = serializers.PrimaryKeyRelatedField(
        queryset=Process.objects.filter(is_active=True), allow_null=True, required=False
    )
    is_active = serializers.BooleanField(required=False)
    alias = serializers.CharField(max_length=120, required=False, help_text="Add another spelling")


class ProcessViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """The five processes, with how many sub-processes / receipts / kg each has."""

    permission_classes = [CatalogAccess]
    serializer_class = ProcessSerializer
    pagination_class = None

    def get_queryset(self):
        qs = Process.objects.filter(is_active=True).annotate(
            sub_process_count=Count("sub_processes", filter=Q(sub_processes__is_active=True))
        )
        return _usage(qs, "process")


class SubProcessViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Sub-processes. `?process=<id>`, `?unassigned=true`, `?search=`, `?is_active=`."""

    permission_classes = [CatalogAccess]
    serializer_class = SubProcessSerializer
    pagination_class = None
    filter_backends = []

    def get_queryset(self):
        qs = SubProcess.objects.select_related("process").prefetch_related("aliases")
        params = self.request.query_params
        if params.get("process"):
            qs = qs.filter(process_id=params["process"])
        if params.get("unassigned") in ("true", "1"):
            qs = qs.filter(process__isnull=True)
        if params.get("is_active") in ("true", "false"):
            qs = qs.filter(is_active=params["is_active"] == "true")
        if params.get("search"):
            term = params["search"]
            qs = qs.filter(Q(name__icontains=term) | Q(aliases__label__icontains=term)).distinct()
        return _usage(qs, "sub_process").order_by("-receipts", "name")

    def _one(self, sub):
        return SubProcessSerializer(
            _usage(SubProcess.objects.filter(pk=sub.pk), "sub_process").get()
        ).data

    @extend_schema(request=SubProcessWriteSerializer, responses=SubProcessSerializer)
    def create(self, request):
        data = SubProcessWriteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        sub = create_sub_process(
            name=data.validated_data.get("name", ""), process=data.validated_data.get("process")
        )
        return Response(self._one(sub), status=status.HTTP_201_CREATED)

    @extend_schema(request=SubProcessWriteSerializer, responses=SubProcessSerializer)
    def partial_update(self, request, pk=None):
        """Rename, move to another process, (de)activate, or add a spelling alias."""
        sub = self.get_object()
        data = SubProcessWriteSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        if "name" in values:
            rename_sub_process(sub, values["name"])
        if "process" in values:
            assign_sub_processes(sub_processes=[sub], process=values["process"])
        if "is_active" in values:
            set_sub_processes_active(sub_processes=[sub], is_active=values["is_active"])
        if values.get("alias"):
            add_alias(sub, values["alias"])
        return Response(self._one(sub))

    @extend_schema(request=AssignSerializer)
    @action(detail=False, methods=["post"])
    def assign(self, request):
        """Assign the selected sub-processes (and their receipts) to a process."""
        data = AssignSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        count = assign_sub_processes(
            sub_processes=data.validated_data["ids"], process=data.validated_data["process"]
        )
        return Response({"updated": count})

    @extend_schema(request=MergeSerializer, responses=SubProcessSerializer)
    @action(detail=False, methods=["post"])
    def merge(self, request):
        """Merge duplicates into one sub-process; the others become its aliases."""
        data = MergeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        into = merge_sub_processes(
            sub_processes=data.validated_data["ids"], into=data.validated_data["into"]
        )
        return Response(self._one(into))

    @extend_schema(request=ActiveSerializer)
    @action(detail=False, methods=["post"])
    def activate(self, request):
        data = ActiveSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        count = set_sub_processes_active(
            sub_processes=data.validated_data["ids"], is_active=data.validated_data["is_active"]
        )
        return Response({"updated": count})

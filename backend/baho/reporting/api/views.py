from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from baho.core.access import DRYMILL_READ_ROLES
from baho.core.permissions import RoleAccess

from ..selectors import export_summary, processing_summary, stock_summary


class _Filters(serializers.Serializer):
    date = serializers.DateField(required=False)
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    process = serializers.CharField(required=False, allow_blank=True, default="")
    grade = serializers.CharField(required=False, allow_blank=True, default="")
    source = serializers.CharField(required=False, allow_blank=True, default="")
    process_product = serializers.CharField(required=False, allow_blank=True, default="")
    client = serializers.UUIDField(required=False, allow_null=True)
    export_grade = serializers.UUIDField(required=False, allow_null=True)


def _filters(request) -> dict:
    data = _Filters(data=request.query_params)
    data.is_valid(raise_exception=True)
    return data.validated_data


class DryMillReport(APIView):
    permission_classes = [RoleAccess]
    read_roles = DRYMILL_READ_ROLES
    write_roles = ()


class StockSummaryView(DryMillReport):
    """Stock Update dashboard: KPIs for one arrival date + season breakdowns."""

    @extend_schema(
        parameters=[
            OpenApiParameter("date", OpenApiTypes.DATE),
            OpenApiParameter("date_from", OpenApiTypes.DATE),
            OpenApiParameter("date_to", OpenApiTypes.DATE),
            OpenApiParameter("process", str),
            OpenApiParameter("grade", str),
        ],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        f = _filters(request)
        return Response(
            stock_summary(
                day=f.get("date"),
                process=f["process"],
                grade=f["grade"],
                date_from=f.get("date_from"),
                date_to=f.get("date_to"),
            )
        )


class ProcessingSummaryView(DryMillReport):
    """Parchment Processing dashboard: input, green output, out-turn, grades, sources."""

    @extend_schema(
        parameters=[
            OpenApiParameter("date_from", OpenApiTypes.DATE),
            OpenApiParameter("date_to", OpenApiTypes.DATE),
            OpenApiParameter("source", str),
            OpenApiParameter("process_product", str),
        ],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        f = _filters(request)
        return Response(
            processing_summary(
                date_from=f.get("date_from"),
                date_to=f.get("date_to"),
                source=f["source"],
                process_product=f["process_product"],
            )
        )


class ExportSummaryView(DryMillReport):
    """Export Updates dashboard: exported vs produced and balance per grade, by client."""

    @extend_schema(
        parameters=[
            OpenApiParameter("client", OpenApiTypes.UUID),
            OpenApiParameter("export_grade", OpenApiTypes.UUID),
            OpenApiParameter("process_product", str),
            OpenApiParameter("date_from", OpenApiTypes.DATE),
            OpenApiParameter("date_to", OpenApiTypes.DATE),
        ],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        f = _filters(request)
        return Response(
            export_summary(
                client=str(f["client"]) if f.get("client") else "",
                export_grade=str(f["export_grade"]) if f.get("export_grade") else "",
                process_product=f["process_product"],
                date_from=f.get("date_from"),
                date_to=f.get("date_to"),
            )
        )

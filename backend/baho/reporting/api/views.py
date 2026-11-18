from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from baho.core.access import CWS_READ_ROLES, DRYMILL_READ_ROLES, get_user_access
from baho.core.permissions import RoleAccess

from ..selectors import (
    cherry_summary,
    export_summary,
    lot_summary,
    processing_summary,
    recent_farmers,
    stock_summary,
    transfer_reconciliation_summary,
)


class _Filters(serializers.Serializer):
    date = serializers.DateField(required=False)
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    process = serializers.CharField(required=False, allow_blank=True, default="")
    sub_process = serializers.CharField(required=False, allow_blank=True, default="")
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
            OpenApiParameter("process", str, description="Process id, or 'none'"),
            OpenApiParameter("sub_process", str),
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
                sub_process=f["sub_process"],
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
            OpenApiParameter("process", str, description="Process id, or 'none'"),
            OpenApiParameter("sub_process", str),
            OpenApiParameter("grade", str),
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
                process=f["process"],
                sub_process=f["sub_process"],
                grade=f["grade"],
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
                process=f["process"],
                sub_process=f["sub_process"],
                source=f["source"],
                process_product=f["process_product"],
                date_from=f.get("date_from"),
                date_to=f.get("date_to"),
            )
        )


class CwsSummaryView(APIView):
    """Cherry Reception dashboard: total bought, good vs float, average cost per kg
    (including transport & commission), quantity by station, and recently registered
    farmers. Admin/HQ roles see every station; a CWS clerk sees their own."""

    permission_classes = [RoleAccess]
    read_roles = CWS_READ_ROLES
    write_roles = ()

    @extend_schema(
        parameters=[
            OpenApiParameter("date_from", OpenApiTypes.DATE),
            OpenApiParameter("date_to", OpenApiTypes.DATE),
        ],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        f = _filters(request)
        access = get_user_access(request.user)
        facility_ids = None if access.is_global else access.facility_ids
        summary = cherry_summary(
            facility_ids=facility_ids, date_from=f.get("date_from"), date_to=f.get("date_to")
        )
        summary["recent_farmers"] = recent_farmers(facility_ids=facility_ids)
        return Response(summary)


class LotSummaryView(APIView):
    """Processing Lots dashboard: cherry input, estimated vs actual, out-turn %,
    by grade / station / process. Admin/HQ roles see every station; a CWS clerk
    sees their own."""

    permission_classes = [RoleAccess]
    read_roles = CWS_READ_ROLES
    write_roles = ()

    @extend_schema(
        parameters=[
            OpenApiParameter("date_from", OpenApiTypes.DATE),
            OpenApiParameter("date_to", OpenApiTypes.DATE),
        ],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        f = _filters(request)
        access = get_user_access(request.user)
        facility_ids = None if access.is_global else access.facility_ids
        return Response(
            lot_summary(
                facility_ids=facility_ids, date_from=f.get("date_from"), date_to=f.get("date_to")
            )
        )


class TransferSummaryView(APIView):
    """CWS -> dry mill transfers dashboard: gross/bags/net weight and stock
    loss/gain from the blind double-entry reconciliation. Admin/HQ roles see
    every station; a CWS clerk sees their own."""

    permission_classes = [RoleAccess]
    read_roles = CWS_READ_ROLES + DRYMILL_READ_ROLES
    write_roles = ()

    @extend_schema(
        parameters=[
            OpenApiParameter("date_from", OpenApiTypes.DATE),
            OpenApiParameter("date_to", OpenApiTypes.DATE),
        ],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        f = _filters(request)
        access = get_user_access(request.user)
        facility_ids = None if access.is_global else access.facility_ids
        return Response(
            transfer_reconciliation_summary(
                facility_ids=facility_ids, date_from=f.get("date_from"), date_to=f.get("date_to")
            )
        )

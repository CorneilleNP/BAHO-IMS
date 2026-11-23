from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from baho.core.access import RoleCode
from baho.core.permissions import HasAnyRole

from ..cherry_receipts import import_cherry_receipts
from .serializers import CherryReceiptUploadSerializer


class CherryReceiptImportView(APIView):
    """Upload a CHERRY RECEIVED sheet (CSV). Dry run unless `commit` is true. ADMIN only."""

    permission_classes = [HasAnyRole(RoleCode.ADMIN)]
    parser_classes = [MultiPartParser, FormParser]

    @extend_schema(request=CherryReceiptUploadSerializer, responses=OpenApiTypes.OBJECT)
    def post(self, request):
        serializer = CherryReceiptUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        upload = data["file"]
        if not upload.name.lower().endswith(".csv"):
            raise ValidationError(
                {"file": ["Upload the CHERRY RECEIVED sheet saved as CSV (.csv)."]}
            )
        try:
            report = import_cherry_receipts(
                upload.read(),
                station_code=data["station"],
                user=request.user,
                commit=data["commit"],
                source_name=upload.name,
                header_rows=data["header_rows"],
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(report.as_dict())

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..selectors import trash_items, visible_trash_types
from ..trash import TRASH_TYPES_BY_CODE, retention_hours
from .serializers import TrashItemSerializer, TrashQuerySerializer


class TrashView(APIView):
    """Deleted records waiting for permanent removal (read-only).

    Lists every type the user's role can read; station users see only their
    own stations' records.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[
            OpenApiParameter("type", str, enum=list(TRASH_TYPES_BY_CODE)),
            OpenApiParameter("facility", OpenApiTypes.UUID),
        ],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        params = TrashQuerySerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        type_code = params.validated_data.get("type") or None
        if type_code and type_code not in TRASH_TYPES_BY_CODE:
            raise serializers.ValidationError({"type": ["Unknown type."]})
        rows = trash_items(
            user=request.user,
            type_code=type_code,
            facility_id=params.validated_data.get("facility"),
        )
        return Response(
            {
                "retention_hours": retention_hours(),
                "types": [
                    {"code": t.code, "label": t.label} for t in visible_trash_types(request.user)
                ],
                "count": len(rows),
                "results": TrashItemSerializer(rows, many=True).data,
            }
        )

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from baho.core.access import RoleCode
from baho.core.permissions import HasAnyRole

from ..selectors import sms_outbox
from ..services import queue_sms, retry_message
from .serializers import SendTestSmsSerializer, SmsMessageSerializer


class SmsMessageViewSet(viewsets.ReadOnlyModelViewSet):
    """SMS outbox (admins only). `?status=`, `?facility=`, `?reference_type=`,
    `?search=` matches phone; `retry` resends a failed message; `test` sends one."""

    serializer_class = SmsMessageSerializer
    permission_classes = [HasAnyRole(RoleCode.ADMIN)]
    filterset_fields = ["status", "facility", "reference_type", "reference_id"]
    search_fields = ["to_phone"]
    ordering_fields = ["created_at", "sent_at", "attempts"]

    def get_queryset(self):
        return sms_outbox()

    @action(detail=True, methods=["post"])
    def retry(self, request, pk=None):
        message = retry_message(self.get_object())
        return Response(self.get_serializer(message).data)

    @action(detail=False, methods=["post"], url_path="test", serializer_class=SendTestSmsSerializer)
    def send_test(self, request):
        payload = SendTestSmsSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        message = queue_sms(**payload.validated_data, user=request.user)
        message.refresh_from_db()  # sent already unless inside an outer transaction
        return Response(SmsMessageSerializer(message).data, status=status.HTTP_201_CREATED)

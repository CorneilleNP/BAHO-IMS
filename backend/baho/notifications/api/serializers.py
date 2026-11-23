from rest_framework import serializers

from ..models import SmsMessage
from ..services import SMS_MAX_LENGTH


class SmsMessageSerializer(serializers.ModelSerializer):
    facility_name = serializers.CharField(source="facility.name", read_only=True, default=None)
    created_by_email = serializers.EmailField(
        source="created_by.email", read_only=True, default=None
    )

    class Meta:
        model = SmsMessage
        fields = [
            "id",
            "to_phone",
            "body",
            "status",
            "provider",
            "provider_message_id",
            "error",
            "attempts",
            "sent_at",
            "facility",
            "facility_name",
            "reference_type",
            "reference_id",
            "created_by",
            "created_by_email",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class SendTestSmsSerializer(serializers.Serializer):
    to_phone = serializers.CharField(max_length=30)
    body = serializers.CharField(
        max_length=SMS_MAX_LENGTH,
        required=False,
        default="Baho Coffee IMS: test message. SMS notifications are working.",
    )

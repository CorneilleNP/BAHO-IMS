from rest_framework import serializers


class TrashItemSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    type = serializers.CharField()
    type_label = serializers.CharField()
    number = serializers.CharField()
    facility = serializers.UUIDField(allow_null=True)
    facility_name = serializers.CharField()
    deleted_by = serializers.CharField()
    deleted_at = serializers.DateTimeField()
    reason = serializers.CharField()
    purge_after = serializers.DateTimeField()


class TrashQuerySerializer(serializers.Serializer):
    type = serializers.CharField(required=False, allow_blank=True)
    facility = serializers.UUIDField(required=False)

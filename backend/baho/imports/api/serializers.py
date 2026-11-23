from rest_framework import serializers

MAX_UPLOAD_BYTES = 5 * 1024 * 1024


class CherryReceiptUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    station = serializers.CharField(max_length=20)
    commit = serializers.BooleanField(default=False)
    header_rows = serializers.IntegerField(default=4, min_value=0, max_value=50)

    def validate_file(self, value):
        if value.size > MAX_UPLOAD_BYTES:
            raise serializers.ValidationError("File too large (5 MB maximum).")
        return value

from django.contrib import admin

from .models import SmsMessage


@admin.register(SmsMessage)
class SmsMessageAdmin(admin.ModelAdmin):
    """Read-only outbox: messages are a delivery log, created only by the services."""

    list_display = ["created_at", "to_phone", "status", "attempts", "provider", "facility"]
    list_filter = ["status", "provider", "facility"]
    search_fields = ["to_phone", "body", "provider_message_id", "reference_id"]
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

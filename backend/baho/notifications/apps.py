from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    """SMS / email (later: mobile money)."""

    name = "baho.notifications"
    label = "notifications"
    verbose_name = "Notifications"

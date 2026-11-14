from django.apps import AppConfig


class CoreConfig(AppConfig):
    """Shared foundations: base models, access rules, permissions. No tables."""

    name = "baho.core"
    label = "core"
    verbose_name = "Core"

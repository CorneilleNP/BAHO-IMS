from django.apps import AppConfig


class FarmersConfig(AppConfig):
    """Farmer registry. Legacy: farmers (0001_core_schema.sql)."""

    name = "baho.farmers"
    label = "farmers"
    verbose_name = "Farmers"

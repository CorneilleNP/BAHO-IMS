from django.apps import AppConfig


class ReportingConfig(AppConfig):
    """Read-only reports: cost/kg, traceability, dashboards. Legacy: 0005_views.sql."""

    name = "baho.reporting"
    label = "reporting"
    verbose_name = "Reporting"

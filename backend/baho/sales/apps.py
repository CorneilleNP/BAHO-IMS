from django.apps import AppConfig


class SalesConfig(AppConfig):
    """Clients, export grades, shipments, commitments, milling services, PSS. Legacy: 0004."""

    name = "baho.sales"
    label = "sales"
    verbose_name = "Sales & export"

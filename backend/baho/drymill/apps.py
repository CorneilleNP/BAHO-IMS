from django.apps import AppConfig


class DrymillConfig(AppConfig):
    """Suppliers, HQ stock receipts, dry-mill batches. Legacy: 0004."""

    name = "baho.drymill"
    label = "drymill"
    verbose_name = "Dry mill"

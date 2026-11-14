from django.apps import AppConfig


class ProcessingConfig(AppConfig):
    """Process types/grades/ratios, lots, estimates, actuals. Legacy: 0003."""

    name = "baho.processing"
    label = "processing"
    verbose_name = "Processing"

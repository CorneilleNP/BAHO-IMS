from django.apps import AppConfig


class ReceptionConfig(AppConfig):
    """Cherry receipts (GRN), lines and payments. Legacy: 0002_reception_finance.sql."""

    name = "baho.reception"
    label = "reception"
    verbose_name = "Reception"

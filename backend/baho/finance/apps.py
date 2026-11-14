from django.apps import AppConfig


class FinanceConfig(AppConfig):
    """Cash ledger, expense categories/receipts, bank transfers. Legacy: 0002."""

    name = "baho.finance"
    label = "finance"
    verbose_name = "Finance"

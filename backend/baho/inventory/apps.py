from django.apps import AppConfig


class InventoryConfig(AppConfig):
    """Unified signed stock ledger + CWS->HQ transfers. Legacy: stock_movements (0003)."""

    name = "baho.inventory"
    label = "inventory"
    verbose_name = "Inventory"

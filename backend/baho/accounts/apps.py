from django.apps import AppConfig


class AccountsConfig(AppConfig):
    """Users, roles, user-role assignments per facility, JWT login."""

    name = "baho.accounts"
    label = "accounts"
    verbose_name = "Accounts"

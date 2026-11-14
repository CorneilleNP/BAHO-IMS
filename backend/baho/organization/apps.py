from django.apps import AppConfig


class OrganizationConfig(AppConfig):
    """Crop years, facilities (CWS + HQ dry mill), Rwanda admin units."""

    name = "baho.organization"
    label = "organization"
    verbose_name = "Organization"

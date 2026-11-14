from django.apps import AppConfig


class ImportsConfig(AppConfig):
    """Excel workbook import -> staging -> upsert. Legacy: legacy/excel_migration."""

    name = "baho.imports"
    label = "imports"
    verbose_name = "Imports"

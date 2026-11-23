"""Excel workbook import -> staging -> upsert. Legacy: legacy/excel_migration."""

from django.conf import settings
from django.db import models

from baho.core.models import TimeStampedModel


class CherryReceiptImport(TimeStampedModel):
    """One sheet row of a historical cherry reception workbook that became a GRN.

    `import_key` is a hash of the row's content (station, date, farmer, sheet GRN,
    quantities, n-th identical row), so re-running the import - even from a renamed
    or re-sorted file - never creates the GRN twice. File/row are kept for tracing.
    Voided GRNs keep their record (not imported again); only a hard delete (dev
    reset_dev_data) removes it, through the cascade.
    """

    import_key = models.CharField(max_length=64, unique=True)
    station = models.ForeignKey("organization.Facility", on_delete=models.PROTECT, related_name="+")
    receipt = models.OneToOneField(
        "reception.CherryReceipt", on_delete=models.CASCADE, related_name="import_record"
    )
    source_file = models.CharField(max_length=255)
    source_row = models.PositiveIntegerField()
    source_grn = models.CharField(max_length=40, blank=True)
    imported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta(TimeStampedModel.Meta):
        indexes = [models.Index(fields=["station", "source_grn"])]

    def __str__(self):
        return f"{self.source_file} row {self.source_row} -> {self.receipt_id}"

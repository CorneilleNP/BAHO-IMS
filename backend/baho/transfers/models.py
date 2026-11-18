"""CWS -> HQ dry mill parchment transfers: blind double-entry reconciliation.

One delivery note can carry several process/sub-process/grade combinations in
the same truck (a `CwsTransferLine` each), each weighed in one or more scale
readings. Each line is weighed and recorded twice, independently: once by the
CWS that loaded the truck (`CwsTransferLine`), and once by HQ dry mill when it
arrives (`DryMillTransferReceiptLine`), from its own scale readings. Dry mill
cannot see the CWS's numbers until it confirms its own - that is the whole
point of recording it twice, so neither side can agree on a number before
weighing. Once confirmed, dry mill's numbers are locked unless explicitly
unlocked (see `unlocked_by`/`unlocked_at` on the receipt).
"""

from django.db import models
from django.db.models import F, Q

from baho.core.models import AuditedModel, TimeStampedModel


class CwsTransfer(AuditedModel):
    """A CWS's own record of one delivery note sent to dry mill. May carry
    several process/sub-process/grade lines in the one truck."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        SUBMITTED = "SUBMITTED", "Submitted"

    delivery_note_no = models.CharField(
        max_length=60, unique=True, help_text="As printed on the paper delivery note."
    )
    facility = models.ForeignKey(
        "organization.Facility", on_delete=models.PROTECT, related_name="transfers"
    )
    crop_year = models.ForeignKey("organization.CropYear", on_delete=models.PROTECT)
    transfer_date = models.DateField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    notes = models.TextField(blank=True)

    class Meta(AuditedModel.Meta):
        ordering = ["-transfer_date", "-created_at"]
        indexes = [models.Index(fields=["facility", "transfer_date"])]

    def __str__(self):
        return self.delivery_note_no


class CwsTransferLine(TimeStampedModel):
    """One process/sub-process/grade on a delivery note, with its own bags and
    weight (summed from its weighings)."""

    transfer = models.ForeignKey(CwsTransfer, on_delete=models.CASCADE, related_name="lines")
    process = models.ForeignKey("processing.Process", on_delete=models.PROTECT, related_name="+")
    sub_process = models.ForeignKey(
        "processing.SubProcess", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    grade = models.ForeignKey("processing.ProcessGrade", on_delete=models.PROTECT, related_name="+")
    moisture_content_pct = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True
    )
    number_of_bags = models.PositiveIntegerField(default=0)
    gross_weight_kg = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    weight_of_bags_kg = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    net_weight_kg = models.GeneratedField(
        expression=F("gross_weight_kg") - F("weight_of_bags_kg"),
        output_field=models.DecimalField(max_digits=12, decimal_places=2),
        db_persist=True,
    )

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["transfer", "process", "sub_process", "grade"],
                name="cws_transfer_line_unique_combo",
            ),
            models.CheckConstraint(
                condition=Q(weight_of_bags_kg__gte=0)
                & Q(weight_of_bags_kg__lte=F("gross_weight_kg")),
                name="cws_transfer_line_weights_valid",
            ),
        ]

    def __str__(self):
        return f"{self.transfer.delivery_note_no} / {self.grade.code}"


class CwsTransferWeighing(TimeStampedModel):
    """One scale reading that makes up a line's totals (a truck loaded in batches:
    "weighing 1: 10 bags, 100kg", "weighing 2: 10 bags, 300kg", summed on the line)."""

    line = models.ForeignKey(CwsTransferLine, on_delete=models.CASCADE, related_name="weighings")
    bags = models.PositiveIntegerField()
    weight_kg = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.CheckConstraint(
                condition=Q(bags__gt=0) & Q(weight_kg__gt=0), name="cws_weighing_positive"
            ),
        ]


class DryMillTransferReceipt(AuditedModel):
    """HQ dry mill's own, independent record of the same delivery note: each
    line filled in blind, before the CWS's numbers are shown, then the whole
    receipt confirmed at once - revealing the variance, line by line."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending weighing"
        LOCKED = "LOCKED", "Weighing locked, reviewing variance"
        CONFIRMED = "CONFIRMED", "Confirmed"

    transfer = models.OneToOneField(
        CwsTransfer, on_delete=models.PROTECT, related_name="dry_mill_receipt"
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    comment = models.TextField(blank=True)
    confirmed_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    confirmed_at = models.DateTimeField(null=True, blank=True)
    unlocked_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    unlocked_at = models.DateTimeField(null=True, blank=True)

    class Meta(AuditedModel.Meta):
        ordering = ["-created_at"]

    @property
    def is_locked(self) -> bool:
        """Weighing numbers can't be edited once locked (reviewing variance) or
        confirmed, unless an admin unlocked them."""
        return self.status != self.Status.PENDING and self.unlocked_at is None

    def __str__(self):
        return f"Receipt of {self.transfer.delivery_note_no}"


class DryMillTransferReceiptLine(AuditedModel):
    """Dry mill's own weighing of one of the CWS's lines - entered blind,
    independently of the CWS's figures for the same process/sub-process/grade."""

    class VarianceStatus(models.TextChoices):
        MATCH = "MATCH", "Matches"
        STOCK_LOSS = "STOCK_LOSS", "Stock loss"
        STOCK_GAIN = "STOCK_GAIN", "Stock gain"

    receipt = models.ForeignKey(
        DryMillTransferReceipt, on_delete=models.CASCADE, related_name="lines"
    )
    cws_line = models.OneToOneField(
        CwsTransferLine, on_delete=models.PROTECT, related_name="dry_mill_line"
    )
    moisture_content_pct = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True
    )
    number_of_bags = models.PositiveIntegerField(default=0)
    gross_weight_kg = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    weight_of_bags_kg = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    net_weight_kg = models.GeneratedField(
        expression=F("gross_weight_kg") - F("weight_of_bags_kg"),
        output_field=models.DecimalField(max_digits=12, decimal_places=2),
        db_persist=True,
    )
    variance_status = models.CharField(max_length=12, choices=VarianceStatus.choices, blank=True)
    stock_receipt = models.OneToOneField(
        "drymill.HqStockReceipt",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="transfer_line",
    )

    class Meta(AuditedModel.Meta):
        ordering = ["created_at"]
        constraints = [
            models.CheckConstraint(
                condition=Q(weight_of_bags_kg__gte=0)
                & Q(weight_of_bags_kg__lte=F("gross_weight_kg")),
                name="dm_transfer_line_weights_valid",
            ),
        ]

    @property
    def variance_kg(self):
        """CWS's claimed net weight minus what dry mill actually weighed for this line.

        Positive = dry mill weighed less than the CWS claimed (stock loss).
        Negative = dry mill weighed more than the CWS claimed (stock gain).
        """
        return self.cws_line.net_weight_kg - self.net_weight_kg

    def __str__(self):
        return f"{self.receipt.transfer.delivery_note_no} / {self.cws_line.grade.code}"


class DryMillTransferWeighing(TimeStampedModel):
    """One of dry mill's own scale readings for this line - entered blind,
    independently of the CWS's weighings on the same delivery."""

    line = models.ForeignKey(
        DryMillTransferReceiptLine, on_delete=models.CASCADE, related_name="weighings"
    )
    bags = models.PositiveIntegerField()
    weight_kg = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.CheckConstraint(
                condition=Q(bags__gt=0) & Q(weight_kg__gt=0), name="dm_weighing_positive"
            ),
        ]

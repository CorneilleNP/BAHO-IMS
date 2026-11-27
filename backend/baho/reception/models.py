"""Cherry receipts (GRN) and their Good/Float lines. Legacy: 0002_reception_finance.sql."""

from django.db import models
from django.db.models import F, Q

from baho.core.models import AuditedModel, TimeStampedModel


class CherryReceipt(AuditedModel):
    class PaymentMethod(models.TextChoices):
        CASH = "CASH", "Cash"
        BANK = "BANK", "Bank"
        MOBILE_MONEY = "MOBILE_MONEY", "Mobile money"

    class PaymentStatus(models.TextChoices):
        UNPAID = "UNPAID", "Not paid"
        PARTIAL = "PARTIAL", "Partially paid"
        PAID = "PAID", "Paid"

    grn_number = models.CharField(max_length=40, unique=True, editable=False)
    facility = models.ForeignKey(
        "organization.Facility", on_delete=models.PROTECT, related_name="cherry_receipts"
    )
    farmer = models.ForeignKey(
        "farmers.Farmer", on_delete=models.PROTECT, related_name="cherry_receipts"
    )
    crop_year = models.ForeignKey(
        "organization.CropYear", on_delete=models.PROTECT, related_name="cherry_receipts"
    )
    received_on = models.DateField()
    payment_method = models.CharField(max_length=20, choices=PaymentMethod.choices, blank=True)
    # Derived from the GRN total and its payments (see services.refresh_payment);
    # never set directly. The method is the one of the latest payment.
    payment_status = models.CharField(
        max_length=10, choices=PaymentStatus.choices, default=PaymentStatus.UNPAID
    )
    amount_paid = models.DecimalField(
        max_digits=16,
        decimal_places=2,
        default=0,
        help_text="Sum of the GRN's live payments (CherryPayment).",
    )
    notes = models.TextField(blank=True)

    class Meta(AuditedModel.Meta):
        ordering = ["-received_on", "-created_at"]
        indexes = [models.Index(fields=["facility", "received_on"])]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount_paid__gte=0), name="receipt_amount_paid_non_negative"
            ),
        ]

    def __str__(self):
        return self.grn_number


class CherryReceiptLine(TimeStampedModel):
    class Grade(models.TextChoices):
        GOOD = "GOOD", "Good cherry"
        FLOAT = "FLOAT", "Float cherry"

    receipt = models.ForeignKey(CherryReceipt, on_delete=models.CASCADE, related_name="lines")
    cherry_grade = models.CharField(max_length=10, choices=Grade.choices)
    quantity_kg = models.DecimalField(max_digits=10, decimal_places=2)
    price_per_kg = models.DecimalField(max_digits=10, decimal_places=2)
    transport_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    commission = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    line_amount = models.GeneratedField(
        expression=F("quantity_kg") * F("price_per_kg"),
        output_field=models.DecimalField(max_digits=14, decimal_places=2),
        db_persist=True,
    )

    class Meta:
        ordering = ["cherry_grade"]
        constraints = [
            models.UniqueConstraint(
                fields=["receipt", "cherry_grade"], name="receipt_line_one_per_grade"
            ),
            models.CheckConstraint(
                condition=Q(quantity_kg__gt=0)
                & Q(price_per_kg__gte=0)
                & Q(transport_cost__gte=0)
                & Q(commission__gte=0),
                name="receipt_line_non_negative",
            ),
        ]


class CherryPayment(AuditedModel):
    """Money paid to the farmer for one GRN. A GRN can be paid in several parts;
    each payment is a cash outflow of its station on `paid_on` (finance)."""

    receipt = models.ForeignKey(CherryReceipt, on_delete=models.PROTECT, related_name="payments")
    paid_on = models.DateField()
    amount = models.DecimalField(max_digits=16, decimal_places=2)
    method = models.CharField(max_length=20, choices=CherryReceipt.PaymentMethod.choices)
    reference = models.CharField(max_length=100, blank=True, help_text="Bank / MoMo reference.")
    notes = models.TextField(blank=True)

    class Meta(AuditedModel.Meta):
        ordering = ["paid_on", "created_at"]
        indexes = [models.Index(fields=["paid_on"])]
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name="cherry_payment_positive"),
        ]

    def __str__(self):
        return f"{self.receipt.grn_number} {self.amount} on {self.paid_on}"

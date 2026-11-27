"""Station finance: money given to each CWS and what it is spent on.

The balance of a station = funds given (FundAllocation) minus everything it paid
out: expenses (Expense), payments to farmers for cherry (reception.CherryPayment)
and casual labor pay periods marked paid (labor). It may go negative when a
station spends more than it was given.
"""

from django.db import models
from django.db.models import Q

from baho.core.models import AuditedModel, TimeStampedModel


class ExpenseCategory(TimeStampedModel):
    """Manpower, Wages, Transport services… (managed in Django admin)."""

    code = models.CharField(max_length=40, unique=True)
    name = models.CharField(max_length=100)
    description = models.CharField(
        max_length=255, blank=True, help_text="What goes in it; shown as a hint when recording."
    )
    display_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta(TimeStampedModel.Meta):
        ordering = ["display_order", "name"]
        verbose_name_plural = "expense categories"

    def __str__(self):
        return self.name


class FundAllocation(AuditedModel):
    """Money HQ gives a station (e.g. 200,000,000 RWF for the season)."""

    allocation_number = models.CharField(max_length=40, unique=True, editable=False)
    facility = models.ForeignKey(
        "organization.Facility", on_delete=models.PROTECT, related_name="fund_allocations"
    )
    allocated_on = models.DateField()
    amount = models.DecimalField(max_digits=16, decimal_places=2)
    reference = models.CharField(max_length=100, blank=True, help_text="Bank transfer reference.")
    notes = models.TextField(blank=True)

    class Meta(AuditedModel.Meta):
        ordering = ["-allocated_on", "-created_at"]
        indexes = [models.Index(fields=["facility", "allocated_on"])]
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name="allocation_positive"),
        ]

    def __str__(self):
        return self.allocation_number


class Expense(AuditedModel):
    """One spending at a station, with why it was spent. Quantity / unit / unit
    price are optional (fuel in litres, bags in pieces…)."""

    expense_number = models.CharField(max_length=40, unique=True, editable=False)
    facility = models.ForeignKey(
        "organization.Facility", on_delete=models.PROTECT, related_name="expenses"
    )
    category = models.ForeignKey(ExpenseCategory, on_delete=models.PROTECT, related_name="+")
    spent_on = models.DateField()
    amount = models.DecimalField(max_digits=16, decimal_places=2)
    description = models.TextField(help_text="What the money was for (justification).")
    quantity = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    unit = models.CharField(max_length=20, blank=True, help_text="litres, kg, pieces, days…")
    unit_price = models.DecimalField(max_digits=16, decimal_places=2, null=True, blank=True)
    paid_to = models.CharField(max_length=150, blank=True, help_text="Supplier / person paid.")
    reference = models.CharField(max_length=100, blank=True, help_text="Receipt / invoice no.")

    class Meta(AuditedModel.Meta):
        ordering = ["-spent_on", "-created_at"]
        indexes = [models.Index(fields=["facility", "spent_on"])]
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name="expense_positive"),
            models.CheckConstraint(
                condition=(Q(quantity__isnull=True) | Q(quantity__gt=0))
                & (Q(unit_price__isnull=True) | Q(unit_price__gte=0)),
                name="expense_quantity_price_valid",
            ),
        ]

    def __str__(self):
        return self.expense_number

"""Write operations for station finance. Every write is one transaction.

- Funds are given to a station by ADMIN / HQ_FINANCE only.
- Expenses are recorded by the station's manager (or HQ); once saved, only
  ADMIN / HQ_FINANCE may correct or delete them (same rule as GRNs).
"""

from decimal import Decimal

from django.db import transaction
from rest_framework.exceptions import PermissionDenied, ValidationError

from baho.core.access import FINANCE_ADMIN_ROLES, get_user_access
from baho.core.numbering import next_sequence
from baho.core.permissions import ensure_facility_access
from baho.organization.models import Facility

from .models import Expense, FundAllocation

CENT = Decimal("0.01")
ENTRY_LOCKED = (
    "A saved finance entry can only be changed or deleted by an administrator or HQ finance."
)


def is_finance_admin(user) -> bool:
    return user.is_superuser or get_user_access(user).has_any_role(*FINANCE_ADMIN_ROLES)


def require_finance_admin(user, message: str = ENTRY_LOCKED) -> None:
    if not is_finance_admin(user):
        raise PermissionDenied(message)


def _require_cws(facility: Facility) -> None:
    if facility.facility_type != Facility.FacilityType.CWS:
        raise ValidationError({"facility": ["Choose a CWS station."]})


def _check_quantity(quantity, unit_price, unit) -> None:
    if (unit_price is not None or unit) and quantity is None:
        raise ValidationError({"quantity": ["Enter the quantity for this unit / unit price."]})


@transaction.atomic
def create_allocation(*, user, facility, allocated_on, amount, reference="", notes=""):
    require_finance_admin(user, "Only an administrator or HQ finance can give funds to a station.")
    _require_cws(facility)
    number = next_sequence(f"fund:{facility.code}:{allocated_on.year}")
    return FundAllocation.objects.create(
        allocation_number=f"FUND-{facility.code}-{allocated_on.year}-{number:04d}",
        facility=facility,
        allocated_on=allocated_on,
        amount=Decimal(amount).quantize(CENT),
        reference=reference,
        notes=notes,
        created_by=user,
        updated_by=user,
    )


@transaction.atomic
def update_allocation(*, user, allocation: FundAllocation, **changes) -> FundAllocation:
    require_finance_admin(user)
    if "facility" in changes:
        _require_cws(changes["facility"])
    for field, value in changes.items():
        setattr(allocation, field, value)
    allocation.updated_by = user
    allocation.save()
    return allocation


@transaction.atomic
def create_expense(
    *,
    user,
    facility,
    category,
    spent_on,
    amount,
    description,
    quantity=None,
    unit="",
    unit_price=None,
    paid_to="",
    reference="",
) -> Expense:
    ensure_facility_access(user, facility)
    _require_cws(facility)
    if not category.is_active:
        raise ValidationError({"category": ["This category is no longer used."]})
    if not (description or "").strip():
        raise ValidationError({"description": ["Say what the money was for."]})
    _check_quantity(quantity, unit_price, unit)
    number = next_sequence(f"expense:{facility.code}:{spent_on.year}")
    return Expense.objects.create(
        expense_number=f"EXP-{facility.code}-{spent_on.year}-{number:05d}",
        facility=facility,
        category=category,
        spent_on=spent_on,
        amount=Decimal(amount).quantize(CENT),
        description=description.strip(),
        quantity=quantity,
        unit=unit,
        unit_price=unit_price,
        paid_to=paid_to,
        reference=reference,
        created_by=user,
        updated_by=user,
    )


@transaction.atomic
def update_expense(*, user, expense: Expense, **changes) -> Expense:
    require_finance_admin(user)
    if "facility" in changes:
        ensure_facility_access(user, changes["facility"])
        _require_cws(changes["facility"])
    for field, value in changes.items():
        setattr(expense, field, value)
    if not expense.description.strip():
        raise ValidationError({"description": ["Say what the money was for."]})
    _check_quantity(expense.quantity, expense.unit_price, expense.unit)
    expense.updated_by = user
    expense.save()
    return expense

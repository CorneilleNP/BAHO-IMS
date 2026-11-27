"""Read side of station finance: balances, spending breakdowns and the ledger.

Money out of a station comes from three places:
- expenses (finance.Expense, by category, on `spent_on`);
- payments to farmers for cherry (reception.CherryPayment, on `paid_on`);
- casual labor pay periods marked paid (labor.LaborPayPeriod, on the day paid;
  amount = the rates of the days present).
Money in is the funds HQ gave the station (finance.FundAllocation).
Balance = in - out, and may be negative.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import DecimalField, F, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from baho.labor.models import LaborAttendance, LaborPayPeriod
from baho.organization.models import Facility
from baho.reception.models import CherryPayment, CherryReceipt, CherryReceiptLine

from .models import Expense, ExpenseCategory, FundAllocation

ZERO = Decimal("0")
MONEY = DecimalField(max_digits=18, decimal_places=2)

CHERRY = "Cherry purchase (payments to farmers)"
LABOR = "Casual labor (pay periods paid)"


@dataclass
class Entry:
    """One line of a station's cash book."""

    day: date
    kind: str  # ALLOCATION | EXPENSE | CHERRY | LABOR
    number: str
    facility_id: str
    facility_name: str
    category: str
    description: str
    money_in: Decimal = ZERO
    money_out: Decimal = ZERO
    quantity: Decimal | None = None
    unit: str = ""
    unit_price: Decimal | None = None
    paid_to: str = ""
    reference: str = ""
    recorded_by: str = ""

    def as_dict(self, balance: Decimal | None = None) -> dict:
        row = {
            "date": self.day,
            "kind": self.kind,
            "number": self.number,
            "facility": self.facility_id,
            "facility_name": self.facility_name,
            "category": self.category,
            "description": self.description,
            "money_in": self.money_in,
            "money_out": self.money_out,
            "quantity": self.quantity,
            "unit": self.unit,
            "unit_price": self.unit_price,
            "paid_to": self.paid_to,
            "reference": self.reference,
            "recorded_by": self.recorded_by,
        }
        if balance is not None:
            row["balance"] = balance
        return row


def scoped_stations(*, facility_ids: frozenset | None, station=None):
    """CWS stations the user may see (`facility_ids=None`: all), narrowed to one."""
    qs = Facility.objects.filter(facility_type=Facility.FacilityType.CWS)
    if facility_ids is not None:
        qs = qs.filter(id__in=facility_ids)
    if station:
        qs = qs.filter(id=station)
    return qs


def _range(qs, field: str, date_from: date | None, date_to: date | None):
    if date_from:
        qs = qs.filter(**{f"{field}__gte": date_from})
    if date_to:
        qs = qs.filter(**{f"{field}__lte": date_to})
    return qs


def _labor_periods(station_ids):
    return LaborPayPeriod.objects.filter(
        facility_id__in=station_ids, status=LaborPayPeriod.Status.PAID, paid_at__isnull=False
    )


def _labor_amounts(periods) -> dict:
    """Pay period id -> amount paid (sum of present days' rates)."""
    return {
        row["pay_period_id"]: row["total"]
        for row in LaborAttendance.objects.filter(pay_period__in=periods, present=True)
        .values("pay_period_id")
        .annotate(total=Coalesce(Sum("daily_rate_applied"), ZERO, output_field=MONEY))
    }


def entries(station_ids, date_from: date | None, date_to: date | None) -> list[Entry]:
    """Every money movement of these stations in the period, oldest first."""
    rows: list[Entry] = []

    for a in _range(
        FundAllocation.objects.filter(facility_id__in=station_ids).select_related(
            "facility", "created_by"
        ),
        "allocated_on",
        date_from,
        date_to,
    ):
        rows.append(
            Entry(
                day=a.allocated_on,
                kind="ALLOCATION",
                number=a.allocation_number,
                facility_id=str(a.facility_id),
                facility_name=a.facility.name,
                category="Funds received",
                description=a.notes or "Funds from HQ",
                money_in=a.amount,
                reference=a.reference,
                recorded_by=a.created_by.full_name if a.created_by else "",
            )
        )

    for e in _range(
        Expense.objects.filter(facility_id__in=station_ids).select_related(
            "facility", "category", "created_by"
        ),
        "spent_on",
        date_from,
        date_to,
    ):
        rows.append(
            Entry(
                day=e.spent_on,
                kind="EXPENSE",
                number=e.expense_number,
                facility_id=str(e.facility_id),
                facility_name=e.facility.name,
                category=e.category.name,
                description=e.description,
                money_out=e.amount,
                quantity=e.quantity,
                unit=e.unit,
                unit_price=e.unit_price,
                paid_to=e.paid_to,
                reference=e.reference,
                recorded_by=e.created_by.full_name if e.created_by else "",
            )
        )

    for p in _range(
        CherryPayment.objects.filter(
            receipt__facility_id__in=station_ids, receipt__is_deleted=False
        ).select_related("receipt", "receipt__facility", "receipt__farmer", "created_by"),
        "paid_on",
        date_from,
        date_to,
    ):
        rows.append(
            Entry(
                day=p.paid_on,
                kind="CHERRY",
                number=p.receipt.grn_number,
                facility_id=str(p.receipt.facility_id),
                facility_name=p.receipt.facility.name,
                category=CHERRY,
                description=f"Cherry GRN {p.receipt.grn_number} ({p.get_method_display()})",
                money_out=p.amount,
                paid_to=p.receipt.farmer.full_name,
                reference=p.reference,
                recorded_by=p.created_by.full_name if p.created_by else "",
            )
        )

    periods = _labor_periods(station_ids).select_related("facility", "paid_by")
    if date_from:
        periods = periods.filter(paid_at__date__gte=date_from)
    if date_to:
        periods = periods.filter(paid_at__date__lte=date_to)
    amounts = _labor_amounts(periods)
    for period in periods:
        amount = amounts.get(period.id, ZERO)
        if not amount:
            continue
        rows.append(
            Entry(
                day=timezone.localdate(period.paid_at),
                kind="LABOR",
                number=f"LABOR {period.period_start:%d/%m}-{period.period_end:%d/%m/%Y}",
                facility_id=str(period.facility_id),
                facility_name=period.facility.name,
                category=LABOR,
                description=(
                    f"Casual labor {period.period_start:%d %b} - {period.period_end:%d %b %Y}"
                ),
                money_out=amount,
                recorded_by=period.paid_by.full_name if period.paid_by else "",
            )
        )

    order = {"ALLOCATION": 0, "EXPENSE": 1, "CHERRY": 2, "LABOR": 3}
    rows.sort(key=lambda r: (r.day, order[r.kind], r.number))
    return rows


def _totals_before(station_ids, day: date) -> tuple[Decimal, Decimal]:
    """(money in, money out) strictly before `day` (the opening balance)."""
    end = day - timedelta(days=1)
    past = entries(station_ids, None, end)
    return sum((e.money_in for e in past), ZERO), sum((e.money_out for e in past), ZERO)


def _bucket(day: date, group: str) -> date:
    if group == "month":
        return day.replace(day=1)
    if group == "week":
        return day - timedelta(days=day.weekday())
    return day


def owed_to_farmers(station_ids, date_to: date | None = None) -> Decimal:
    """What is still owed on GRNs received up to `date_to` (not cash spent yet)."""
    receipts = CherryReceipt.objects.filter(facility_id__in=station_ids)
    if date_to:
        receipts = receipts.filter(received_on__lte=date_to)
    total = CherryReceiptLine.objects.filter(receipt__in=receipts).aggregate(
        v=Coalesce(
            Sum(F("line_amount") + F("transport_cost") + F("commission")), ZERO, output_field=MONEY
        )
    )["v"]
    paid = receipts.aggregate(v=Coalesce(Sum("amount_paid"), ZERO, output_field=MONEY))["v"]
    return total - paid


def finance_summary(
    *,
    facility_ids: frozenset | None,
    station=None,
    date_from: date | None = None,
    date_to: date | None = None,
    group: str = "month",
) -> dict:
    """Finance dashboard: funds given vs spent, balance (may be negative), spending
    by category / source / station, and over time (day, week or month)."""
    stations = list(scoped_stations(facility_ids=facility_ids, station=station))
    ids = [s.id for s in stations]
    rows = entries(ids, date_from, date_to)
    opening_in, opening_out = _totals_before(ids, date_from) if date_from else (ZERO, ZERO)

    def total(kind: str) -> Decimal:
        return sum((r.money_out for r in rows if r.kind == kind), ZERO)

    allocated = sum((r.money_in for r in rows), ZERO)
    spent = sum((r.money_out for r in rows), ZERO)
    opening = opening_in - opening_out

    by_category: dict[str, Decimal] = defaultdict(lambda: ZERO)
    for r in rows:
        if r.money_out:
            by_category[r.category] += r.money_out
    categories = {c.name for c in ExpenseCategory.objects.filter(is_active=True)}

    by_station = []
    for s in stations:
        mine = [r for r in rows if r.facility_id == str(s.id)]
        s_open_in, s_open_out = _totals_before([s.id], date_from) if date_from else (ZERO, ZERO)
        s_in = sum((r.money_in for r in mine), ZERO)
        s_out = sum((r.money_out for r in mine), ZERO)
        by_station.append(
            {
                "facility": str(s.id),
                "label": s.name,
                "opening_balance": s_open_in - s_open_out,
                "allocated": s_in,
                "expenses": sum((r.money_out for r in mine if r.kind == "EXPENSE"), ZERO),
                "cherry_paid": sum((r.money_out for r in mine if r.kind == "CHERRY"), ZERO),
                "labor_paid": sum((r.money_out for r in mine if r.kind == "LABOR"), ZERO),
                "spent": s_out,
                "balance": s_open_in - s_open_out + s_in - s_out,
                "owed_to_farmers": owed_to_farmers([s.id], date_to),
            }
        )

    timeline: dict[date, dict] = {}
    for r in rows:
        key = _bucket(r.day, group)
        point = timeline.setdefault(
            key, {"period": key, "allocated": ZERO, "expenses": ZERO, "cherry": ZERO, "labor": ZERO}
        )
        if r.kind == "ALLOCATION":
            point["allocated"] += r.money_in
        elif r.kind == "EXPENSE":
            point["expenses"] += r.money_out
        elif r.kind == "CHERRY":
            point["cherry"] += r.money_out
        else:
            point["labor"] += r.money_out
    running = opening
    series = []
    for key in sorted(timeline):
        point = timeline[key]
        point["spent"] = point["expenses"] + point["cherry"] + point["labor"]
        running += point["allocated"] - point["spent"]
        point["balance"] = running
        series.append(point)

    return {
        "stations": [{"id": str(s.id), "name": s.name} for s in stations],
        "opening_balance": opening,
        "allocated": allocated,
        "expenses": total("EXPENSE"),
        "cherry_paid": total("CHERRY"),
        "labor_paid": total("LABOR"),
        "spent": spent,
        "balance": opening + allocated - spent,
        "owed_to_farmers": owed_to_farmers(ids, date_to),
        "by_category": sorted(
            (
                {"label": label, "amount": amount, "is_expense_category": label in categories}
                for label, amount in by_category.items()
            ),
            key=lambda row: row["amount"],
            reverse=True,
        ),
        "by_station": by_station,
        "timeline": series,
        "group": group,
        "recent": [r.as_dict() for r in reversed(rows[-10:])],
    }


def finance_ledger(
    *,
    facility_ids: frozenset | None,
    station=None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict:
    """The cash book for reports: opening balance, every movement with a running
    balance, and closing balance (for the stations in scope, together)."""
    stations = list(scoped_stations(facility_ids=facility_ids, station=station))
    ids = [s.id for s in stations]
    opening_in, opening_out = _totals_before(ids, date_from) if date_from else (ZERO, ZERO)
    balance = opening_in - opening_out
    out = []
    for r in entries(ids, date_from, date_to):
        balance += r.money_in - r.money_out
        out.append(r.as_dict(balance))
    return {
        "stations": [{"id": str(s.id), "name": s.name} for s in stations],
        "date_from": date_from,
        "date_to": date_to,
        "opening_balance": opening_in - opening_out,
        "money_in": sum((r["money_in"] for r in out), ZERO),
        "money_out": sum((r["money_out"] for r in out), ZERO),
        "closing_balance": balance,
        "owed_to_farmers": owed_to_farmers(ids, date_to),
        "entries": out,
    }


def expenses_in_scope(facility_ids: frozenset | None):
    qs = Expense.objects.select_related("facility", "category", "created_by")
    if facility_ids is not None:
        qs = qs.filter(facility_id__in=facility_ids)
    return qs


def allocations_in_scope(facility_ids: frozenset | None):
    qs = FundAllocation.objects.select_related("facility", "created_by")
    if facility_ids is not None:
        qs = qs.filter(facility_id__in=facility_ids)
    return qs

"""Read/query functions for processing."""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Prefetch

from .models import GradeRatio, ProcessGrade, ProcessingLot, ProcessType


def current_ratio(grade: ProcessGrade, on: date | None = None):
    """The ratio in force for `grade` on `on` (default today), or None."""
    on = on or date.today()
    ratios = [r for r in grade.ratios.all() if r.effective_from <= on]
    if not ratios:
        ratios = list(grade.ratios.all())  # only future-dated ratios exist
    return max(ratios, key=lambda r: r.effective_from) if ratios else None


def process_types_with_grades():
    return ProcessType.objects.select_related(
        "facility", "process", "sub_process_ref"
    ).prefetch_related(
        Prefetch(
            "process__grades",
            queryset=ProcessGrade.objects.prefetch_related(
                Prefetch("ratios", queryset=GradeRatio.objects.order_by("-effective_from"))
            ),
        )
    )


def lots_with_results():
    return ProcessingLot.objects.select_related("facility", "process_type").prefetch_related(
        "results__grade"
    )


# --- Estimate vs actual variance ----------------------------------------------------

_KG = Decimal("0.01")
_PCT = Decimal("0.01")


def variance(estimated_kg, actual_kg) -> dict:
    """Actual minus estimate, in kg and as a % of the estimate (gain > 0, loss < 0).
    Both are None until the actual is recorded; the % is None for a zero estimate."""
    if actual_kg is None:
        return {"variance_kg": None, "variance_pct": None}
    estimated = Decimal(estimated_kg or 0)
    diff = (Decimal(actual_kg) - estimated).quantize(_KG, rounding=ROUND_HALF_UP)
    pct = (diff / estimated * 100).quantize(_PCT, rounding=ROUND_HALF_UP) if estimated else None
    return {"variance_kg": diff, "variance_pct": pct}


def lot_variance(lot: ProcessingLot) -> dict:
    """Lot-level estimate vs actual over the grades whose actual is recorded (a
    grade still awaiting its actual would otherwise count as a 100% loss).
    Uses the prefetched `results`."""
    measured = [r for r in lot.results.all() if r.actual_kg is not None]
    if not measured:
        return {"compared_estimated_kg": None, "variance_kg": None, "variance_pct": None}
    estimated = sum((r.estimated_kg for r in measured), Decimal("0"))
    actual = sum((r.actual_kg for r in measured), Decimal("0"))
    return {"compared_estimated_kg": estimated, **variance(estimated, actual)}

"""Read/query functions for processing."""

from datetime import date

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

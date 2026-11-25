"""Write operations for core. Every multi-row write is @transaction.atomic."""

from __future__ import annotations

import logging

from django.db import IntegrityError, transaction
from django.db.models import ProtectedError, RestrictedError
from django.utils import timezone

from .trash import TRASH_TYPES, purge_cutoff

logger = logging.getLogger(__name__)


def purge_trash(now=None) -> dict[str, dict[str, int]]:
    """Permanently delete records that have been in the trash longer than the retention.

    Each record is removed in its own transaction (with its cascading lines). A
    record still referenced by a live record (PROTECT foreign key), or one a type
    chooses to keep, is skipped and logged, never crashing the run. Sequence
    counters are not touched, so document numbers are never handed out again.
    Models with simple_history get a "-" (deleted) history row from delete().

    Returns {type_code: {"purged": n, "skipped": m}}.
    """
    now = now or timezone.now()
    cutoff = purge_cutoff(now)
    report: dict[str, dict[str, int]] = {}
    for trash_type in TRASH_TYPES:
        model = trash_type.get_model()
        counts = {"purged": 0, "skipped": 0}
        due = model.all_objects.filter(is_deleted=True, deleted_at__lte=cutoff)
        for pk in list(due.values_list("pk", flat=True)):
            try:
                with transaction.atomic():
                    obj = (
                        model.all_objects.select_for_update()
                        .filter(pk=pk, is_deleted=True, deleted_at__lte=cutoff)
                        .first()
                    )
                    if obj is None:
                        continue
                    number = trash_type.number(obj)
                    keep = trash_type.keep_reason(obj) if trash_type.keep_reason else ""
                    if keep:
                        logger.info("Trash: kept %s %s: %s", trash_type.label, number, keep)
                        counts["skipped"] += 1
                        continue
                    state = trash_type.before_purge(obj) if trash_type.before_purge else None
                    obj.delete()
                    if trash_type.after_purge:
                        trash_type.after_purge(state)
            except (ProtectedError, RestrictedError, IntegrityError) as exc:
                logger.warning(
                    "Trash: could not purge %s %s (still referenced): %s",
                    trash_type.label,
                    pk,
                    exc,
                )
                counts["skipped"] += 1
                continue
            logger.info(
                "Trash: purged %s %s (deleted %s, reason: %s)",
                trash_type.label,
                number,
                obj.deleted_at,
                obj.void_reason,
            )
            counts["purged"] += 1
        report[trash_type.code] = counts
    return report

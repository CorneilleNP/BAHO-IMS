"""Human-readable document numbers (GRN, farmer code, lot, batch, shipment)."""

from django.db import transaction

from .models import SequenceCounter


def next_sequence(key: str) -> int:
    """Return the next number for `key` (1, 2, 3…), safe under concurrent requests."""
    with transaction.atomic():
        SequenceCounter.objects.get_or_create(key=key)
        counter = SequenceCounter.objects.select_for_update().get(key=key)
        counter.value += 1
        counter.save(update_fields=["value"])
        return counter.value

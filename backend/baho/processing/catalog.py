"""Resolving free-text process labels to the 5 processes and their sub-processes."""

import re

from django.db import transaction
from rest_framework.exceptions import ValidationError

from .labels import clean_label, label_key
from .models import Process, SubProcess, SubProcessAlias

__all__ = ["add_alias", "clean_label", "label_key", "resolve_process_label"]


def resolve_process_label(raw: str, *, create: bool = True):
    """Return (process, sub_process) for a label typed in the field or a spreadsheet.

    - a label that *is* one of the 5 processes (code, name or alias) -> (process, None)
    - a known sub-process or alias -> (its process or None, sub_process)
    - anything new -> a new unassigned sub-process (when create=True)
    """
    key = label_key(raw)
    if not key:
        return None, None
    for process in Process.objects.filter(is_active=True):
        keys = {label_key(process.code), label_key(process.name), *process.aliases}
        if key in keys:
            return process, None
    sub = (
        SubProcess.objects.select_related("process").filter(key=key).first()
        or SubProcess.objects.select_related("process").filter(aliases__key=key).first()
    )
    if sub is None and create:
        sub = SubProcess.objects.create(name=clean_label(raw), key=key)
    return (sub.process if sub else None), sub


def add_alias(sub_process: SubProcess, label: str) -> None:
    key = label_key(label)
    if key and key != sub_process.key:
        SubProcessAlias.objects.update_or_create(
            key=key, defaults={"sub_process": sub_process, "label": clean_label(label)}
        )


# --- Managing sub-processes (the "Processes" screen) -------------------------------


def _sync_receipts(sub_processes) -> None:
    """Stock receipts follow their sub-process to its (new) process."""
    from baho.drymill.models import HqStockReceipt

    for sub in sub_processes:
        HqStockReceipt.all_objects.filter(sub_process=sub).update(process=sub.process)


def _check_free(key: str, except_sub: SubProcess | None = None) -> None:
    clash = SubProcess.objects.filter(key=key).exclude(pk=getattr(except_sub, "pk", None)).first()
    clash_alias = (
        SubProcessAlias.objects.filter(key=key)
        .exclude(sub_process=getattr(except_sub, "pk", None))
        .first()
    )
    if clash or clash_alias:
        name = clash.name if clash else clash_alias.sub_process.name
        raise ValidationError({"name": [f"That name is already used by sub-process {name}."]})
    for process in Process.objects.all():
        if key in {label_key(process.code), label_key(process.name), *process.aliases}:
            raise ValidationError({"name": [f"That name means the process {process.name} itself."]})


@transaction.atomic
def create_sub_process(*, name: str, process: Process | None) -> SubProcess:
    key = label_key(name)
    if not key:
        raise ValidationError({"name": ["Enter a name."]})
    _check_free(key)
    return SubProcess.objects.create(name=clean_label(name), key=key, process=process)


@transaction.atomic
def rename_sub_process(sub: SubProcess, name: str) -> SubProcess:
    key = label_key(name)
    if not key:
        raise ValidationError({"name": ["Enter a name."]})
    if key != sub.key:
        _check_free(key, except_sub=sub)
        SubProcessAlias.objects.filter(key=key).delete()
        SubProcessAlias.objects.create(
            sub_process=sub, label=sub.name, key=sub.key
        )  # old name keeps resolving
        sub.key = key
    sub.name = clean_label(name)
    sub.save(update_fields=["name", "key", "updated_at"])
    return sub


@transaction.atomic
def assign_sub_processes(*, sub_processes, process: Process | None) -> int:
    """Put the selected sub-processes (and their stock receipts) under a process."""
    subs = list(SubProcess.objects.select_for_update().filter(pk__in=[s.pk for s in sub_processes]))
    for sub in subs:
        sub.process = process
        sub.save(update_fields=["process", "updated_at"])
    _sync_receipts(subs)
    return len(subs)


@transaction.atomic
def merge_sub_processes(*, sub_processes, into: SubProcess) -> SubProcess:
    """Fold duplicates (e.g. "WASHED NO1" + "WASHED NO 1") into one sub-process.

    Their names become aliases of `into`, and every stock receipt moves to it.
    """
    from baho.drymill.models import HqStockReceipt

    others = [s for s in sub_processes if s.pk != into.pk]
    if not others:
        raise ValidationError({"sub_processes": ["Select at least two sub-processes to merge."]})
    for sub in others:
        HqStockReceipt.all_objects.filter(sub_process=sub).update(
            sub_process=into, process=into.process
        )
        SubProcessAlias.objects.filter(sub_process=sub).update(sub_process=into)
        key, label = sub.key, sub.name
        sub.delete()
        SubProcessAlias.objects.update_or_create(
            key=key, defaults={"sub_process": into, "label": label}
        )
    _sync_receipts([into])
    return into


@transaction.atomic
def set_sub_processes_active(*, sub_processes, is_active: bool) -> int:
    return SubProcess.objects.filter(pk__in=[s.pk for s in sub_processes]).update(
        is_active=is_active
    )


# --- Suggestions for unassigned sub-processes ---------------------------------------
# Only a hint shown on the Processes screen; nothing is assigned until a person confirms.

_RULES = [
    ("HONEY", lambda w: any(t.startswith("HONEY") for t in w)),
    ("AN", lambda w: _anaerobic(w) and _natural(w)),
    ("AFW", lambda w: _anaerobic(w) and _washed(w)),
    ("NN", lambda w: _natural(w)),
    ("FW", lambda w: _washed(w)),
]


def _words(name: str) -> list[str]:
    return re.findall(r"[A-Z]+", name.upper())


def _anaerobic(words) -> bool:
    return any(w.startswith("ANAER") for w in words)


def _natural(words) -> bool:
    return any(w in {"NAT", "NATURAL", "N"} or w.startswith("NATUR") for w in words)


def _washed(words) -> bool:
    return any(w in {"FW", "W", "WASHED", "WASH"} or w.startswith("WASH") for w in words)


def suggest_process(name: str) -> Process | None:
    """Best-guess process for a sub-process name ("FOREST NAT BF1" -> Normal Natural)."""
    words = _words(name)
    for code, rule in _RULES:
        if rule(words):
            return Process.objects.filter(code=code).first()
    return None

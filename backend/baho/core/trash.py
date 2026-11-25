"""The trash: deleted (voided) records, kept for a retention period and then purged.

Every record type users can delete from the app (`POST …/<id>/void/`) is listed
in `TRASH_TYPES`. A deleted record stays in the database with its reason for
`TRASH_RETENTION_HOURS` (default 24) and is then removed permanently by
`baho.core.services.purge_trash` (management command `purge_trash`).

Document numbers are never reused after a purge: automatic numbers come from
`SequenceCounter` rows, which a purge never touches.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta

from django.apps import apps
from django.conf import settings

from .access import CWS_READ_ROLES, DRYMILL_READ_ROLES


def retention_hours() -> float:
    return float(getattr(settings, "TRASH_RETENTION_HOURS", 24))


def retention() -> timedelta:
    return timedelta(hours=retention_hours())


def purge_cutoff(now: datetime) -> datetime:
    """Records deleted at or before this moment are due for permanent removal."""
    return now - retention()


# --- Per-type hooks used while purging ------------------------------------


def _grn_keep_reason(receipt) -> str:
    # The import record (unique row hash) cascades with the GRN; without it, re-running
    # the workbook import would create the deleted GRN again. Keep those.
    if apps.get_model("imports", "CherryReceiptImport").objects.filter(receipt=receipt).exists():
        return "imported from a workbook (purging would let the import create it again)"
    return ""


def _batch_receipts(batch) -> list:
    return [line.receipt for line in batch.inputs.select_related("receipt")]


def _refresh_receipts(receipts) -> None:
    # Voided batches never count towards stock, so this is a no-op for a consistent
    # database; it guarantees the cached balances still match after the purge.
    from baho.drymill.stock import refresh_receipt_stock

    for receipt in receipts:
        refresh_receipt_stock(receipt)


def _pay_period_children(period) -> None:
    # Voiding a pay period voids its attendance rows too; they go with it. A live
    # attendance row keeps PROTECTing the period, so the purge then skips it.
    apps.get_model("labor", "LaborAttendance").all_objects.filter(
        pay_period=period, is_deleted=True
    ).delete()


def _pay_period_label(period) -> str:
    return f"{period.period_start:%d %b %Y} - {period.period_end:%d %b %Y}"


@dataclass(frozen=True)
class TrashType:
    code: str
    label: str
    model: str  # "app_label.ModelName"
    read_roles: tuple[str, ...]
    number: Callable[[object], str]
    # Lookup path of the facility used for station scoping; None = HQ/global records only.
    facility_field: str | None = "facility"
    # Returns a non-empty reason to keep a record instead of purging it.
    keep_reason: Callable[[object], str] | None = None
    # Runs inside the purge transaction before delete(); its result goes to after_purge.
    before_purge: Callable[[object], object] | None = None
    after_purge: Callable[[object], None] | None = None

    def get_model(self):
        return apps.get_model(self.model)


# Purge order matters: dry mill batches before the stock receipts they took from
# (their input rows PROTECT the receipts).
TRASH_TYPES: tuple[TrashType, ...] = (
    TrashType(
        code="shipment",
        label="Export shipment",
        model="sales.ExportShipment",
        read_roles=DRYMILL_READ_ROLES,
        number=lambda o: o.shipment_no,
        facility_field=None,
    ),
    TrashType(
        code="batch",
        label="Dry mill batch",
        model="drymill.DryMillBatch",
        read_roles=DRYMILL_READ_ROLES,
        number=lambda o: o.batch_no,
        before_purge=_batch_receipts,
        after_purge=_refresh_receipts,
    ),
    TrashType(
        code="stock_receipt",
        label="HQ stock receipt",
        model="drymill.HqStockReceipt",
        read_roles=DRYMILL_READ_ROLES,
        number=lambda o: o.receipt_number,
    ),
    TrashType(
        code="lot",
        label="Processing lot",
        model="processing.ProcessingLot",
        read_roles=CWS_READ_ROLES,
        number=lambda o: o.lot_number,
    ),
    TrashType(
        code="grn",
        label="GRN",
        model="reception.CherryReceipt",
        read_roles=CWS_READ_ROLES,
        number=lambda o: o.grn_number,
        keep_reason=_grn_keep_reason,
    ),
    TrashType(
        code="pay_period",
        label="Labor pay period",
        model="labor.LaborPayPeriod",
        read_roles=CWS_READ_ROLES,
        number=_pay_period_label,
        before_purge=_pay_period_children,
    ),
)

TRASH_TYPES_BY_CODE = {t.code: t for t in TRASH_TYPES}

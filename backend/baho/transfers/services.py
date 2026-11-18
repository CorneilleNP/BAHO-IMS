"""Write operations for CWS -> dry mill transfers.

The reconciliation is deliberately blind: a CWS submits its own weighing of
a delivery note, and HQ dry mill must fill in its own weighing from scratch
(it is never shown the CWS's numbers) before it can confirm and see the
variance. This stops either side "agreeing" on a number before weighing -
the only way the comparison means anything. One delivery note can carry
several process/sub-process/grade lines in the same truck; each is weighed
and compared on its own.
"""

from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from baho.core.dates import crop_year_for
from baho.core.permissions import ensure_facility_access
from baho.drymill import services as drymill_services
from baho.drymill.models import OriginType

from .models import (
    CwsTransfer,
    CwsTransferLine,
    CwsTransferWeighing,
    DryMillTransferReceipt,
    DryMillTransferReceiptLine,
    DryMillTransferWeighing,
)

CENT = Decimal("0.01")


def _sum_weighings(weighings: list[dict]) -> tuple[int, Decimal]:
    bags = sum(int(w["bags"]) for w in weighings)
    weight = sum(Decimal(str(w["weight_kg"])) for w in weighings)
    return bags, weight.quantize(CENT)


def _check_bags_weight(weight_of_bags_kg, gross: Decimal) -> Decimal:
    weight_of_bags = Decimal(weight_of_bags_kg or 0)
    if weight_of_bags > gross:
        raise ValidationError({"weight_of_bags_kg": ["Weight of bags cannot exceed the gross weight."]})
    return weight_of_bags


def _build_lines(lines: list[dict]) -> list[dict]:
    """Validate and total each line's weighings; no two lines may repeat the
    same process/sub-process/grade on one delivery note."""
    if not lines:
        raise ValidationError({"lines": ["Add at least one process/grade line."]})
    seen = set()
    built = []
    for line in lines:
        weighings = line.get("weighings") or []
        if not weighings:
            raise ValidationError({"weighings": ["Record at least one weighing for each line."]})
        key = (line["process"].id, line["sub_process"].id if line.get("sub_process") else None, line["grade"].id)
        if key in seen:
            raise ValidationError({"lines": ["Each process/sub-process/grade can appear only once per delivery note."]})
        seen.add(key)
        bags, gross = _sum_weighings(weighings)
        weight_of_bags = _check_bags_weight(line.get("weight_of_bags_kg"), gross)
        built.append(
            {
                "process": line["process"],
                "sub_process": line.get("sub_process"),
                "grade": line["grade"],
                "moisture_content_pct": line.get("moisture_content_pct"),
                "number_of_bags": bags,
                "gross_weight_kg": gross,
                "weight_of_bags_kg": weight_of_bags,
                "weighings": weighings,
            }
        )
    return built


@transaction.atomic
def create_transfer(
    *, user, facility, transfer_date, delivery_note_no, lines, notes=""
) -> CwsTransfer:
    ensure_facility_access(user, facility)
    if CwsTransfer.objects.filter(delivery_note_no=delivery_note_no).exists():
        raise ValidationError({"delivery_note_no": ["This delivery note number is already recorded."]})
    built = _build_lines(lines)

    transfer = CwsTransfer.objects.create(
        delivery_note_no=delivery_note_no,
        facility=facility,
        crop_year=crop_year_for(transfer_date),
        transfer_date=transfer_date,
        notes=notes,
        created_by=user,
        updated_by=user,
    )
    for line in built:
        weighings = line.pop("weighings")
        row = CwsTransferLine.objects.create(transfer=transfer, **line)
        CwsTransferWeighing.objects.bulk_create(
            [CwsTransferWeighing(line=row, bags=w["bags"], weight_kg=w["weight_kg"]) for w in weighings]
        )
    return transfer


@transaction.atomic
def update_transfer(*, user, transfer, lines=None, **fields) -> CwsTransfer:
    """Correct a transfer before it's submitted. Once submitted, dry mill may
    already be looking it up, so it's locked (void and re-record instead)."""
    ensure_facility_access(user, fields.get("facility") or transfer.facility)
    if transfer.status != CwsTransfer.Status.DRAFT:
        raise ValidationError(["Only a draft transfer can be corrected; this one is submitted."])

    if "transfer_date" in fields:
        transfer.crop_year = crop_year_for(fields["transfer_date"])
    for name, value in fields.items():
        setattr(transfer, name, value)
    transfer.updated_by = user
    transfer.save()

    if lines is not None:
        built = _build_lines(lines)
        transfer.lines.all().delete()
        for line in built:
            weighings = line.pop("weighings")
            row = CwsTransferLine.objects.create(transfer=transfer, **line)
            CwsTransferWeighing.objects.bulk_create(
                [CwsTransferWeighing(line=row, bags=w["bags"], weight_kg=w["weight_kg"]) for w in weighings]
            )
    return transfer


@transaction.atomic
def submit_transfer(*, user, transfer) -> CwsTransfer:
    ensure_facility_access(user, transfer.facility)
    if transfer.status == CwsTransfer.Status.SUBMITTED:
        raise ValidationError(["Already submitted."])
    if not transfer.lines.exists():
        raise ValidationError(["Add at least one process/grade line before submitting."])
    transfer.status = CwsTransfer.Status.SUBMITTED
    transfer.updated_by = user
    transfer.save(update_fields=["status", "updated_by", "updated_at"])
    return transfer


@transaction.atomic
def lookup_for_dry_mill(*, delivery_note_no: str) -> DryMillTransferReceipt:
    """Find (or start) dry mill's own receipt for a delivery note, with one
    blind line per CWS line (so dry mill knows what to weigh, not how much).
    The CWS's numbers are serialized away until this receipt is confirmed."""
    try:
        transfer = CwsTransfer.objects.select_related("facility").get(
            delivery_note_no=delivery_note_no
        )
    except CwsTransfer.DoesNotExist:
        raise ValidationError({"delivery_note_no": ["No transfer found with this delivery note number."]})
    if transfer.status == CwsTransfer.Status.DRAFT:
        raise ValidationError(
            {"delivery_note_no": ["The station hasn't submitted this delivery note yet."]}
        )
    receipt, _ = DryMillTransferReceipt.objects.get_or_create(transfer=transfer)
    for cws_line in transfer.lines.all():
        DryMillTransferReceiptLine.objects.get_or_create(
            receipt=receipt, cws_line=cws_line, defaults={"created_by": None}
        )
    return receipt


@transaction.atomic
def update_dry_mill_line(*, user, line, weighings=None, **fields) -> DryMillTransferReceiptLine:
    line = DryMillTransferReceiptLine.objects.select_for_update().get(pk=line.pk)
    if line.receipt.is_locked:
        raise PermissionDenied("This receipt is confirmed and locked. Ask an admin to unlock it.")

    if weighings is not None:
        if not weighings:
            raise ValidationError({"weighings": ["Record at least one weighing."]})
        bags, gross = _sum_weighings(weighings)
        fields["number_of_bags"] = bags
        fields["gross_weight_kg"] = gross
        fields.setdefault("weight_of_bags_kg", line.weight_of_bags_kg)
        fields["weight_of_bags_kg"] = _check_bags_weight(fields["weight_of_bags_kg"], gross)
    elif "weight_of_bags_kg" in fields:
        fields["weight_of_bags_kg"] = _check_bags_weight(
            fields["weight_of_bags_kg"], fields.get("gross_weight_kg", line.gross_weight_kg)
        )

    for name, value in fields.items():
        setattr(line, name, value)
    line.updated_by = user
    line.save()
    line.refresh_from_db()

    if weighings is not None:
        line.weighings.all().delete()
        DryMillTransferWeighing.objects.bulk_create(
            [DryMillTransferWeighing(line=line, bags=w["bags"], weight_kg=w["weight_kg"]) for w in weighings]
        )
    return line


def _variance_status(variance_kg: Decimal) -> str:
    if variance_kg > 0:
        return DryMillTransferReceiptLine.VarianceStatus.STOCK_LOSS
    if variance_kg < 0:
        return DryMillTransferReceiptLine.VarianceStatus.STOCK_GAIN
    return DryMillTransferReceiptLine.VarianceStatus.MATCH


def _line_mismatched(line: DryMillTransferReceiptLine) -> bool:
    c = line.cws_line
    return (
        c.number_of_bags != line.number_of_bags
        or c.gross_weight_kg != line.gross_weight_kg
        or c.weight_of_bags_kg != line.weight_of_bags_kg
        or c.net_weight_kg != line.net_weight_kg
    )


@transaction.atomic
def lock_dry_mill_receipt(*, user, receipt) -> DryMillTransferReceipt:
    """Freeze dry mill's weighing numbers (no more edits without an admin
    unlocking) and work out the variance against the CWS's figures, line by
    line and field by field - bags, gross, bag weight, net - so dry mill can
    see exactly where it differs before writing a comment and submitting."""
    receipt = DryMillTransferReceipt.objects.select_for_update().get(pk=receipt.pk)
    if receipt.status != DryMillTransferReceipt.Status.PENDING:
        raise ValidationError(["Already locked."])
    lines = list(receipt.lines.select_related("cws_line"))
    if not lines:
        raise ValidationError(["Nothing to lock."])
    if any(not line.weighings.exists() for line in lines):
        raise ValidationError({"weighings": ["Record at least one weighing for every line before locking."]})

    for line in lines:
        variance = line.cws_line.net_weight_kg - line.net_weight_kg
        line.variance_status = _variance_status(variance)
        line.updated_by = user
        line.save(update_fields=["variance_status", "updated_by", "updated_at"])

    receipt.status = DryMillTransferReceipt.Status.LOCKED
    receipt.updated_by = user
    receipt.save(update_fields=["status", "updated_by", "updated_at"])
    return receipt


@transaction.atomic
def submit_dry_mill_receipt(*, user, receipt, comment: str = "", arrival_date=None) -> DryMillTransferReceipt:
    """Attach the comment explaining any mismatch and create the matching HQ
    stock receipts so milling can draw on this parchment. Final: the weighing
    was already locked, and stays locked, unless an admin unlocks it."""
    receipt = DryMillTransferReceipt.objects.select_for_update().get(pk=receipt.pk)
    if receipt.status != DryMillTransferReceipt.Status.LOCKED:
        raise ValidationError(["Lock the weighing and review the variance first."])
    lines = list(
        receipt.lines.select_related(
            "cws_line", "cws_line__process", "cws_line__sub_process", "cws_line__grade", "stock_receipt"
        )
    )

    comment = (comment or "").strip()
    if any(_line_mismatched(line) for line in lines) and not comment:
        raise ValidationError(
            {"comment": ["At least one figure doesn't match the station's - explain the difference."]}
        )

    transfer = receipt.transfer
    for line in lines:
        cws_line = line.cws_line
        stock_fields = dict(
            process=cws_line.process,
            sub_process=cws_line.sub_process,
            grade=cws_line.grade.code,
            delivery_note_no=transfer.delivery_note_no,
            delivery_note_qty_kg=cws_line.net_weight_kg,
            gross_weight_kg=line.gross_weight_kg,
            net_weight_kg=line.gross_weight_kg,
            number_of_bags=line.number_of_bags,
            weight_of_bags_kg=line.weight_of_bags_kg,
        )
        if line.stock_receipt_id is None:
            line.stock_receipt = drymill_services.create_stock_receipt(
                user=user,
                arrival_date=arrival_date or timezone.localdate(),
                origin_type=OriginType.OWN_CWS,
                source_facility=transfer.facility,
                **stock_fields,
            )
            line.save(update_fields=["stock_receipt"])
        else:
            drymill_services.update_stock_receipt(user=user, receipt=line.stock_receipt, **stock_fields)

    receipt.status = DryMillTransferReceipt.Status.CONFIRMED
    receipt.comment = comment
    receipt.confirmed_by = user
    receipt.confirmed_at = timezone.now()
    receipt.unlocked_by = None
    receipt.unlocked_at = None
    receipt.updated_by = user
    receipt.save()
    return receipt


@transaction.atomic
def unlock_dry_mill_receipt(*, user, receipt) -> DryMillTransferReceipt:
    """Admin-only override to correct a locked or confirmed receipt. Clears
    the comment and variance so the next lock recomputes them fresh; any
    stock receipt already created stays linked and is updated on re-submit."""
    receipt = DryMillTransferReceipt.objects.select_for_update().get(pk=receipt.pk)
    if receipt.status == DryMillTransferReceipt.Status.PENDING:
        raise ValidationError(["Only a locked or confirmed receipt needs unlocking."])
    receipt.lines.update(variance_status="")
    receipt.unlocked_by = user
    receipt.unlocked_at = timezone.now()
    receipt.status = DryMillTransferReceipt.Status.PENDING
    receipt.comment = ""
    receipt.updated_by = user
    receipt.save(
        update_fields=["unlocked_by", "unlocked_at", "status", "comment", "updated_by", "updated_at"]
    )
    return receipt

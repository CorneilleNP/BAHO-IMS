from .models import CwsTransfer, DryMillTransferReceipt


def transfers_with_lines():
    return CwsTransfer.objects.select_related("facility", "crop_year").prefetch_related(
        "lines__process", "lines__sub_process", "lines__grade", "lines__weighings"
    )


def dry_mill_receipts():
    return DryMillTransferReceipt.objects.select_related(
        "transfer", "transfer__facility"
    ).prefetch_related(
        "lines__cws_line__process",
        "lines__cws_line__sub_process",
        "lines__cws_line__grade",
        "lines__cws_line__weighings",
        "lines__weighings",
        "lines__stock_receipt",
    )

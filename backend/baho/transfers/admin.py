from django.contrib import admin

from .models import (
    CwsTransfer,
    CwsTransferLine,
    CwsTransferWeighing,
    DryMillTransferReceipt,
    DryMillTransferReceiptLine,
    DryMillTransferWeighing,
)


class CwsTransferWeighingInline(admin.TabularInline):
    model = CwsTransferWeighing
    extra = 0


class CwsTransferLineInline(admin.TabularInline):
    model = CwsTransferLine
    extra = 0
    readonly_fields = ["net_weight_kg"]


class DryMillTransferWeighingInline(admin.TabularInline):
    model = DryMillTransferWeighing
    extra = 0


class DryMillTransferReceiptLineInline(admin.TabularInline):
    model = DryMillTransferReceiptLine
    extra = 0
    readonly_fields = ["net_weight_kg"]


@admin.register(CwsTransfer)
class CwsTransferAdmin(admin.ModelAdmin):
    list_display = ["delivery_note_no", "facility", "transfer_date", "status"]
    list_filter = ["facility", "status"]
    search_fields = ["delivery_note_no"]
    inlines = [CwsTransferLineInline]


@admin.register(CwsTransferLine)
class CwsTransferLineAdmin(admin.ModelAdmin):
    list_display = ["transfer", "process", "sub_process", "grade", "net_weight_kg"]
    readonly_fields = ["net_weight_kg"]
    inlines = [CwsTransferWeighingInline]


@admin.register(DryMillTransferReceipt)
class DryMillTransferReceiptAdmin(admin.ModelAdmin):
    list_display = ["transfer", "status"]
    list_filter = ["status"]
    inlines = [DryMillTransferReceiptLineInline]


@admin.register(DryMillTransferReceiptLine)
class DryMillTransferReceiptLineAdmin(admin.ModelAdmin):
    list_display = ["receipt", "cws_line", "net_weight_kg", "variance_status"]
    list_filter = ["variance_status"]
    readonly_fields = ["net_weight_kg"]
    inlines = [DryMillTransferWeighingInline]

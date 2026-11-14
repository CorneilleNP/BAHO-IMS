from django.contrib import admin

from .models import DryMillBatch, DryMillOutput, ExportGrade, HqStockReceipt, Supplier


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ["name", "contact_name", "phone", "location", "is_active"]
    list_filter = ["is_active"]
    search_fields = ["name", "contact_name", "tin"]
    autocomplete_fields = ["location"]


@admin.register(ExportGrade)
class ExportGradeAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "display_order", "is_active"]
    list_editable = ["display_order", "is_active"]


@admin.register(HqStockReceipt)
class HqStockReceiptAdmin(admin.ModelAdmin):
    list_display = [
        "receipt_number",
        "arrival_date",
        "origin_type",
        "source_facility",
        "source_supplier",
        "process",
        "grade",
        "net_weight_kg",
        "quality_status",
        "processing_status",
    ]
    list_filter = ["quality_status", "processing_status", "origin_type", "crop_year"]
    search_fields = ["receipt_number", "lot_reference", "delivery_note_no"]
    readonly_fields = ["receipt_number", "pure_weight_kg"]


class OutputInline(admin.TabularInline):
    model = DryMillOutput
    extra = 0


@admin.register(DryMillBatch)
class DryMillBatchAdmin(admin.ModelAdmin):
    list_display = [
        "batch_no",
        "processing_date",
        "origin_type",
        "process_product",
        "parch_input_kg",
        "status",
    ]
    list_filter = ["status", "origin_type", "crop_year"]
    search_fields = ["batch_no", "process_product"]
    inlines = [OutputInline]

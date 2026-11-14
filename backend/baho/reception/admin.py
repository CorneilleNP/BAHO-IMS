from django.contrib import admin

from .models import CherryReceipt, CherryReceiptLine


class LineInline(admin.TabularInline):
    model = CherryReceiptLine
    extra = 0
    readonly_fields = ["line_amount"]


@admin.register(CherryReceipt)
class CherryReceiptAdmin(admin.ModelAdmin):
    list_display = ["grn_number", "received_on", "facility", "farmer", "payment_status"]
    list_filter = ["facility", "payment_status", "crop_year"]
    search_fields = ["grn_number", "farmer__full_name"]
    readonly_fields = ["grn_number"]
    inlines = [LineInline]

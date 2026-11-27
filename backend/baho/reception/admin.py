from django.contrib import admin

from .models import CherryPayment, CherryReceipt, CherryReceiptLine


class LineInline(admin.TabularInline):
    model = CherryReceiptLine
    extra = 0
    readonly_fields = ["line_amount"]


class PaymentInline(admin.TabularInline):
    model = CherryPayment
    extra = 0
    fields = ["paid_on", "amount", "method", "reference", "is_deleted"]
    readonly_fields = fields
    can_delete = False


@admin.register(CherryReceipt)
class CherryReceiptAdmin(admin.ModelAdmin):
    list_display = [
        "grn_number",
        "received_on",
        "facility",
        "farmer",
        "payment_status",
        "amount_paid",
    ]
    list_filter = ["facility", "payment_status", "crop_year"]
    search_fields = ["grn_number", "farmer__full_name"]
    readonly_fields = ["grn_number", "payment_status", "amount_paid", "payment_method"]
    inlines = [LineInline, PaymentInline]

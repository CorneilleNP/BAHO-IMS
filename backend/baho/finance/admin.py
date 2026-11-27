from django.contrib import admin

from .models import Expense, ExpenseCategory, FundAllocation


@admin.register(ExpenseCategory)
class ExpenseCategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "code", "description", "display_order", "is_active"]
    list_editable = ["display_order", "is_active"]
    search_fields = ["name", "code"]


@admin.register(FundAllocation)
class FundAllocationAdmin(admin.ModelAdmin):
    list_display = ["allocation_number", "allocated_on", "facility", "amount", "reference"]
    list_filter = ["facility"]
    search_fields = ["allocation_number", "reference", "notes"]
    readonly_fields = ["allocation_number"]


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ["expense_number", "spent_on", "facility", "category", "amount", "description"]
    list_filter = ["facility", "category"]
    search_fields = ["expense_number", "description", "paid_to", "reference"]
    readonly_fields = ["expense_number"]

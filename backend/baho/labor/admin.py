from django.contrib import admin

from .models import CasualLaborer, LaborAttendance, LaborPayPeriod


@admin.register(CasualLaborer)
class CasualLaborerAdmin(admin.ModelAdmin):
    list_display = ["full_name", "facility", "national_id", "phone", "daily_rate", "is_active"]
    list_filter = ["facility", "is_active"]
    search_fields = ["full_name", "national_id", "phone"]


class LaborAttendanceInline(admin.TabularInline):
    model = LaborAttendance
    extra = 0
    fields = ["laborer", "work_date", "present", "daily_rate_applied"]
    raw_id_fields = ["laborer"]


@admin.register(LaborPayPeriod)
class LaborPayPeriodAdmin(admin.ModelAdmin):
    list_display = ["facility", "period_start", "period_end", "status", "is_deleted"]
    list_filter = ["facility", "status", "is_deleted"]
    readonly_fields = ["closed_at", "closed_by", "paid_at", "paid_by"]
    inlines = [LaborAttendanceInline]

    def get_queryset(self, request):
        return LaborPayPeriod.all_objects.select_related("facility")


@admin.register(LaborAttendance)
class LaborAttendanceAdmin(admin.ModelAdmin):
    list_display = ["laborer", "work_date", "present", "daily_rate_applied", "pay_period"]
    list_filter = ["present", "pay_period__facility"]
    search_fields = ["laborer__full_name"]
    raw_id_fields = ["laborer", "pay_period"]
    date_hierarchy = "work_date"

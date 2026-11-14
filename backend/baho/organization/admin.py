from django.contrib import admin

from .models import AdminUnit, CropYear, Facility


@admin.register(CropYear)
class CropYearAdmin(admin.ModelAdmin):
    list_display = ["label", "start_date", "end_date", "is_active"]
    list_filter = ["is_active"]


@admin.register(Facility)
class FacilityAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "facility_type", "district", "sector", "is_active"]
    list_filter = ["facility_type", "is_active", "district"]
    search_fields = ["code", "name", "district", "sector"]
    autocomplete_fields = ["village"]


@admin.register(AdminUnit)
class AdminUnitAdmin(admin.ModelAdmin):
    list_display = ["name", "level", "parent"]
    list_filter = ["level"]
    search_fields = ["name"]
    autocomplete_fields = ["parent"]

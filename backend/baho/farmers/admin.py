from django.contrib import admin

from .models import Farmer


@admin.register(Farmer)
class FarmerAdmin(admin.ModelAdmin):
    list_display = ["farmer_code", "full_name", "gender", "phone", "home_facility", "is_active"]
    list_filter = ["home_facility", "gender", "is_active"]
    search_fields = ["farmer_code", "full_name", "phone", "national_id"]
    readonly_fields = ["farmer_code"]

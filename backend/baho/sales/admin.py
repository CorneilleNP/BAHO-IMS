from django.contrib import admin

from .models import Client, ExportShipment, ExportShipmentLine


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ["name", "country", "contact_name", "is_active"]
    list_filter = ["is_active", "country"]
    search_fields = ["name", "contact_name"]


class LineInline(admin.TabularInline):
    model = ExportShipmentLine
    extra = 0


@admin.register(ExportShipment)
class ExportShipmentAdmin(admin.ModelAdmin):
    list_display = ["shipment_no", "delivery_to_naeb_date", "client", "status"]
    list_filter = ["status", "client", "crop_year"]
    search_fields = ["shipment_no", "client__name"]
    readonly_fields = ["shipment_no"]
    inlines = [LineInline]

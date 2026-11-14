from django.contrib import admin

from .models import (
    GradeRatio,
    LotGradeResult,
    Process,
    ProcessGrade,
    ProcessingLot,
    ProcessType,
    SubProcess,
    SubProcessAlias,
)


class ProcessGradeInline(admin.TabularInline):
    model = ProcessGrade
    extra = 0


@admin.register(ProcessType)
class ProcessTypeAdmin(admin.ModelAdmin):
    list_display = ["name", "sub_process", "facility", "is_active"]
    list_filter = ["facility", "is_active"]
    search_fields = ["name", "sub_process"]
    inlines = [ProcessGradeInline]


@admin.register(GradeRatio)
class GradeRatioAdmin(admin.ModelAdmin):
    list_display = ["grade", "grade__process_type", "crop_year", "ratio", "effective_from"]
    list_filter = ["crop_year", "grade__process_type__facility"]


class LotResultInline(admin.TabularInline):
    model = LotGradeResult
    extra = 0
    readonly_fields = ["grade", "ratio_used", "estimated_kg"]


@admin.register(ProcessingLot)
class ProcessingLotAdmin(admin.ModelAdmin):
    list_display = [
        "lot_number",
        "lot_date",
        "facility",
        "process_type",
        "cherry_input_kg",
        "status",
    ]
    list_filter = ["facility", "status", "crop_year"]
    search_fields = ["lot_number"]
    inlines = [LotResultInline]


@admin.register(Process)
class ProcessAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "display_order", "is_active"]


class AliasInline(admin.TabularInline):
    model = SubProcessAlias
    extra = 0
    fields = ["label", "key"]


@admin.register(SubProcess)
class SubProcessAdmin(admin.ModelAdmin):
    list_display = ["name", "process", "is_active"]
    list_filter = ["process", "is_active"]
    search_fields = ["name", "aliases__label"]
    inlines = [AliasInline]

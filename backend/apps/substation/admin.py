from django.contrib import admin
from .models import SubstationSheet, SubstationReading, SubstationConfigDoc


@admin.register(SubstationSheet)
class SubstationSheetAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'section', 'display_order', 'is_active', 'updated_at')
    list_filter = ('section', 'is_active')
    search_fields = ('id', 'name', 'full_title')
    ordering = ('display_order', 'id')


@admin.register(SubstationReading)
class SubstationReadingAdmin(admin.ModelAdmin):
    list_display = ('doc_id', 'sheet', 'date', 'slot', 'operator', 'filled', 'total', 'updated_at')
    list_filter = ('panel_type', 'section', 'slot', 'date')
    search_fields = ('doc_id', 'sheet', 'substation', 'operator')
    ordering = ('-date', 'sheet', 'slot')
    date_hierarchy = 'date'


@admin.register(SubstationConfigDoc)
class SubstationConfigDocAdmin(admin.ModelAdmin):
    list_display = ('key', 'updated_at')
    search_fields = ('key',)

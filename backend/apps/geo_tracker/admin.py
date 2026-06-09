from django.contrib import admin

from .models import PlantRecord, PlantVariety


@admin.register(PlantVariety)
class PlantVarietyAdmin(admin.ModelAdmin):
    list_display = ['name', 'plant_type', 'scientific_name']
    list_filter = ['plant_type']
    search_fields = ['name', 'scientific_name']


@admin.register(PlantRecord)
class PlantRecordAdmin(admin.ModelAdmin):
    list_display = [
        'tracking_id', 'local_name', 'plant_type', 'zone',
        'condition', 'submitted_at',
    ]
    list_filter = ['plant_type', 'condition', 'zone']
    search_fields = ['tracking_id', 'local_name', 'scientific_name', 'zone']
    readonly_fields = ['tracking_id', 'submitted_at']
    ordering = ['-submitted_at']

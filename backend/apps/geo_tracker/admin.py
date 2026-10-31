from django.contrib import admin

from .models import PlantRecord, PlantRecordPhoto, PlantVariety

@admin.register(PlantVariety)
class PlantVarietyAdmin(admin.ModelAdmin):
    list_display = ['name', 'plant_type', 'scientific_name']
    list_filter = ['plant_type']
    search_fields = ['name', 'scientific_name']


class PlantRecordPhotoInline(admin.TabularInline):
    model = PlantRecordPhoto
    extra = 0
    readonly_fields = ['photo_id', 'uploaded_at', 'file_size']
    fields = ['photo_id', 'photo', 'original_filename', 'file_size', 'uploaded_at']


@admin.register(PlantRecord)
class PlantRecordAdmin(admin.ModelAdmin):
    list_display = [
        'tracking_id', 'local_name', 'plant_type',
        'zone_display', 'condition', 'submitted_at',
    ]
    # zone now has a fixed choice set, so Django renders a proper select filter.
    list_filter = ['plant_type', 'condition', 'zone']
    search_fields = ['tracking_id', 'local_name', 'scientific_name', 'submission_id']
    readonly_fields = ['tracking_id', 'submission_id', 'submitted_at']
    ordering = ['-submitted_at']
    inlines = [PlantRecordPhotoInline]

    @admin.display(description='Campus Area')
    def zone_display(self, obj):
        """Show the human-readable campus area label in list view."""
        return obj.get_zone_display() if obj.zone else '—'


@admin.register(PlantRecordPhoto)
class PlantRecordPhotoAdmin(admin.ModelAdmin):
    list_display = ['photo_id', 'record', 'original_filename', 'file_size', 'uploaded_at']
    search_fields = ['photo_id', 'record__tracking_id', 'original_filename']
    readonly_fields = ['photo_id', 'uploaded_at']

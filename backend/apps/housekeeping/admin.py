from django.contrib import admin
from .models import (
    HKArea, HKUserArea, HKWorker, HKScheduleTemplate, HKDailyRecord,
    HKExtraWork, HKAttendanceRecord, HKSundayIncharge,
    HKAreaStock, HKStockRequest, HKAlert, HKRelieverSubstitution,
    HKTaskWorkerAssignment, HKWorkerSelectionRequest,
)


@admin.register(HKArea)
class HKAreaAdmin(admin.ModelAdmin):
    list_display = ('name', 'area_type', 'is_active')
    list_filter = ('area_type', 'is_active')
    search_fields = ('name',)


@admin.register(HKUserArea)
class HKUserAreaAdmin(admin.ModelAdmin):
    list_display = ('user', 'area')
    list_filter = ('area',)
    search_fields = ('user__username', 'user__first_name', 'area__name')


@admin.register(HKWorker)
class HKWorkerAdmin(admin.ModelAdmin):
    list_display = ('name', 'phone', 'punching_no', 'worker_type', 'shift', 'area', 'supervisor', 'is_active', 'is_reliever')
    list_filter = ('worker_type', 'shift', 'area', 'supervisor', 'is_active', 'is_reliever')
    search_fields = ('name', 'phone', 'punching_no', 'supervisor__username', 'supervisor__first_name')


@admin.register(HKScheduleTemplate)
class HKScheduleTemplateAdmin(admin.ModelAdmin):
    list_display = ('task_name', 'area', 'worker_tag', 'order', 'start_time', 'end_time', 'frequency', 'requires_photo', 'is_active')
    list_filter = ('area', 'worker_tag', 'frequency', 'requires_photo', 'is_active')
    list_editable = ('requires_photo', 'is_active', 'order')
    search_fields = ('task_name', 'area__name')
    ordering = ('area', 'worker_tag', 'order', 'start_time')


@admin.register(HKDailyRecord)
class HKDailyRecordAdmin(admin.ModelAdmin):
    list_display = (
        'schedule', 'area', 'date', 'status',
        'assigned_worker', 'assigned_by', 'completed_by', 'completed_at',
    )
    list_filter = ('status', 'date', 'area')
    date_hierarchy = 'date'
    readonly_fields = (
        'photo_before', 'photo_after', 'latitude', 'longitude',
        'assigned_at', 'started_at', 'completed_at',
    )


@admin.register(HKExtraWork)
class HKExtraWorkAdmin(admin.ModelAdmin):
    list_display = ('task_name', 'area', 'date', 'worker_name', 'logged_by', 'is_verified')
    list_filter = ('area', 'date', 'is_verified')
    list_editable = ('is_verified',)
    date_hierarchy = 'date'


@admin.register(HKAttendanceRecord)
class HKAttendanceRecordAdmin(admin.ModelAdmin):
    list_display = ('worker', 'date', 'half', 'status', 'is_submitted', 'marked_by')
    list_filter = ('status', 'half', 'is_submitted', 'date', 'worker__area')
    search_fields = ('worker__name',)
    date_hierarchy = 'date'


@admin.register(HKSundayIncharge)
class HKSundayInchargeAdmin(admin.ModelAdmin):
    list_display = ('area', 'worker', 'for_sunday', 'set_by')
    list_filter = ('area',)


@admin.register(HKAreaStock)
class HKAreaStockAdmin(admin.ModelAdmin):
    list_display = ('area', 'item_name', 'quantity', 'unit', 'low_stock_threshold')
    list_filter = ('area',)
    list_editable = ('quantity', 'low_stock_threshold')
    search_fields = ('item_name', 'area__name')


@admin.register(HKStockRequest)
class HKStockRequestAdmin(admin.ModelAdmin):
    list_display = ('item_name', 'quantity', 'requested_by', 'area', 'is_urgent', 'status', 'created_at')
    list_filter = ('status', 'is_urgent', 'area')
    search_fields = ('item_name',)


@admin.register(HKAlert)
class HKAlertAdmin(admin.ModelAdmin):
    list_display = ('title', 'priority', 'is_active', 'created_by', 'created_at')
    list_filter = ('priority', 'is_active')
    filter_horizontal = ('target_areas',)


@admin.register(HKRelieverSubstitution)
class HKRelieverSubstitutionAdmin(admin.ModelAdmin):
    list_display = ('date', 'original_worker', 'reliever', 'area', 'assigned_by', 'created_at')
    list_filter = ('date', 'area')
    search_fields = ('original_worker__name', 'reliever__name')
    date_hierarchy = 'date'


@admin.register(HKTaskWorkerAssignment)
class HKTaskWorkerAssignmentAdmin(admin.ModelAdmin):
    list_display = ('daily_record', 'worker', 'assigned_by', 'assigned_at')
    list_filter = ('daily_record__area', 'daily_record__date')
    search_fields = ('daily_record__schedule__task_name', 'worker__name', 'daily_record__area__name')
    date_hierarchy = 'assigned_at'


@admin.register(HKWorkerSelectionRequest)
class HKWorkerSelectionRequestAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'selection_type', 'section_filter', 'source_area', 'target_area',
        'target_supervisor', 'status', 'requested_by', 'approved_by', 'created_at',
    )
    list_filter = ('status', 'selection_type', 'section_filter', 'target_area', 'source_area')
    search_fields = (
        'target_area__name', 'source_area__name', 'requested_by__username',
        'approved_by__username', 'workers__name',
    )
    filter_horizontal = ('workers',)
    date_hierarchy = 'created_at'

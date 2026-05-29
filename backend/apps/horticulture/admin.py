from django.contrib import admin

from config.admin import admin_site

from .models import (
    HorticultureArea,
    HorticultureAttendanceRecord,
    HorticultureAreaStock,
    HorticultureDailyAssignment,
    HorticultureAttendance,
    HorticultureRoad,
    HorticultureStockRequest,
    HorticultureWorker,
    HorticultureWorkerArea,
    HorticultureZone,
    SeasonSetting,
    TaskLog,
    TaskType,
    WorkerAttendance,
)


@admin.register(HorticultureZone, site=admin_site)
class HorticultureZoneAdmin(admin.ModelAdmin):
    list_display = ('name', 'color_code', 'supervisor')
    search_fields = ('name', 'color_code', 'supervisor__username', 'supervisor__first_name', 'supervisor__last_name')


@admin.register(HorticultureArea, site=admin_site)
class HorticultureAreaAdmin(admin.ModelAdmin):
    list_display = ('area_number', 'name', 'zone')
    list_filter = ('zone',)
    search_fields = ('name',)


@admin.register(HorticultureRoad, site=admin_site)
class HorticultureRoadAdmin(admin.ModelAdmin):
    list_display = ('road_code', 'name', 'zone')
    list_filter = ('zone',)
    search_fields = ('road_code', 'name')


@admin.register(SeasonSetting, site=admin_site)
class SeasonSettingAdmin(admin.ModelAdmin):
    list_display = ('season', 'updated_by', 'updated_at')
    readonly_fields = ('updated_at',)


@admin.register(TaskType, site=admin_site)
class TaskTypeAdmin(admin.ModelAdmin):
    list_display = (
        'name',
        'threshold_days_default',
        'threshold_days_summer',
        'threshold_days_winter',
        'threshold_days_rainy',
        'is_active',
    )
    list_filter = ('is_active',)
    search_fields = ('name',)


@admin.register(TaskLog, site=admin_site)
class TaskLogAdmin(admin.ModelAdmin):
    list_display = ('task_type', 'zone', 'area', 'road', 'done_by', 'done_date', 'created_at')
    list_filter = ('zone', 'task_type', 'done_date')
    search_fields = ('task_type__name', 'zone__name', 'area__name', 'road__name', 'done_by__username')
    readonly_fields = ('created_at',)
    date_hierarchy = 'done_date'


@admin.register(HorticultureWorker, site=admin_site)
class HorticultureWorkerAdmin(admin.ModelAdmin):
    list_display = ('name', 'phone', 'pay_code', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('name', 'phone', 'pay_code')


@admin.register(HorticultureWorkerArea, site=admin_site)
class HorticultureWorkerAreaAdmin(admin.ModelAdmin):
    list_display = ('worker', 'area', 'assigned_by', 'assigned_at', 'is_active')
    list_filter = ('is_active', 'area__zone')
    search_fields = ('worker__name', 'area__name')
    readonly_fields = ('assigned_at',)


@admin.register(HorticultureAttendanceRecord, site=admin_site)
class HorticultureAttendanceRecordAdmin(admin.ModelAdmin):
    list_display = ('worker', 'date', 'half', 'status', 'marked_by', 'submitted_at')
    list_filter = ('date', 'half', 'status')
    search_fields = ('worker__name', 'worker__pay_code')
    readonly_fields = ('submitted_at',)
    date_hierarchy = 'date'


@admin.register(HorticultureDailyAssignment, site=admin_site)
class HorticultureDailyAssignmentAdmin(admin.ModelAdmin):
    list_display = ('worker', 'area', 'date', 'session', 'task_type', 'status', 'assigned_by', 'assigned_at')
    list_filter = ('date', 'session', 'task_type', 'area__zone')
    search_fields = ('worker__name', 'area__name', 'task_type__name')
    readonly_fields = ('assigned_at', 'photo_uploaded_at', 'photo_before_uploaded_at', 'photo_after_uploaded_at')
    date_hierarchy = 'date'


@admin.register(HorticultureAreaStock, site=admin_site)
class HorticultureAreaStockAdmin(admin.ModelAdmin):
    list_display = ('area', 'item_name', 'quantity', 'unit', 'low_stock_threshold', 'last_updated')
    list_filter = ('area__zone',)
    search_fields = ('item_name', 'area__name')
    readonly_fields = ('last_updated',)


@admin.register(HorticultureStockRequest, site=admin_site)
class HorticultureStockRequestAdmin(admin.ModelAdmin):
    list_display = ('item_name', 'area', 'quantity', 'unit', 'requested_by', 'status', 'is_urgent', 'created_at')
    list_filter = ('status', 'is_urgent', 'area__zone')
    search_fields = ('item_name', 'requested_by__username', 'area__name')
    readonly_fields = ('created_at',)


@admin.register(HorticultureAttendance, site=admin_site)
class HorticultureAttendanceAdmin(admin.ModelAdmin):
    list_display = ('supervisor', 'date', 'submitted_at')
    list_filter = ('date',)
    search_fields = ('supervisor__username', 'supervisor__first_name', 'supervisor__last_name')
    readonly_fields = ('submitted_at',)
    date_hierarchy = 'date'


@admin.register(WorkerAttendance, site=admin_site)
class WorkerAttendanceAdmin(admin.ModelAdmin):
    list_display = ('attendance', 'worker', 'status')
    list_filter = ('status', 'attendance__date')
    search_fields = ('worker__username', 'worker__first_name', 'worker__last_name')

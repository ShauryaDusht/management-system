from django.contrib import admin

from .models import (
    HKAttendance,
    HKCaretaker,
    HKComplaint,
    HKDailyTask,
    HKDepartment,
    HKExtraWork,
    HKLocation,
    HKPenalty,
    HKSupervisor,
    HKTaskTemplate,
    HKWorker,
)


@admin.register(HKDepartment)
class HKDepartmentAdmin(admin.ModelAdmin):
    list_display = ('name', 'dept_type', 'is_active')
    search_fields = ('name', 'dept_type', 'description')
    list_filter = ('dept_type', 'is_active')


@admin.register(HKLocation)
class HKLocationAdmin(admin.ModelAdmin):
    list_display = ('name', 'department', 'code', 'floor_or_area', 'is_active')
    search_fields = ('name', 'code', 'floor_or_area', 'department__name')
    list_filter = ('department', 'is_active')


@admin.register(HKSupervisor)
class HKSupervisorAdmin(admin.ModelAdmin):
    list_display = ('name', 'phone', 'is_active')
    search_fields = ('name', 'phone', 'areas_managed')
    filter_horizontal = ('departments',)
    list_filter = ('is_active',)


@admin.register(HKCaretaker)
class HKCaretakerAdmin(admin.ModelAdmin):
    list_display = ('name', 'phone', 'supervisor', 'is_active')
    search_fields = ('name', 'phone', 'supervisor__name')
    filter_horizontal = ('locations',)
    list_filter = ('is_active', 'supervisor')


@admin.register(HKWorker)
class HKWorkerAdmin(admin.ModelAdmin):
    list_display = ('name', 'worker_type', 'shift', 'department', 'location', 'caretaker', 'is_active')
    search_fields = ('name', 'phone', 'punching_no', 'department__name', 'location__name')
    list_filter = ('worker_type', 'shift', 'department', 'is_active', 'is_reliever')


@admin.register(HKTaskTemplate)
class HKTaskTemplateAdmin(admin.ModelAdmin):
    list_display = ('name', 'department', 'location', 'frequency', 'worker_type', 'shift', 'order', 'is_active')
    search_fields = ('name', 'description', 'area', 'department__name', 'location__name')
    list_filter = ('department', 'frequency', 'worker_type', 'shift', 'is_active')


@admin.register(HKAttendance)
class HKAttendanceAdmin(admin.ModelAdmin):
    list_display = ('worker', 'date', 'status', 'marked_by', 'marked_at')
    search_fields = ('worker__name', 'worker__punching_no', 'note')
    list_filter = ('status', 'date')


@admin.register(HKDailyTask)
class HKDailyTaskAdmin(admin.ModelAdmin):
    list_display = ('task_name', 'worker', 'date', 'status', 'start_time', 'end_time', 'is_extra')
    search_fields = ('task_name', 'worker__name', 'area', 'description', 'completed_note')
    list_filter = ('status', 'date', 'worker__department', 'is_extra')


@admin.register(HKExtraWork)
class HKExtraWorkAdmin(admin.ModelAdmin):
    list_display = ('task_name', 'worker', 'date', 'is_done', 'assigned_by', 'created_at')
    search_fields = ('task_name', 'worker__name', 'description')
    list_filter = ('is_done', 'date')


@admin.register(HKComplaint)
class HKComplaintAdmin(admin.ModelAdmin):
    list_display = ('title', 'location', 'priority', 'status', 'assigned_to', 'created_at')
    search_fields = ('title', 'description', 'location__name', 'assigned_to__name')
    list_filter = ('priority', 'status', 'created_at')


@admin.register(HKPenalty)
class HKPenaltyAdmin(admin.ModelAdmin):
    list_display = ('violation_type', 'worker', 'location', 'points', 'amount', 'date', 'noted_by')
    search_fields = ('violation_type', 'description', 'worker__name', 'location__name')
    list_filter = ('date', 'location')

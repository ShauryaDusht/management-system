from django.contrib import admin
from config.admin import admin_site

from .models import ItemConsumptionReport, MonthlyReport, SupervisorMonthlyReport, WorkerMonthlyReport


@admin.register(MonthlyReport, site=admin_site)
class MonthlyReportAdmin(admin.ModelAdmin):
    list_display = ('id', 'month', 'year', 'generated_at', 'generated_by')
    search_fields = ('year',)
    list_filter = ('year', 'month')


@admin.register(WorkerMonthlyReport, site=admin_site)
class WorkerMonthlyReportAdmin(admin.ModelAdmin):
    list_display = ('id', 'worker', 'month', 'year', 'generated_at')
    search_fields = ('worker__name', 'year')
    list_filter = ('year', 'month')


@admin.register(SupervisorMonthlyReport, site=admin_site)
class SupervisorMonthlyReportAdmin(admin.ModelAdmin):
    list_display = ('id', 'supervisor', 'month', 'year', 'generated_at')
    search_fields = ('supervisor__username', 'supervisor__first_name', 'supervisor__last_name', 'year')
    list_filter = ('year', 'month')


@admin.register(ItemConsumptionReport, site=admin_site)
class ItemConsumptionReportAdmin(admin.ModelAdmin):
    list_display = ('id', 'month', 'year', 'generated_at', 'generated_by')
    search_fields = ('year',)
    list_filter = ('year', 'month')

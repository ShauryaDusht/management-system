from django.contrib import admin

from .models import MonthlyReport, WorkerMonthlyReport


@admin.register(MonthlyReport)
class MonthlyReportAdmin(admin.ModelAdmin):
    list_display = ('id', 'month', 'year', 'generated_at', 'generated_by')
    search_fields = ('year',)
    list_filter = ('year', 'month')


@admin.register(WorkerMonthlyReport)
class WorkerMonthlyReportAdmin(admin.ModelAdmin):
    list_display = ('id', 'worker', 'month', 'year', 'generated_at')
    search_fields = ('worker__name', 'year')
    list_filter = ('year', 'month')

from django.contrib import admin
from config.admin import admin_site
from .models import HvacLog, HvacSupervisorLog, HvacPumpRating


class HvacLogAdmin(admin.ModelAdmin):
    list_display = ('id', 'date', 'time', 'shift', 'operator', 'setpoint', 'updated_at')
    list_filter = ('shift', 'date')
    search_fields = ('id', 'operator', 'date', 'time')
    date_hierarchy = 'date'


class HvacSupervisorLogAdmin(admin.ModelAdmin):
    list_display = ('date', 'shift', 'supervisor_name', 'status', 'updated_at')
    list_filter = ('shift', 'status', 'date')
    search_fields = ('supervisor_name', 'notes')
    date_hierarchy = 'date'


class HvacPumpRatingAdmin(admin.ModelAdmin):
    list_display = ('pump_key', 'name', 'max_a', 'max_v', 'range_a', 'range_v', 'updated_at')
    search_fields = ('pump_key', 'name')


for site in (admin.site, admin_site):
    site.register(HvacLog, HvacLogAdmin)
    site.register(HvacSupervisorLog, HvacSupervisorLogAdmin)
    site.register(HvacPumpRating, HvacPumpRatingAdmin)

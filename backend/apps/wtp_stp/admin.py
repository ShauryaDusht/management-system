from django.contrib import admin
from config.admin import admin_site
from .models import StationMeter, WtpReading, BlockMeter, BlockReading, SupervisorLog, GwssbBill


class StationMeterAdmin(admin.ModelAdmin):
    list_display = ('k', 'label', 'station', 'group_name', 'unit', 'cum', 'coef', 'updated_at')
    list_filter = ('station', 'group_name', 'cum')
    search_fields = ('k', 'label', 'group_name')


class WtpReadingAdmin(admin.ModelAdmin):
    list_display = ('id', 'date', 'shift', 'station', 'by', 'status', 'verified_by', 'updated_at')
    list_filter = ('station', 'shift', 'status', 'date')
    search_fields = ('station', 'by', 'verified_by', 'supervisor_note')
    date_hierarchy = 'date'


class BlockMeterAdmin(admin.ModelAdmin):
    list_display = ('sr', 'block', 'meter_no', 'updated_at')
    search_fields = ('sr', 'block', 'meter_no')
    ordering = ('sr',)


class BlockReadingAdmin(admin.ModelAdmin):
    list_display = ('month', 'date', 'by', 'updated_at')
    search_fields = ('month', 'date', 'by')
    ordering = ('-month',)


class SupervisorLogAdmin(admin.ModelAdmin):
    list_display = ('date', 'shift', 'supervisor_name', 'status', 'updated_at')
    list_filter = ('shift', 'status', 'date')
    search_fields = ('supervisor_name', 'notes', 'handover_notes')
    date_hierarchy = 'date'


class GwssbBillAdmin(admin.ModelAdmin):
    list_display = ('month', 'initial_reading', 'final_reading', 'net_consumption', 'rate_per_unit', 'bill_amount', 'status', 'by', 'updated_at')
    list_filter = ('status', 'month')
    search_fields = ('month', 'bill_no', 'by', 'remarks')
    ordering = ('-month',)


# Register in both default and restricted admin site
for site in (admin.site, admin_site):
    site.register(StationMeter, StationMeterAdmin)
    site.register(WtpReading, WtpReadingAdmin)
    site.register(BlockMeter, BlockMeterAdmin)
    site.register(BlockReading, BlockReadingAdmin)
    site.register(SupervisorLog, SupervisorLogAdmin)
    site.register(GwssbBill, GwssbBillAdmin)


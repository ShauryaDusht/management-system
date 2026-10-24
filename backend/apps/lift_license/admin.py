from django.contrib import admin
from .models import LiftLicense


@admin.register(LiftLicense)
class LiftLicenseAdmin(admin.ModelAdmin):
    list_display = ('lift', 'no', 'loc', 'prov', 'frm', 'till', 'order')
    list_filter = ('loc', 'prov')
    search_fields = ('lift', 'no', 'loc', 'prov', 'eng', 'rem')
    ordering = ('order', 'id')

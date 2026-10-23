from django.contrib import admin
from .models import (
    EstateSettings,
    BillingCycle,
    Shop,
    ShopDemandNote,
    Contractor,
    ContractorDemandNote,
)


@admin.register(EstateSettings)
class EstateSettingsAdmin(admin.ModelAdmin):
    list_display = ('singleton', 'headline', 'note_no_prefix', 'first_note_no', 'signatory_name')


@admin.register(BillingCycle)
class BillingCycleAdmin(admin.ModelAdmin):
    list_display = ('month', 'label', 'is_active', 'created_at')
    search_fields = ('month', 'label')


@admin.register(Shop)
class ShopAdmin(admin.ModelAdmin):
    list_display = ('sl', 'name', 'fixed', 'default_rate', 'default_water', 'is_active')
    search_fields = ('name',)
    list_filter = ('fixed', 'is_active')


@admin.register(ShopDemandNote)
class ShopDemandNoteAdmin(admin.ModelAdmin):
    list_display = ('shop', 'cycle_month', 'note_no', 'units', 'rate', 'water', 'total_amount')
    search_fields = ('shop__name', 'note_no', 'cycle_month')
    list_filter = ('cycle_month', 'fixed')


@admin.register(Contractor)
class ContractorAdmin(admin.ModelAdmin):
    list_display = ('sl', 'name', 'to_line', 'is_active')
    search_fields = ('name', 'to_line')


@admin.register(ContractorDemandNote)
class ContractorDemandNoteAdmin(admin.ModelAdmin):
    list_display = ('contractor', 'cycle_month', 'note_no', 'period_type', 'total_amount')
    search_fields = ('contractor__name', 'note_no', 'cycle_month')
    list_filter = ('cycle_month', 'period_type')

from django.contrib import admin
from django import forms
from django.utils import timezone
from config.admin import admin_site
from .models import Category, Item, ItemRequest, ItemRequestBatch, ItemIssue, PurchaseRequest, RequisitionItem, StockEntry


class ItemIssueAdminForm(forms.ModelForm):
    class Meta:
        model = ItemIssue
        fields = '__all__'
        widgets = {
            'expected_return_date': forms.DateInput(attrs={'type': 'date'}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if 'expected_return_date' in self.fields:
            self.fields['expected_return_date'].widget.attrs['min'] = timezone.localdate().isoformat()

    def clean_expected_return_date(self):
        expected_return_date = self.cleaned_data.get('expected_return_date')
        if (
            expected_return_date
            and expected_return_date < timezone.localdate()
            and (not self.instance.pk or 'expected_return_date' in self.changed_data)
        ):
            raise forms.ValidationError('Expected return date cannot be in the past.')
        return expected_return_date


@admin.register(Category, site=admin_site)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'description']
    search_fields = ['name']


@admin.register(Item, site=admin_site)
class ItemAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'item_type', 'unit', 'total_quantity',
                    'available_quantity', 'threshold_quantity', 'status']
    list_filter = ['item_type', 'category']
    search_fields = ['name', 'description']
    readonly_fields = ['created_at', 'updated_at']

    def status(self, obj):
        return obj.status


@admin.register(StockEntry, site=admin_site)
class StockEntryAdmin(admin.ModelAdmin):
    list_display = ['item', 'quantity_added', 'added_by', 'added_at', 'notes']
    list_filter = ['item__category']
    search_fields = ['item__name']
    readonly_fields = ['added_at']


class ItemRequestInline(admin.TabularInline):
    model = ItemRequest
    extra = 1
    fields = ['item', 'quantity_requested', 'status', 'units_remaining']
    readonly_fields = ['status', 'units_remaining']


@admin.register(ItemRequestBatch, site=admin_site)
class ItemRequestBatchAdmin(admin.ModelAdmin):
    list_display = ['id', 'requested_by', 'item_count', 'is_urgent', 'requested_at']
    list_filter = ['is_urgent', 'requested_at']
    search_fields = ['requested_by__username', 'requested_by__first_name', 'requested_by__last_name', 'purpose']
    readonly_fields = ['requested_at']
    inlines = [ItemRequestInline]

    def item_count(self, obj):
        return obj.requests.count()

    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)
        if change:
            form.instance.requests.update(
                requested_by=form.instance.requested_by,
                purpose=form.instance.purpose,
                notes=form.instance.notes,
                is_urgent=form.instance.is_urgent,
            )

    def save_formset(self, request, form, formset, change):
        instances = formset.save(commit=False)
        for obj in formset.deleted_objects:
            obj.delete()
        for obj in instances:
            if isinstance(obj, ItemRequest):
                obj.requested_by = form.instance.requested_by
                obj.purpose = form.instance.purpose
                obj.notes = form.instance.notes
                obj.is_urgent = form.instance.is_urgent
                if obj.item_id and not obj.units_remaining:
                    obj.units_remaining = obj.item.available_quantity
            obj.save()
        formset.save_m2m()


class RequisitionItemInline(admin.TabularInline):
    model = RequisitionItem
    extra = 0
    fields = ['inventory_item', 'quantity', 'unit', 'created_at']
    readonly_fields = ['created_at']


@admin.register(ItemRequest, site=admin_site)
class ItemRequestAdmin(admin.ModelAdmin):
    list_display = ['id', 'batch', 'item', 'requested_by', 'quantity_requested', 'status', 'requested_at']
    list_filter = ['status']
    search_fields = ['item__name', 'requested_by__username', 'batch__purpose']
    readonly_fields = ['requested_at', 'reviewed_at']
    inlines = [RequisitionItemInline]


@admin.register(ItemIssue, site=admin_site)
class ItemIssueAdmin(admin.ModelAdmin):
    form = ItemIssueAdminForm
    list_display = [
        'id', 'request', 'issued_by', 'issued_quantity', 'issued_at',
        'returned_at', 'usage_finalized',
    ]
    list_filter = ['usage_finalized']
    search_fields = ['request__item__name']
    readonly_fields = ['issued_at', 'usage_finalized_at']


@admin.register(PurchaseRequest, site=admin_site)
class PurchaseRequestAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'item_name', 'item_type', 'requested_by', 'quantity_requested',
        'urgency', 'status', 'created_at', 'decided_at',
    ]
    list_filter = ['status', 'urgency', 'category']
    search_fields = ['item_name', 'requested_by__username', 'requested_by__first_name', 'requested_by__last_name']
    readonly_fields = ['created_at', 'updated_at', 'decided_at']

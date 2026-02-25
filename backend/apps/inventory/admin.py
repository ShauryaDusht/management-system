from django.contrib import admin
from .models import Category, Item, ItemRequest, ItemIssue, StockEntry


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'description']
    search_fields = ['name']


@admin.register(Item)
class ItemAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'item_type', 'unit', 'total_quantity',
                    'available_quantity', 'threshold_quantity', 'status']
    list_filter = ['item_type', 'category']
    search_fields = ['name', 'description']
    readonly_fields = ['created_at', 'updated_at']

    def status(self, obj):
        return obj.status


@admin.register(StockEntry)
class StockEntryAdmin(admin.ModelAdmin):
    list_display = ['item', 'quantity_added', 'added_by', 'added_at', 'notes']
    list_filter = ['item__category']
    search_fields = ['item__name']
    readonly_fields = ['added_at']


@admin.register(ItemRequest)
class ItemRequestAdmin(admin.ModelAdmin):
    list_display = ['id', 'item', 'requested_by', 'quantity_requested', 'status', 'requested_at']
    list_filter = ['status']
    search_fields = ['item__name', 'requested_by__username']
    readonly_fields = ['requested_at', 'reviewed_at']


@admin.register(ItemIssue)
class ItemIssueAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'request', 'issued_by', 'issued_quantity', 'issued_at',
        'returned_at', 'usage_finalized',
    ]
    list_filter = ['usage_finalized']
    search_fields = ['request__item__name']
    readonly_fields = ['issued_at', 'usage_finalized_at']

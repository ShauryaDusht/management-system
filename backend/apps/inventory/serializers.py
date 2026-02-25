from rest_framework import serializers
from .models import Category, Item, ItemRequest, ItemIssue, StockEntry


class CategorySerializer(serializers.ModelSerializer):
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ['id', 'name', 'description', 'item_count']

    def get_item_count(self, obj):
        return obj.items.count()


class ItemSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    status = serializers.ReadOnlyField()
    is_below_threshold = serializers.ReadOnlyField()

    class Meta:
        model = Item
        fields = [
            'id', 'name', 'category', 'category_name', 'item_type', 'unit',
            'total_quantity', 'available_quantity', 'threshold_quantity',
            'unit_cost', 'description', 'location', 'status',
            'is_below_threshold', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'available_quantity', 'created_at', 'updated_at']


# ── NEW: StockEntry serializer ───────────────────────────────────────────────

class StockEntrySerializer(serializers.ModelSerializer):
    added_by_name = serializers.CharField(source='added_by.get_full_name', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_unit = serializers.CharField(source='item.unit', read_only=True)

    class Meta:
        model = StockEntry
        fields = [
            'id', 'item', 'item_name', 'item_unit',
            'quantity_added', 'added_by', 'added_by_name',
            'added_at', 'notes',
        ]
        read_only_fields = ['id', 'added_by', 'added_at']


# ── Unchanged from Phase 1 ───────────────────────────────────────────────────

class ItemRequestSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.CharField(source='requested_by.get_full_name', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_unit = serializers.CharField(source='item.unit', read_only=True)
    item_type = serializers.CharField(source='item.item_type', read_only=True)

    class Meta:
        model = ItemRequest
        fields = [
            'id', 'item', 'item_name', 'item_unit', 'item_type',
            'requested_by', 'requested_by_name',
            'approved_by', 'approved_by_name',
            'quantity_requested', 'purpose', 'status',
            'rejection_reason', 'requested_at', 'reviewed_at',
        ]
        read_only_fields = [
            'id', 'requested_by', 'approved_by', 'status',
            'rejection_reason', 'requested_at', 'reviewed_at',
        ]


class ItemRequestReviewSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=['approve', 'reject'])
    rejection_reason = serializers.CharField(required=False, allow_blank=True)

    def validate(self, data):
        if data['action'] == 'reject' and not data.get('rejection_reason'):
            raise serializers.ValidationError({'rejection_reason': 'Reason required when rejecting.'})
        return data


class ItemIssueSerializer(serializers.ModelSerializer):
    issued_by_name = serializers.CharField(source='issued_by.get_full_name', read_only=True)
    item_name = serializers.CharField(source='request.item.name', read_only=True)
    item_type = serializers.CharField(source='request.item.item_type', read_only=True)
    item_unit = serializers.CharField(source='request.item.unit', read_only=True)
    requested_by_name = serializers.CharField(source='request.requested_by.get_full_name', read_only=True)
    return_recorded_by_name = serializers.CharField(source='return_recorded_by.get_full_name', read_only=True)

    class Meta:
        model = ItemIssue
        fields = [
            'id', 'request', 'item_name', 'item_type', 'item_unit',
            'requested_by_name', 'issued_by', 'issued_by_name',
            'issued_quantity', 'issued_at',
            # Asset return
            'expected_return_date', 'returned_quantity', 'returned_at',
            'condition_on_return', 'return_recorded_by', 'return_recorded_by_name',
            # Consumable finalization
            'actual_quantity_used', 'usage_finalized', 'usage_finalized_at',
            'notes',
        ]
        read_only_fields = [
            'id', 'issued_by', 'issued_at',
            'returned_at', 'return_recorded_by',
            'usage_finalized_at',
        ]


# ── NEW: Action serializers for Phase 2 workflows ────────────────────────────

class ReturnAssetSerializer(serializers.Serializer):
    """Manager records return of an asset."""
    returned_quantity = serializers.IntegerField(min_value=1)
    condition_on_return = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate_returned_quantity(self, value):
        issue = self.context.get('issue')
        if issue and value > issue.issued_quantity:
            raise serializers.ValidationError(
                f"Cannot return more than issued quantity ({issue.issued_quantity})."
            )
        return value


class FinalizeConsumableSerializer(serializers.Serializer):
    """Supervisor finalizes actual consumable usage."""
    actual_quantity_used = serializers.IntegerField(min_value=0)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate_actual_quantity_used(self, value):
        issue = self.context.get('issue')
        if issue and value > issue.issued_quantity:
            raise serializers.ValidationError(
                f"Used quantity cannot exceed issued quantity ({issue.issued_quantity})."
            )
        return value


# ── NEW: Item History serializer (used in item detail/history view) ───────────

class ItemHistorySerializer(serializers.Serializer):
    """
    Combines stock entries and issue records for a single item
    into a unified chronological history list.
    """
    type = serializers.CharField()       # 'stock_added' | 'issued' | 'returned' | 'finalized'
    date = serializers.DateTimeField()
    quantity = serializers.IntegerField()
    person = serializers.CharField()
    detail = serializers.CharField()


# ── NEW: User activity serializer (admin views per-user history) ─────────────

class UserActivitySerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_unit = serializers.CharField(source='item.unit', read_only=True)

    class Meta:
        model = ItemRequest
        fields = [
            'id', 'item_name', 'item_unit', 'quantity_requested',
            'purpose', 'status', 'requested_at', 'reviewed_at',
        ]

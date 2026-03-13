from rest_framework import serializers

from .models import Category, Item, ItemIssue, ItemRequest, PurchaseRequest, StockEntry


# Plan to remove this shim in a future cleanup once all callers are updated.
from .pagination import StandardPagination


class CategorySerializer(serializers.ModelSerializer):
    # Uses annotated item_count from the view queryset; no per-category query.
    item_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Category
        fields = ['id', 'name', 'description', 'item_count']


def money_number(value):
    return float(value or 0)


class ItemSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    status = serializers.ReadOnlyField()
    is_below_threshold = serializers.ReadOnlyField()
    unit_cost_missing = serializers.SerializerMethodField()
    unit_price = serializers.SerializerMethodField()
    stock_total_amount = serializers.SerializerMethodField()
    available_stock_amount = serializers.SerializerMethodField()

    class Meta:
        model = Item
        fields = [
            'id', 'item_code', 'name', 'category', 'category_name', 'item_type', 'unit',
            'total_quantity', 'available_quantity', 'threshold_quantity',
            'unit_cost', 'unit_price', 'stock_total_amount', 'available_stock_amount',
            'unit_cost_missing', 'description', 'location', 'status',
            'is_below_threshold', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_unit_cost_missing(self, obj):
        return obj.unit_cost is None

    def get_unit_price(self, obj):
        return money_number(obj.unit_price)

    def get_stock_total_amount(self, obj):
        return money_number(obj.stock_total_amount)

    def get_available_stock_amount(self, obj):
        return money_number(obj.available_stock_amount)


class StockEntrySerializer(serializers.ModelSerializer):
    added_by_name = serializers.CharField(source='added_by.get_full_name', read_only=True)
    item_code = serializers.CharField(source='item.item_code', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_unit = serializers.CharField(source='item.unit', read_only=True)
    item_unit_price = serializers.SerializerMethodField()
    added_stock_amount = serializers.SerializerMethodField()

    class Meta:
        model = StockEntry
        fields = [
            'id', 'item', 'item_code', 'item_name', 'item_unit',
            'item_unit_price', 'added_stock_amount',
            'quantity_added', 'added_by', 'added_by_name',
            'added_at', 'notes',
        ]
        read_only_fields = ['id', 'added_by', 'added_at']

    def get_item_unit_price(self, obj):
        return money_number(getattr(obj.item, 'unit_price', 0))

    def get_added_stock_amount(self, obj):
        return money_number((getattr(obj.item, 'unit_price', 0) or 0) * (obj.quantity_added or 0))


class ItemRequestSerializer(serializers.ModelSerializer):
    requester = serializers.PrimaryKeyRelatedField(source='requested_by', read_only=True)
    requester_name = serializers.SerializerMethodField()
    requester_phone = serializers.SerializerMethodField()
    requester_role = serializers.CharField(source='requested_by.role', read_only=True)
    item_code = serializers.CharField(source='item.item_code', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_available = serializers.IntegerField(source='item.available_quantity', read_only=True)
    item_threshold = serializers.IntegerField(source='item.threshold_quantity', read_only=True)
    item_unit = serializers.CharField(source='item.unit', read_only=True)
    item_type = serializers.CharField(source='item.item_type', read_only=True)
    item_description = serializers.CharField(source='item.description', read_only=True)
    item_unit_price = serializers.SerializerMethodField()
    item_stock_total_amount = serializers.SerializerMethodField()
    request_total_amount = serializers.SerializerMethodField()
    is_low_stock = serializers.BooleanField(source='item.is_below_threshold', read_only=True)

    reviewed_by = serializers.PrimaryKeyRelatedField(source='approved_by', read_only=True)
    reviewed_by_name = serializers.SerializerMethodField()

    # Backward-compatible aliases
    requested_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    reason = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(source='requested_at', read_only=True)
    updated_at = serializers.SerializerMethodField()

    def to_internal_value(self, data):
        payload = data.copy()
        if payload.get('reason') and not payload.get('purpose'):
            payload['purpose'] = payload.get('reason')
        if payload.get('requester') and not payload.get('requested_by'):
            payload['requested_by'] = payload.get('requester')
        if payload.get('reviewed_by') and not payload.get('approved_by'):
            payload['approved_by'] = payload.get('reviewed_by')
        payload.pop('reason', None)
        payload.pop('requester', None)
        payload.pop('reviewed_by', None)
        return super().to_internal_value(payload)

    def get_requester_name(self, obj):
        return obj.requested_by.get_full_name() or obj.requested_by.username

    def get_requester_phone(self, obj):
        return getattr(obj.requested_by, 'phone', '') or ''

    def get_reviewed_by_name(self, obj):
        if obj.approved_by:
            return obj.approved_by.get_full_name() or obj.approved_by.username
        return None

    def get_item_unit_price(self, obj):
        return money_number(getattr(obj.item, 'unit_price', 0))

    def get_item_stock_total_amount(self, obj):
        return money_number(getattr(obj.item, 'stock_total_amount', 0))

    def get_request_total_amount(self, obj):
        return money_number((getattr(obj.item, 'unit_price', 0) or 0) * (obj.quantity_requested or 0))

    def get_requested_by_name(self, obj):
        return self.get_requester_name(obj)

    def get_approved_by_name(self, obj):
        return self.get_reviewed_by_name(obj)

    def get_reason(self, obj):
        return obj.purpose

    def get_updated_at(self, obj):
        return obj.reviewed_at or obj.requested_at

    class Meta:
        model = ItemRequest
        fields = '__all__'
        read_only_fields = [
            'id', 'requested_by', 'approved_by', 'requested_at', 'reviewed_at',
        ]


class ItemRequestReviewSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=['approve', 'reject'])
    rejection_reason = serializers.CharField(required=False, allow_blank=True)

    def validate(self, data):
        if data['action'] == 'reject' and not data.get('rejection_reason'):
            raise serializers.ValidationError({'rejection_reason': 'Reason required when rejecting.'})
        return data


class PurchaseRequestSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.SerializerMethodField()
    category_name = serializers.CharField(source='category.name', read_only=True)
    decided_by_name = serializers.SerializerMethodField()
    estimated_total_cost = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseRequest
        fields = [
            'id',
            'requested_by',
            'requested_by_name',
            'category',
            'category_name',
            'item_name',
            'item_type',
            'quantity_requested',
            'unit',
            'estimated_unit_cost',
            'estimated_total_cost',
            'reason',
            'needed_by',
            'urgency',
            'status',
            'admin_note',
            'decided_by',
            'decided_by_name',
            'decided_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'requested_by',
            'status',
            'admin_note',
            'decided_by',
            'decided_at',
            'created_at',
            'updated_at',
        ]

    def get_requested_by_name(self, obj):
        return obj.requested_by.get_full_name() or obj.requested_by.username

    def get_decided_by_name(self, obj):
        if not obj.decided_by:
            return None
        return obj.decided_by.get_full_name() or obj.decided_by.username

    def get_estimated_total_cost(self, obj):
        val = obj.estimated_total_cost
        return float(val) if val is not None else None


class ItemIssueSerializer(serializers.ModelSerializer):
    issued_by_name = serializers.CharField(source='issued_by.get_full_name', read_only=True)
    item_code = serializers.CharField(source='request.item.item_code', read_only=True)
    item_name = serializers.CharField(source='request.item.name', read_only=True)
    item_type = serializers.CharField(source='request.item.item_type', read_only=True)
    item_unit = serializers.CharField(source='request.item.unit', read_only=True)
    item_unit_price = serializers.SerializerMethodField()
    issue_total_amount = serializers.SerializerMethodField()
    requested_by_name = serializers.CharField(source='request.requested_by.get_full_name', read_only=True)
    return_recorded_by_name = serializers.CharField(source='return_recorded_by.get_full_name', read_only=True)
    area_name = serializers.SerializerMethodField()
    area_type = serializers.SerializerMethodField()

    def get_area_name(self, obj):
        try:
            from apps.housekeeping.models import HKStockRequest
            hk_req = HKStockRequest.objects.filter(
                inventory_request=obj.request
            ).select_related('area').first()
            if hk_req and hk_req.area:
                return hk_req.area.name
        except Exception:
            pass
        purpose = getattr(obj.request, 'purpose', '') or ''
        if purpose.startswith('[HK - '):
            end = purpose.find(']')
            if end > 6:
                return purpose[6:end]
        return None

    def get_area_type(self, obj):
        try:
            from apps.housekeeping.models import HKStockRequest
            hk_req = HKStockRequest.objects.filter(
                inventory_request=obj.request
            ).select_related('area').first()
            if hk_req and hk_req.area:
                return hk_req.area.area_type
        except Exception:
            pass
        return None

    def get_item_unit_price(self, obj):
        item = getattr(getattr(obj, 'request', None), 'item', None)
        return money_number(getattr(item, 'unit_price', 0))

    def get_issue_total_amount(self, obj):
        item = getattr(getattr(obj, 'request', None), 'item', None)
        return money_number((getattr(item, 'unit_price', 0) or 0) * (obj.issued_quantity or 0))

    class Meta:
        model = ItemIssue
        fields = [
            'id', 'request', 'item_code', 'item_name', 'item_type', 'item_unit',
            'item_unit_price', 'issue_total_amount',
            'requested_by_name', 'area_name', 'area_type', 'issued_by', 'issued_by_name',
            'issued_quantity', 'issued_at',
            'expected_return_date', 'returned_quantity', 'returned_at',
            'condition_on_return', 'return_recorded_by', 'return_recorded_by_name',
            'actual_quantity_used', 'usage_finalized', 'usage_finalized_at',
            'notes',
        ]
        read_only_fields = [
            'id', 'issued_by', 'issued_at',
            'returned_at', 'return_recorded_by',
            'usage_finalized_at',
        ]


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
    confirmed_zero_usage = serializers.BooleanField(required=False, default=False)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate_actual_quantity_used(self, value):
        issue = self.context.get('issue')
        if issue and value > issue.issued_quantity:
            raise serializers.ValidationError(
                f"Used quantity cannot exceed issued quantity ({issue.issued_quantity})."
            )
        return value


class ItemHistorySerializer(serializers.Serializer):
    type = serializers.CharField()
    date = serializers.DateTimeField()
    quantity = serializers.IntegerField()
    person = serializers.CharField()
    detail = serializers.CharField()


class UserActivitySerializer(serializers.ModelSerializer):
    item_code = serializers.CharField(source='item.item_code', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_unit = serializers.CharField(source='item.unit', read_only=True)
    item_unit_price = serializers.SerializerMethodField()
    request_total_amount = serializers.SerializerMethodField()

    class Meta:
        model = ItemRequest
        fields = [
            'id', 'item_code', 'item_name', 'item_unit', 'item_unit_price', 'request_total_amount',
            'quantity_requested', 'purpose', 'status', 'requested_at', 'reviewed_at',
        ]

    def get_item_unit_price(self, obj):
        return money_number(getattr(obj.item, 'unit_price', 0))

    def get_request_total_amount(self, obj):
        return money_number((getattr(obj.item, 'unit_price', 0) or 0) * (obj.quantity_requested or 0))

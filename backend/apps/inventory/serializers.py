from django.db import transaction
from django.db.models import Sum, Value, DecimalField
from django.db.models.functions import Coalesce
from rest_framework import serializers
from .models import Category, Item, ItemRequest, ItemRequestBatch, ItemIssue, ItemUsageLog, PurchaseRequest, StockEntry


# Plan to remove this shim in a future cleanup once all callers are updated.
from .pagination import StandardPagination


class CategorySerializer(serializers.ModelSerializer):
    # Uses annotated item_count from the view queryset — no per-category query.
    item_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Category
        fields = ['id', 'name', 'description', 'item_count']


class ItemSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    status = serializers.ReadOnlyField()
    is_below_threshold = serializers.ReadOnlyField()
    unit_cost_missing = serializers.SerializerMethodField()
    total_value = serializers.SerializerMethodField()

    class Meta:
        model = Item
        fields = [
            'id', 'item_code', 'name', 'category', 'category_name', 'item_type', 'unit',
            'total_quantity', 'available_quantity', 'threshold_quantity',
            'unit_cost', 'total_value', 'unit_cost_missing', 'description', 'status',
            'is_below_threshold', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'total_value', 'created_at', 'updated_at']

    def get_unit_cost_missing(self, obj):
        return obj.unit_cost is None

    def get_total_value(self, obj):
        if obj.unit_cost is None or obj.total_quantity is None:
            return 0
        return float(obj.unit_cost * obj.total_quantity)

    def validate_item_code(self, value):
        if value is None:
            return None
        value = str(value).strip()
        return value or None

    def validate(self, attrs):
        instance = self.instance
        total_quantity = attrs.get(
            'total_quantity',
            instance.total_quantity if instance else 0,
        )
        available_quantity = attrs.get(
            'available_quantity',
            instance.available_quantity if instance else 0,
        )
        if available_quantity > total_quantity:
            raise serializers.ValidationError({
                'available_quantity': 'Available quantity cannot exceed total quantity.'
            })
        return attrs


class StockEntrySerializer(serializers.ModelSerializer):
    added_by_name = serializers.CharField(source='added_by.get_full_name', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_code = serializers.CharField(source='item.item_code', read_only=True)
    item_unit = serializers.CharField(source='item.unit', read_only=True)

    class Meta:
        model = StockEntry
        fields = [
            'id', 'item', 'item_name', 'item_code', 'item_unit',
            'quantity_added', 'added_by', 'added_by_name',
            'added_at', 'notes',
        ]
        read_only_fields = ['id', 'added_by', 'added_at']


class ItemRequestSerializer(serializers.ModelSerializer):
    quantity_requested = serializers.IntegerField(min_value=1)
    requester = serializers.PrimaryKeyRelatedField(source='requested_by', read_only=True)
    requester_name = serializers.SerializerMethodField()
    requester_phone = serializers.SerializerMethodField()
    requester_role = serializers.CharField(source='requested_by.role', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_code = serializers.CharField(source='item.item_code', read_only=True)
    item_available = serializers.IntegerField(source='item.available_quantity', read_only=True)
    item_threshold = serializers.IntegerField(source='item.threshold_quantity', read_only=True)
    item_unit = serializers.CharField(source='item.unit', read_only=True)
    item_type = serializers.CharField(source='item.item_type', read_only=True)
    item_description = serializers.CharField(source='item.description', read_only=True)

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


class ItemRequestBatchLineSerializer(serializers.Serializer):
    item = serializers.PrimaryKeyRelatedField(queryset=Item.objects.all())
    quantity_requested = serializers.IntegerField(min_value=1)


class ItemRequestBatchSerializer(serializers.ModelSerializer):
    items = ItemRequestBatchLineSerializer(many=True, write_only=True)
    requests = ItemRequestSerializer(many=True, read_only=True)
    requester_name = serializers.SerializerMethodField()
    total_items = serializers.SerializerMethodField()

    class Meta:
        model = ItemRequestBatch
        fields = [
            'id', 'requested_by', 'requester_name', 'purpose', 'notes', 'is_urgent',
            'requested_at', 'total_items', 'items', 'requests',
        ]
        read_only_fields = ['id', 'requested_by', 'requested_at']

    def get_requester_name(self, obj):
        return obj.requested_by.get_full_name() or obj.requested_by.username

    def get_total_items(self, obj):
        return obj.requests.count()

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError('Add at least one item.')
        seen = set()
        for line in value:
            item_id = line['item'].id
            if item_id in seen:
                raise serializers.ValidationError('Each item can only appear once in a batch.')
            seen.add(item_id)
        return value

    @transaction.atomic
    def create(self, validated_data):
        lines = validated_data.pop('items')
        requested_by = validated_data['requested_by']
        batch = ItemRequestBatch.objects.create(**validated_data)
        ItemRequest.objects.bulk_create([
            ItemRequest(
                batch=batch,
                requested_by=requested_by,
                item=line['item'],
                quantity_requested=line['quantity_requested'],
                units_remaining=line['item'].available_quantity,
                purpose=batch.purpose,
                notes=batch.notes,
                is_urgent=batch.is_urgent,
                status=ItemRequest.Status.PENDING,
            )
            for line in lines
        ])
        return batch


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
    item_name = serializers.CharField(source='request.item.name', read_only=True)
    item_type = serializers.CharField(source='request.item.item_type', read_only=True)
    item_unit = serializers.CharField(source='request.item.unit', read_only=True)
    requested_by_name = serializers.CharField(source='request.requested_by.get_full_name', read_only=True)
    return_recorded_by_name = serializers.CharField(source='return_recorded_by.get_full_name', read_only=True)
    area_name = serializers.SerializerMethodField()
    area_type = serializers.SerializerMethodField()
    total_consumed = serializers.SerializerMethodField()

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
        # fallback: extract from purpose like "[HK - Hostel A] reason"
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

    def get_total_consumed(self, obj):
        if hasattr(obj, 'total_consumed') and obj.total_consumed is not None:
            return obj.total_consumed
        return obj.usage_logs.aggregate(
            total=Coalesce(
                Sum('quantity_used'),
                Value(0),
                output_field=DecimalField(max_digits=10, decimal_places=2),
            )
        )['total']

    class Meta:
        model = ItemIssue
        fields = [
            'id', 'request', 'item_name', 'item_type', 'item_unit',
            'requested_by_name', 'area_name', 'area_type', 'issued_by', 'issued_by_name',
            'issued_quantity', 'issued_at',
            'expected_return_date', 'returned_quantity', 'returned_at',
            'condition_on_return', 'return_recorded_by', 'return_recorded_by_name',
            'actual_quantity_used', 'usage_finalized', 'usage_finalized_at',
            'notes', 'total_consumed',
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


class ItemUsageLogSerializer(serializers.ModelSerializer):
    logged_by_name = serializers.CharField(source='logged_by.get_full_name', read_only=True)
    item_name = serializers.CharField(source='issue.request.item.name', read_only=True)
    item_unit = serializers.CharField(source='issue.request.item.unit', read_only=True)
    requested_by_name = serializers.CharField(source='issue.request.requested_by.get_full_name', read_only=True)

    class Meta:
        model = ItemUsageLog
        fields = [
            'id', 'issue', 'quantity_used', 'purpose', 'notes',
            'logged_at', 'logged_by', 'logged_by_name',
            'item_name', 'item_unit', 'requested_by_name',
        ]
        read_only_fields = [
            'id', 'logged_at', 'logged_by', 'logged_by_name',
            'item_name', 'item_unit', 'requested_by_name',
        ]


class ItemHistorySerializer(serializers.Serializer):
    type = serializers.CharField()
    date = serializers.DateTimeField()
    quantity = serializers.IntegerField()
    person = serializers.CharField()
    detail = serializers.CharField()


class UserActivitySerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_code = serializers.CharField(source='item.item_code', read_only=True)
    item_unit = serializers.CharField(source='item.unit', read_only=True)

    class Meta:
        model = ItemRequest
        fields = [
            'id', 'item_name', 'item_code', 'item_unit', 'quantity_requested',
            'purpose', 'status', 'requested_at', 'reviewed_at',
        ]

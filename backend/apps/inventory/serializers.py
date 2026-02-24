from rest_framework import serializers
from .models import Category, Item, ItemRequest, ItemIssue


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


class ItemRequestSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.CharField(source='requested_by.get_full_name', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_unit = serializers.CharField(source='item.unit', read_only=True)

    class Meta:
        model = ItemRequest
        fields = [
            'id', 'item', 'item_name', 'item_unit',
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
    """Used by manager to approve or reject a request."""
    action = serializers.ChoiceField(choices=['approve', 'reject'])
    rejection_reason = serializers.CharField(required=False, allow_blank=True)

    def validate(self, data):
        if data['action'] == 'reject' and not data.get('rejection_reason'):
            raise serializers.ValidationError({'rejection_reason': 'Reason required when rejecting.'})
        return data


class ItemIssueSerializer(serializers.ModelSerializer):
    issued_by_name = serializers.CharField(source='issued_by.get_full_name', read_only=True)
    item_name = serializers.CharField(source='request.item.name', read_only=True)
    requested_by_name = serializers.CharField(source='request.requested_by.get_full_name', read_only=True)

    class Meta:
        model = ItemIssue
        fields = [
            'id', 'request', 'item_name', 'requested_by_name',
            'issued_by', 'issued_by_name', 'issued_quantity', 'issued_at',
            'expected_return_date', 'returned_quantity', 'returned_at',
            'condition_on_return', 'notes',
        ]
        read_only_fields = ['id', 'issued_by', 'issued_at']

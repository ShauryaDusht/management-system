from django.db import transaction
from django.db.models import F
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import viewsets
from rest_framework.viewsets import ModelViewSet

from apps.users.permissions import IsAdmin, IsAdminOrManager
from .models import Category, Item, ItemRequest
from .serializers import CategorySerializer, ItemSerializer, ItemRequestSerializer


class ItemViewSet(ModelViewSet):
    queryset = Item.objects.all().order_by('-created_at')
    serializer_class = ItemSerializer
    pagination_class = None
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['item_type', 'category']
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'available_quantity', 'created_at']
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdmin()]
        return [IsAuthenticated()]


class CategoryViewSet(ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    pagination_class = None
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ['create', 'retrieve', 'update', 'partial_update', 'destroy']:
            return [IsAdmin()]
        return [IsAuthenticated()]


class AdjustStockView(APIView):
    permission_classes = [IsAdmin]

    @transaction.atomic
    def post(self, request, pk):
        action = request.data.get('action')
        quantity = request.data.get('quantity')

        try:
            quantity = int(quantity)
        except (TypeError, ValueError):
            return Response({'detail': 'Quantity must be a valid integer.'}, status=status.HTTP_400_BAD_REQUEST)

        if quantity <= 0:
            return Response({'detail': 'Quantity must be greater than 0.'}, status=status.HTTP_400_BAD_REQUEST)

        item = get_object_or_404(Item.objects.select_for_update(), pk=pk)

        if action == 'increase':
            item.available_quantity += quantity
            item.total_quantity += quantity
        elif action == 'decrease':
            if item.available_quantity - quantity < 0:
                return Response(
                    {'detail': 'Cannot reduce stock below 0.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            item.available_quantity -= quantity
            # Previously only available_quantity was updated, causing permanent drift
            # between total_quantity and actual stock on hand.
            item.total_quantity -= quantity
        else:
            return Response(
                {'detail': "Invalid action. Use 'increase' or 'decrease'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        item.save()
        return Response(ItemSerializer(item).data, status=status.HTTP_200_OK)


class ItemRequestViewSet(viewsets.ModelViewSet):
    serializer_class = ItemRequestSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        queryset = ItemRequest.objects.all().select_related('requested_by', 'item', 'approved_by')
        # use model properties instead of raw role string comparisons
        if user.is_admin or user.is_manager:
            return queryset
        return queryset.filter(requested_by=user)

    def perform_create(self, serializer):
        item = serializer.validated_data['item']
        serializer.save(
            requested_by=self.request.user,
            status=ItemRequest.Status.PENDING,
            units_remaining=item.available_quantity,
        )


class ApproveRequestView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        user = request.user
        if not (user.is_admin or user.is_manager):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        try:
            item_request = ItemRequest.objects.select_related('item').select_for_update().get(pk=pk)
        except ItemRequest.DoesNotExist:
            return Response({'error': 'Request not found'}, status=status.HTTP_404_NOT_FOUND)

        if item_request.status != ItemRequest.Status.PENDING:
            return Response({'error': 'Request is not pending'}, status=status.HTTP_400_BAD_REQUEST)

        item = item_request.item
        qty = item_request.quantity_requested

        # Verify stock is available before approving, but do NOT deduct yet.
        # Deduction happens in IssueItemView when item is physically handed out.
        if item.available_quantity < qty:
            return Response(
                {'error': f'Not enough stock. Available: {item.available_quantity}, Requested: {qty}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        item_request.status = ItemRequest.Status.APPROVED
        item_request.approved_by = user
        item_request.reviewed_at = timezone.now()
        item_request.units_remaining = item.available_quantity  # snapshot at approval time
        item_request.save(update_fields=['status', 'approved_by', 'reviewed_at', 'units_remaining'])

        return Response(ItemRequestSerializer(item_request).data, status=status.HTTP_200_OK)


class RejectRequestView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        user = request.user
        if not (user.is_admin or user.is_manager):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        try:
            # BUG 14 FIX: added select_for_update() — was missing, causing race condition
            item_request = ItemRequest.objects.select_for_update().get(pk=pk)
        except ItemRequest.DoesNotExist:
            return Response({'error': 'Request not found'}, status=status.HTTP_404_NOT_FOUND)

        if item_request.status != ItemRequest.Status.PENDING:
            return Response({'error': 'Request is not pending'}, status=status.HTTP_400_BAD_REQUEST)

        item_request.status = ItemRequest.Status.REJECTED
        item_request.approved_by = user
        item_request.reviewed_at = timezone.now()
        item_request.rejection_reason = request.data.get('rejection_reason', '')
        item_request.units_remaining = item_request.item.available_quantity
        item_request.save(update_fields=['status', 'approved_by', 'reviewed_at', 'rejection_reason', 'units_remaining'])

        return Response(ItemRequestSerializer(item_request).data, status=status.HTTP_200_OK)


class MarkUrgentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        item_request = get_object_or_404(ItemRequest, pk=pk)
        user = request.user

        is_owner = item_request.requested_by == user
        is_privileged = user.is_admin or user.is_manager
        if not (is_owner or is_privileged):
            return Response(
                {'error': 'Only the requester or a manager can change urgency.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        is_urgent_raw = request.data.get('is_urgent', True)
        if isinstance(is_urgent_raw, str):
            is_urgent_value = is_urgent_raw.strip().lower() in ['1', 'true', 'yes', 'on']
        else:
            is_urgent_value = bool(is_urgent_raw)

        item_request.is_urgent = is_urgent_value
        item_request.save(update_fields=['is_urgent'])
        return Response({'status': 'updated', 'is_urgent': item_request.is_urgent}, status=status.HTTP_200_OK)


class InventoryStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        stats = {
            'total_items': Item.objects.count(),
            'low_stock_count': Item.objects.filter(
                available_quantity__lte=F('threshold_quantity')
            ).count(),
            'out_of_stock_count': Item.objects.filter(available_quantity=0).count(),
            'pending_requests_count': ItemRequest.objects.filter(status='pending').count(),
        }
        return Response(stats, status=status.HTTP_200_OK)

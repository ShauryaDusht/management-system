from datetime import timedelta
from django.db import transaction
from django.db.models import F
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import IsAdminOrInventoryManager
from .models import Item, ItemRequest
from .serializers import ItemSerializer, ItemRequestSerializer


def _sync_horticulture_request_status(item_request, status_value):
    try:
        from apps.housekeeping.models import HKStockRequest
        hk_req = HKStockRequest.objects.filter(inventory_request=item_request).first()
        if hk_req:
            hk_req.status = status_value
            hk_req.save(update_fields=['status'])
    except Exception:
        pass
    try:
        from apps.horticulture.models import HorticultureStockRequest
        horti_req = HorticultureStockRequest.objects.filter(inventory_request=item_request).first()
        if horti_req:
            horti_req.status = status_value
            horti_req.save(update_fields=['status'])
    except Exception:
        pass


class AdjustStockView(APIView):
    permission_classes = [IsAdminOrInventoryManager]

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
            Item.objects.filter(pk=item.pk).update(
                available_quantity=F('available_quantity') + quantity,
                total_quantity=F('total_quantity') + quantity,
            )
        elif action == 'decrease':
            item.refresh_from_db()
            if item.available_quantity < quantity:
                return Response(
                    {'detail': 'Cannot reduce stock below 0.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            # only available_quantity decreases on a write-off
            Item.objects.filter(pk=item.pk).update(
                available_quantity=F('available_quantity') - quantity,
            )
        else:
            return Response(
                {'detail': "Invalid action. Use 'increase' or 'decrease'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        item.refresh_from_db()
        if item.available_quantity > item.total_quantity:
            raise AssertionError('available_quantity cannot exceed total_quantity')
        return Response(ItemSerializer(item).data, status=status.HTTP_200_OK)


class ItemRequestViewSet(viewsets.ModelViewSet):
    serializer_class = ItemRequestSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        queryset = ItemRequest.objects.all().select_related('requested_by', 'item', 'approved_by').prefetch_related('requisition_items__inventory_item')
        if user.can_manage_inventory:
            return queryset
        return queryset.filter(requested_by=user)

    def perform_create(self, serializer):
        serializer.save(
            requested_by=self.request.user,
            status=ItemRequest.Status.PENDING,
        )



class RejectRequestView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        user = request.user
        if not user.can_manage_inventory:
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        try:
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
        _sync_horticulture_request_status(item_request, ItemRequest.Status.REJECTED)
        from apps.core.notifications import notify_inventory_rejected
        notify_inventory_rejected(item_request, item_request.rejection_reason)

        return Response(ItemRequestSerializer(item_request).data, status=status.HTTP_200_OK)


class UndoRejectRequestView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        user = request.user
        if not user.can_manage_inventory:
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        try:
            item_request = ItemRequest.objects.select_for_update().get(pk=pk)
        except ItemRequest.DoesNotExist:
            return Response({'error': 'Request not found'}, status=status.HTTP_404_NOT_FOUND)

        if item_request.status != ItemRequest.Status.REJECTED:
            return Response({'error': 'Request is not rejected'}, status=status.HTTP_400_BAD_REQUEST)

        # Enforce single undo rule
        if '[UNDO_REJECTED]' in (item_request.notes or ''):
            return Response(
                {'error': 'Only one undo operation is permitted for this request.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check 24-hour window
        if item_request.reviewed_at and (timezone.now() - item_request.reviewed_at > timedelta(hours=24)):
            return Response(
                {'error': 'Undo rejection window (24 hours) has expired.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        item_request.status = ItemRequest.Status.PENDING
        item_request.approved_by = None
        item_request.reviewed_at = None
        item_request.rejection_reason = ''
        item_request.notes = ((item_request.notes or '').strip() + ' [UNDO_REJECTED]').strip()
        item_request.save(update_fields=['status', 'approved_by', 'reviewed_at', 'rejection_reason', 'notes'])
        _sync_horticulture_request_status(item_request, ItemRequest.Status.PENDING)

        return Response(ItemRequestSerializer(item_request).data, status=status.HTTP_200_OK)


class MarkUrgentView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        try:
            item_request = ItemRequest.objects.select_for_update().get(pk=pk)
        except ItemRequest.DoesNotExist:
            return Response({'error': 'Request not found.'}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        is_owner = item_request.requested_by == user
        is_privileged = user.can_manage_inventory
        if not (is_owner or is_privileged):
            return Response(
                {'error': 'Only the requester or an inventory manager can change urgency.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if item_request.status != ItemRequest.Status.PENDING:
            return Response(
                {'error': 'Urgency can only be changed on pending requests.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        is_urgent_raw = request.data.get('is_urgent', True)
        if isinstance(is_urgent_raw, str):
            is_urgent_value = is_urgent_raw.strip().lower() in ['1', 'true', 'yes', 'on']
        else:
            is_urgent_value = bool(is_urgent_raw)

        item_request.is_urgent = is_urgent_value
        item_request.save(update_fields=['is_urgent'])
        return Response({'status': 'updated', 'is_urgent': item_request.is_urgent}, status=status.HTTP_200_OK)



from django.utils import timezone
from django.db import transaction
from django.db.models import Sum, F, Count
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied

from .models import Category, Item, ItemRequest, ItemIssue, StockEntry, PurchaseRequest
from .serializers import (
    CategorySerializer, ItemSerializer,
    StockEntrySerializer,
    ItemRequestSerializer, ItemRequestReviewSerializer,
    ItemIssueSerializer,
    ReturnAssetSerializer, FinalizeConsumableSerializer,
    UserActivitySerializer,
    StandardPagination,
    PurchaseRequestSerializer,
)
from apps.users.permissions import IsAdmin, IsSupervisor
from .permissions import IsAdminOrInventoryManager


# ─────────────────────────────────────────────────
# CATEGORY VIEWS
# ─────────────────────────────────────────────────

class CategoryListCreateView(generics.ListCreateAPIView):
    serializer_class = CategorySerializer

    def get_queryset(self):
        return Category.objects.annotate(item_count=Count('items')).all()

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAdmin()]
        return [IsAuthenticated()]


class CategoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    def get_queryset(self):
        return Category.objects.annotate(item_count=Count('items')).all()

    serializer_class = CategorySerializer
    permission_classes = [IsAdmin]


# ─────────────────────────────────────────────────
# ITEM VIEWS
# ─────────────────────────────────────────────────

class ItemListCreateView(generics.ListCreateAPIView):
    serializer_class = ItemSerializer
    pagination_class = StandardPagination

    def get_queryset(self):
        qs = Item.objects.select_related('category').all()
        item_type = self.request.query_params.get('type')
        if item_type:
            qs = qs.filter(item_type=item_type)
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category_id=category)
        low_stock = self.request.query_params.get('low_stock')
        if low_stock == 'true':
            qs = qs.filter(
                available_quantity__gt=0,
                available_quantity__lte=F('threshold_quantity'),
            )
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(name__icontains=search)
        return qs

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAdmin()]
        return [IsAuthenticated()]


class ItemDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Item.objects.select_related('category').all()
    serializer_class = ItemSerializer

    def get_permissions(self):
        if self.request.method in ['PUT', 'PATCH', 'DELETE']:
            return [IsAdmin()]
        return [IsAuthenticated()]


class LowStockItemsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        items = Item.objects.filter(
            available_quantity__gt=0,
            available_quantity__lte=F('threshold_quantity'),
        ).select_related('category')
        serializer = ItemSerializer(items, many=True)
        return Response({'count': items.count(), 'items': serializer.data})


# ─────────────────────────────────────────────────
# ITEM HISTORY VIEW
# ─────────────────────────────────────────────────

class ItemHistoryView(APIView):
    permission_classes = [IsAdmin]

    # Max merged rows considered per request before pagination
    _MAX_MERGED_EVENTS = 400

    def get(self, request, pk):
        try:
            item = Item.objects.get(pk=pk)
        except Item.DoesNotExist:
            return Response({'detail': 'Item not found.'}, status=404)

        try:
            page = max(1, int(request.query_params.get('page', 1)))
            page_size = min(200, max(1, int(request.query_params.get('page_size', 50))))
        except (TypeError, ValueError):
            page = 1
            page_size = 50

        events = []

        for entry in StockEntry.objects.filter(item=item).select_related('added_by').order_by('-added_at'):
            events.append({
                'type': 'stock_added',
                'date': entry.added_at.isoformat(),
                '_sort_dt': entry.added_at,
                'quantity': entry.quantity_added,
                'person': entry.added_by.get_full_name() or entry.added_by.username,
                'detail': entry.notes or 'Stock replenished',
            })

        issues = (
            ItemIssue.objects
            .filter(request__item=item)
            .select_related('request__requested_by', 'issued_by', 'return_recorded_by')
            .order_by('-issued_at')
        )

        for issue in issues:
            supervisor = issue.request.requested_by.get_full_name() or issue.request.requested_by.username
            events.append({
                'type': 'issued',
                'date': issue.issued_at.isoformat(),
                '_sort_dt': issue.issued_at,
                'quantity': issue.issued_quantity,
                'person': supervisor,
                'detail': f"Issued for: {issue.request.purpose}",
            })
            if issue.returned_at:
                events.append({
                    'type': 'returned',
                    'date': issue.returned_at.isoformat(),
                    '_sort_dt': issue.returned_at,
                    'quantity': issue.returned_quantity,
                    'person': supervisor,
                    'detail': f"Condition: {issue.condition_on_return or 'Not noted'}",
                })
            if issue.usage_finalized and issue.usage_finalized_at:
                events.append({
                    'type': 'finalized',
                    'date': issue.usage_finalized_at.isoformat(),
                    '_sort_dt': issue.usage_finalized_at,
                    'quantity': issue.actual_quantity_used,
                    'person': supervisor,
                    'detail': f"Actual quantity used: {issue.actual_quantity_used}",
                })

        events.sort(key=lambda e: e['_sort_dt'], reverse=True)
        capped = len(events) > self._MAX_MERGED_EVENTS
        if capped:
            events = events[:self._MAX_MERGED_EVENTS]
        total_count = len(events)

        # Slice to the requested page
        start = (page - 1) * page_size
        end = start + page_size
        page_events = events[start:end]

        for event in page_events:
            del event['_sort_dt']

        return Response({
            'item': ItemSerializer(item).data,
            'total_count': total_count,
            'page': page,
            'page_size': page_size,
            'total_pages': max(1, (total_count + page_size - 1) // page_size),
            'capped': capped,
            'events': page_events,
        })


# ─────────────────────────────────────────────────
# STOCK ENTRY VIEWS
# ─────────────────────────────────────────────────

class StockEntryListCreateView(generics.ListCreateAPIView):
    serializer_class = StockEntrySerializer
    permission_classes = [IsAdmin]
    pagination_class = StandardPagination

    def get_queryset(self):
        qs = StockEntry.objects.select_related('item', 'added_by').all()
        item_id = self.request.query_params.get('item')
        if item_id:
            qs = qs.filter(item_id=item_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(added_by=self.request.user)


class ItemStockEntriesView(generics.ListAPIView):
    serializer_class = StockEntrySerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        return StockEntry.objects.filter(
            item_id=self.kwargs['pk']
        ).select_related('added_by')


# ─────────────────────────────────────────────────
# ITEM REQUEST VIEWS
# ─────────────────────────────────────────────────

class ItemRequestListCreateView(generics.ListCreateAPIView):
    serializer_class = ItemRequestSerializer
    pagination_class = StandardPagination

    def get_queryset(self):
        user = self.request.user
        qs = ItemRequest.objects.select_related('item', 'requested_by', 'approved_by')
        if getattr(user, 'role', '') in ['supervisor', 'caretaker']:
            return qs.filter(requested_by=user)
        return qs

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAuthenticated()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        if getattr(self.request.user, 'role', '') not in ['supervisor', 'caretaker']:
            raise PermissionDenied('Only supervisors/caretakers can create item requests.')
        serializer.save(requested_by=self.request.user)


class ItemRequestDetailView(generics.RetrieveAPIView):
    queryset = ItemRequest.objects.select_related('item', 'requested_by', 'approved_by')
    serializer_class = ItemRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        if getattr(user, 'role', '') in ['supervisor', 'caretaker']:
            return qs.filter(requested_by=user)
        return qs


class ReviewRequestView(APIView):
    permission_classes = [IsAdminOrInventoryManager]

    @transaction.atomic
    def post(self, request, pk):
        try:
            item_request = ItemRequest.objects.select_related('item').select_for_update().get(
                pk=pk, status=ItemRequest.Status.PENDING
            )
        except ItemRequest.DoesNotExist:
            return Response({'detail': 'Request not found or already reviewed.'}, status=404)

        serializer = ItemRequestReviewSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        action = serializer.validated_data['action']
        item = Item.objects.select_for_update().get(pk=item_request.item_id)

        if action == 'approve':
            available_to_reserve = item.available_quantity - item.reserved_quantity
            if item_request.quantity_requested > available_to_reserve:
                return Response(
                    {'detail': f'Insufficient stock. Available: {available_to_reserve} {item.unit}.'},
                    status=400
                )
            Item.objects.filter(pk=item.pk).update(
                reserved_quantity=F('reserved_quantity') + item_request.quantity_requested
            )
            item.refresh_from_db(fields=['available_quantity', 'reserved_quantity'])
            item_request.status = ItemRequest.Status.APPROVED
        else:
            item_request.status = ItemRequest.Status.REJECTED
            item_request.rejection_reason = serializer.validated_data.get('rejection_reason', '')

        item_request.approved_by = request.user
        item_request.reviewed_at = timezone.now()
        item_request.units_remaining = max(item.available_quantity - item.reserved_quantity, 0)
        item_request.save()

        return Response(ItemRequestSerializer(item_request).data)


class IssueItemView(APIView):
    permission_classes = [IsAdminOrInventoryManager]

    @transaction.atomic
    def post(self, request, pk):
        try:
            item_request = ItemRequest.objects.select_for_update().get(
                pk=pk, status=ItemRequest.Status.APPROVED
            )
        except ItemRequest.DoesNotExist:
            return Response({'detail': 'Approved request not found.'}, status=404)

        issued_qty = request.data.get('issued_quantity', item_request.quantity_requested)
        try:
            issued_qty = int(issued_qty)
        except (TypeError, ValueError):
            return Response({'detail': 'Invalid quantity.'}, status=400)

        if issued_qty <= 0:
            return Response({'detail': 'Issued quantity must be greater than 0.'}, status=400)
        if issued_qty > item_request.quantity_requested:
            return Response(
                {'detail': 'Issued quantity cannot exceed requested quantity.'},
                status=400
            )

        try:
            item = Item.objects.select_for_update().get(pk=item_request.item_id)
        except Item.DoesNotExist:
            return Response({'detail': 'Item not found.'}, status=404)

        if issued_qty > item.available_quantity:
            return Response(
                {'detail': f'Insufficient stock. Available: {item.available_quantity}.'},
                status=400
            )

        reserved_to_release = min(item.reserved_quantity, item_request.quantity_requested)
        Item.objects.filter(pk=item.pk).update(
            available_quantity=F('available_quantity') - issued_qty,
            total_quantity=F('total_quantity') - issued_qty,
            reserved_quantity=F('reserved_quantity') - reserved_to_release,
        )

        issue = ItemIssue.objects.create(
            request=item_request,
            issued_by=request.user,
            issued_quantity=issued_qty,
            expected_return_date=request.data.get('expected_return_date'),
            notes=request.data.get('notes', ''),
        )

        item_request.status = ItemRequest.Status.ISSUED
        item_request.save()
        try:
            from apps.housekeeping.models import HKStockRequest
            hk_req = HKStockRequest.objects.filter(inventory_request=item_request).first()
            if hk_req:
                hk_req.status = 'issued'
                hk_req.save(update_fields=['status'])
        except Exception:
            pass

        return Response(ItemIssueSerializer(issue).data, status=201)


# ─────────────────────────────────────────────────
# ITEM ISSUE VIEWS
# ─────────────────────────────────────────────────

class ItemIssueListView(generics.ListAPIView):
    serializer_class = ItemIssueSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardPagination

    def get_queryset(self):
        user = self.request.user
        qs = ItemIssue.objects.select_related(
            'request__item', 'request__requested_by', 'issued_by', 'return_recorded_by'
        )
        if getattr(user, 'role', '') in ['supervisor', 'caretaker']:
            return qs.filter(request__requested_by=user)
        return qs


# ─────────────────────────────────────────────────
# RETURN ASSET
# ─────────────────────────────────────────────────

class ReturnAssetView(APIView):
    permission_classes = [IsAdminOrInventoryManager]

    @transaction.atomic
    def post(self, request, pk):
        try:
            issue = ItemIssue.objects.select_for_update().select_related(
                'request__item'
            ).get(pk=pk)
        except ItemIssue.DoesNotExist:
            return Response({'detail': 'Issue record not found.'}, status=404)

        if issue.request.item.item_type != 'asset':
            return Response({'detail': 'Return is only for assets. Use finalize for consumables.'}, status=400)

        if issue.returned_at:
            return Response({'detail': 'This asset has already been returned.'}, status=400)

        serializer = ReturnAssetSerializer(data=request.data, context={'issue': issue})
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        returned_qty = serializer.validated_data['returned_quantity']
        lost_qty = issue.issued_quantity - returned_qty

        # On issue: available -= issued_qty, total -= issued_qty
        # On return: restore available += returned_qty, total += returned_qty
        # Lost units are permanently gone: total -= lost_qty (already excluded since we only add returned_qty back)
        update_kwargs = {
            'available_quantity': F('available_quantity') + returned_qty,
            'total_quantity': F('total_quantity') + returned_qty,
        }

        Item.objects.filter(pk=issue.request.item_id).update(**update_kwargs)
        updated_item = Item.objects.select_for_update().get(pk=issue.request.item_id)
        if updated_item.available_quantity > updated_item.total_quantity:
            Item.objects.filter(pk=issue.request.item_id).update(
                available_quantity=updated_item.total_quantity
            )

        issue.returned_quantity = returned_qty
        issue.returned_at = timezone.now()
        issue.condition_on_return = serializer.validated_data.get('condition_on_return', '')
        issue.return_recorded_by = request.user
        issue.notes = serializer.validated_data.get('notes', issue.notes)
        issue.save()

        return Response(ItemIssueSerializer(issue).data)


# ─────────────────────────────────────────────────
# FINALIZE CONSUMABLE
# ─────────────────────────────────────────────────

class FinalizeConsumableView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        user = request.user

        try:
            base_qs = ItemIssue.objects.select_for_update().select_related(
                'request__item', 'request__requested_by'
            )
            if user.is_admin or user.is_inventory_manager:
                issue = base_qs.get(pk=pk)
            elif user.is_supervisor:
                # Supervisors can only finalize their own issues
                issue = base_qs.get(pk=pk, request__requested_by=user)
            else:
                return Response({'detail': 'Permission denied.'}, status=403)
        except ItemIssue.DoesNotExist:
            return Response({'detail': 'Issue record not found.'}, status=404)

        if issue.request.item.item_type != 'consumable':
            return Response({'detail': 'Finalize is only for consumables. Use return for assets.'}, status=400)

        if issue.usage_finalized:
            return Response({'detail': 'Usage has already been finalized.'}, status=400)

        serializer = FinalizeConsumableSerializer(data=request.data, context={'issue': issue})
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        actual_used = serializer.validated_data['actual_quantity_used']
        confirmed_zero_usage = serializer.validated_data.get('confirmed_zero_usage', False)
        if actual_used == 0 and confirmed_zero_usage is not True:
            return Response(
                {'detail': 'Set confirmed_zero_usage=true to finalize with zero usage.'},
                status=400,
            )
        unused = issue.issued_quantity - actual_used

        if unused > 0:
            Item.objects.filter(pk=issue.request.item_id).update(
                available_quantity=F('available_quantity') + unused
            )

        issue.actual_quantity_used = actual_used
        issue.usage_finalized = True
        issue.usage_finalized_at = timezone.now()
        issue.notes = serializer.validated_data.get('notes', issue.notes)
        issue.save()

        return Response(ItemIssueSerializer(issue).data)


# ─────────────────────────────────────────────────
# USER ACTIVITY VIEW
# ─────────────────────────────────────────────────

class UserActivityView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, user_id):
        from apps.users.models import User
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'detail': 'User not found.'}, status=404)

        if user.role in ['supervisor', 'caretaker']:
            requests_qs = ItemRequest.objects.filter(
                requested_by=user
            ).select_related('item').order_by('-requested_at')
        else:
            requests_qs = ItemRequest.objects.filter(
                approved_by=user
            ).select_related('item').order_by('-reviewed_at')

        serializer = UserActivitySerializer(requests_qs, many=True)

        total = requests_qs.count()
        issued = requests_qs.filter(status='issued').count()
        rejected = requests_qs.filter(status='rejected').count()
        pending = requests_qs.filter(status='pending').count()

        return Response({
            'user': {
                'id': user.id,
                'name': user.get_full_name(),
                'role': user.role,
                'username': user.username,
            },
            'summary': {
                'total': total,
                'issued': issued,
                'rejected': rejected,
                'pending': pending,
            },
            'requests': serializer.data,
        })


# ─────────────────────────────────────────────────
# DASHBOARD SUMMARY
# ─────────────────────────────────────────────────

class DashboardSummaryView(APIView):
    permission_classes = [IsAdminOrInventoryManager]

    def get(self, request):
        total_items = Item.objects.count()
        low_stock_count = Item.objects.filter(
            available_quantity__gt=0,
            available_quantity__lte=F('threshold_quantity'),
        ).count()
        out_of_stock = Item.objects.filter(available_quantity=0).count()
        pending_requests = ItemRequest.objects.filter(status='pending').count()

        unreturned_assets = ItemIssue.objects.filter(
            request__item__item_type='asset',
            returned_at__isnull=True,
        ).count()

        unfinalized_consumables = ItemIssue.objects.filter(
            request__item__item_type='consumable',
            usage_finalized=False,
        ).count()

        overdue_returns = ItemIssue.objects.filter(
            request__item__item_type='asset',
            returned_at__isnull=True,
            expected_return_date__lt=timezone.now().date(),
        ).count()

        return Response({
            'total_items': total_items,
            'low_stock_count': low_stock_count,
            'out_of_stock_count': out_of_stock,
            'pending_requests': pending_requests,
            'unreturned_assets': unreturned_assets,
            'unfinalized_consumables': unfinalized_consumables,
            'overdue_returns': overdue_returns,
        })


# ─────────────────────────────────────────────────
# PURCHASE REQUEST VIEWS
# ─────────────────────────────────────────────────

class PurchaseRequestListCreateView(generics.ListCreateAPIView):
    """
    GET  — list purchase requests (admin sees all; inv_manager sees own)
    POST — inventory manager submits a purchase request
    """
    serializer_class = PurchaseRequestSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardPagination

    def get_queryset(self):
        user = self.request.user
        qs = PurchaseRequest.objects.select_related('requested_by', 'reviewed_by').all()
        if getattr(user, 'role', '') not in ['admin']:
            qs = qs.filter(requested_by=user)
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        if getattr(user, 'role', '') not in ['inventory_manager', 'admin']:
            raise PermissionDenied('Only inventory managers can submit purchase requests.')
        serializer.save(requested_by=user)


class PurchaseRequestDetailView(generics.RetrieveAPIView):
    serializer_class = PurchaseRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = PurchaseRequest.objects.select_related('requested_by', 'reviewed_by').all()
        if getattr(user, 'role', '') != 'admin':
            qs = qs.filter(requested_by=user)
        return qs


class PurchaseRequestReviewView(APIView):
    """Admin approves, rejects, or marks a purchase request as completed."""
    permission_classes = [IsAdminOrInventoryManager]

    @transaction.atomic
    def post(self, request, pk):
        user = request.user
        if getattr(user, 'role', '') != 'admin':
            return Response(
                {'detail': 'Only admins can review purchase requests.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            pr = PurchaseRequest.objects.select_for_update().get(pk=pk)
        except PurchaseRequest.DoesNotExist:
            return Response({'detail': 'Purchase request not found.'}, status=404)

        action = request.data.get('action')
        if action not in ['approve', 'reject', 'complete']:
            return Response(
                {'detail': "Invalid action. Use 'approve', 'reject', or 'complete'."},
                status=400,
            )

        now = timezone.now()

        if action == 'approve':
            if pr.status not in ['pending']:
                return Response({'detail': 'Only pending requests can be approved.'}, status=400)
            pr.status = PurchaseRequest.Status.APPROVED
            pr.reviewed_by = user
            pr.reviewed_at = now
            pr.admin_notes = request.data.get('admin_notes', pr.admin_notes)

        elif action == 'reject':
            if pr.status not in ['pending', 'approved']:
                return Response({'detail': 'Cannot reject a completed request.'}, status=400)
            rejection_reason = request.data.get('rejection_reason', '').strip()
            if not rejection_reason:
                return Response({'detail': 'Rejection reason is required.'}, status=400)
            pr.status = PurchaseRequest.Status.REJECTED
            pr.reviewed_by = user
            pr.reviewed_at = now
            pr.rejection_reason = rejection_reason
            pr.admin_notes = request.data.get('admin_notes', pr.admin_notes)

        elif action == 'complete':
            if pr.status != 'approved':
                return Response({'detail': 'Only approved requests can be marked complete.'}, status=400)
            pr.status = PurchaseRequest.Status.COMPLETED
            pr.completed_at = now
            pr.admin_notes = request.data.get('admin_notes', pr.admin_notes)

        pr.save()
        return Response(PurchaseRequestSerializer(pr).data)

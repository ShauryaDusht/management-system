from django.utils import timezone
from django.db import transaction
from django.db.models import Sum, F
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Category, Item, ItemRequest, ItemIssue, StockEntry
from .serializers import (
    CategorySerializer, ItemSerializer,
    StockEntrySerializer,
    ItemRequestSerializer, ItemRequestReviewSerializer,
    ItemIssueSerializer,
    ReturnAssetSerializer, FinalizeConsumableSerializer,
    UserActivitySerializer,
)
from apps.users.permissions import IsAdmin, IsAdminOrManager, IsManager, IsSupervisor


# ─────────────────────────────────────────────────
# CATEGORY VIEWS  (unchanged)
# ─────────────────────────────────────────────────

class CategoryListCreateView(generics.ListCreateAPIView):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAdmin()]
        return [IsAuthenticated()]


class CategoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAdmin]


# ─────────────────────────────────────────────────
# ITEM VIEWS  (unchanged from Phase 1)
# ─────────────────────────────────────────────────

class ItemListCreateView(generics.ListCreateAPIView):
    serializer_class = ItemSerializer

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
            qs = qs.filter(available_quantity__lt=F('threshold_quantity'))
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
            available_quantity__lt=F('threshold_quantity')
        ).select_related('category')
        serializer = ItemSerializer(items, many=True)
        return Response({'count': items.count(), 'items': serializer.data})


# ─────────────────────────────────────────────────
# NEW — ITEM HISTORY VIEW
# GET /api/inventory/items/<id>/history/
# Admin sees full chronological timeline for one item:
# stock additions, issues, returns, finalization events
# ─────────────────────────────────────────────────

class ItemHistoryView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        try:
            item = Item.objects.get(pk=pk)
        except Item.DoesNotExist:
            return Response({'detail': 'Item not found.'}, status=404)

        events = []

        # Stock entries
        for entry in StockEntry.objects.filter(item=item).select_related('added_by'):
            events.append({
                'type': 'stock_added',
                'date': entry.added_at,
                'quantity': entry.quantity_added,
                'person': entry.added_by.get_full_name() or entry.added_by.username,
                'detail': entry.notes or 'Stock replenished',
            })

        # Issues + returns + finalizations
        issues = ItemIssue.objects.filter(
            request__item=item
        ).select_related('request__requested_by', 'issued_by', 'return_recorded_by')

        for issue in issues:
            supervisor = issue.request.requested_by.get_full_name() or issue.request.requested_by.username
            events.append({
                'type': 'issued',
                'date': issue.issued_at,
                'quantity': issue.issued_quantity,
                'person': supervisor,
                'detail': f"Issued for: {issue.request.purpose}",
            })
            if issue.returned_at:
                events.append({
                    'type': 'returned',
                    'date': issue.returned_at,
                    'quantity': issue.returned_quantity,
                    'person': supervisor,
                    'detail': f"Condition: {issue.condition_on_return or 'Not noted'}",
                })
            if issue.usage_finalized and issue.usage_finalized_at:
                events.append({
                    'type': 'finalized',
                    'date': issue.usage_finalized_at,
                    'quantity': issue.actual_quantity_used,
                    'person': supervisor,
                    'detail': f"Actual quantity used: {issue.actual_quantity_used}",
                })

        # Sort all events newest first
        events.sort(key=lambda e: e['date'], reverse=True)

        return Response({
            'item': ItemSerializer(item).data,
            'events': events,
        })


# ─────────────────────────────────────────────────
# NEW — STOCK ENTRY VIEWS
# GET  /api/inventory/stock-entries/          → admin, list all
# POST /api/inventory/stock-entries/          → admin, add stock
# GET  /api/inventory/items/<id>/stock-entries/ → admin, per-item entries
# ─────────────────────────────────────────────────

class StockEntryListCreateView(generics.ListCreateAPIView):
    serializer_class = StockEntrySerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        qs = StockEntry.objects.select_related('item', 'added_by').all()
        item_id = self.request.query_params.get('item')
        if item_id:
            qs = qs.filter(item_id=item_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(added_by=self.request.user)


class ItemStockEntriesView(generics.ListAPIView):
    """GET /api/inventory/items/<pk>/stock-entries/ — per-item stock history"""
    serializer_class = StockEntrySerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        return StockEntry.objects.filter(
            item_id=self.kwargs['pk']
        ).select_related('added_by')


# ─────────────────────────────────────────────────
# ITEM REQUEST VIEWS  (unchanged from Phase 1)
# ─────────────────────────────────────────────────

class ItemRequestListCreateView(generics.ListCreateAPIView):
    serializer_class = ItemRequestSerializer

    def get_queryset(self):
        user = self.request.user
        qs = ItemRequest.objects.select_related('item', 'requested_by', 'approved_by')
        if user.is_supervisor:
            return qs.filter(requested_by=user)
        return qs

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsSupervisor()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        serializer.save(requested_by=self.request.user)


class ItemRequestDetailView(generics.RetrieveAPIView):
    queryset = ItemRequest.objects.select_related('item', 'requested_by', 'approved_by')
    serializer_class = ItemRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        if user.is_supervisor:
            return qs.filter(requested_by=user)
        return qs


class ReviewRequestView(APIView):
    permission_classes = [IsManager]

    def post(self, request, pk):
        try:
            item_request = ItemRequest.objects.get(pk=pk, status=ItemRequest.Status.PENDING)
        except ItemRequest.DoesNotExist:
            return Response({'detail': 'Request not found or already reviewed.'}, status=404)

        serializer = ItemRequestReviewSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        action = serializer.validated_data['action']

        if action == 'approve':
            if item_request.quantity_requested > item_request.item.available_quantity:
                return Response(
                    {'detail': f'Insufficient stock. Available: {item_request.item.available_quantity} {item_request.item.unit}.'},
                    status=400
                )
            item_request.status = ItemRequest.Status.APPROVED
        else:
            item_request.status = ItemRequest.Status.REJECTED
            item_request.rejection_reason = serializer.validated_data.get('rejection_reason', '')

        item_request.approved_by = request.user
        item_request.reviewed_at = timezone.now()
        item_request.save()

        return Response(ItemRequestSerializer(item_request).data)


class IssueItemView(APIView):
    permission_classes = [IsManager]

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

        item = item_request.item
        if issued_qty > item.available_quantity:
            return Response(
                {'detail': f'Insufficient stock. Available: {item.available_quantity}.'},
                status=400
            )

        item.available_quantity -= issued_qty
        item.save()

        issue = ItemIssue.objects.create(
            request=item_request,
            issued_by=request.user,
            issued_quantity=issued_qty,
            expected_return_date=request.data.get('expected_return_date'),
            notes=request.data.get('notes', ''),
        )

        item_request.status = ItemRequest.Status.ISSUED
        item_request.save()

        return Response(ItemIssueSerializer(issue).data, status=201)


# ─────────────────────────────────────────────────
# ITEM ISSUE VIEWS
# ─────────────────────────────────────────────────

class ItemIssueListView(generics.ListAPIView):
    serializer_class = ItemIssueSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = ItemIssue.objects.select_related(
            'request__item', 'request__requested_by', 'issued_by', 'return_recorded_by'
        )
        if user.is_supervisor:
            return qs.filter(request__requested_by=user)
        return qs


# ─────────────────────────────────────────────────
# NEW — RETURN ASSET
# POST /api/inventory/issues/<id>/return/
# Manager records return of an issued asset.
# Adds returned_quantity back to available_quantity.
# ─────────────────────────────────────────────────

class ReturnAssetView(APIView):
    permission_classes = [IsManager]

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

        # Add back to available stock
        issue.request.item.available_quantity = F('available_quantity') + returned_qty
        issue.request.item.save()

        issue.returned_quantity = returned_qty
        issue.returned_at = timezone.now()
        issue.condition_on_return = serializer.validated_data.get('condition_on_return', '')
        issue.return_recorded_by = request.user
        issue.notes = serializer.validated_data.get('notes', issue.notes)
        issue.save()

        # Refresh from db to get computed F() value
        issue.request.item.refresh_from_db()

        return Response(ItemIssueSerializer(issue).data)


# ─────────────────────────────────────────────────
# NEW — FINALIZE CONSUMABLE USAGE
# POST /api/inventory/issues/<id>/finalize/
# Supervisor records actual quantity used for consumable.
# Unused quantity (issued - used) is added back to stock.
# ─────────────────────────────────────────────────

class FinalizeConsumableView(APIView):
    permission_classes = [IsSupervisor]

    @transaction.atomic
    def post(self, request, pk):
        try:
            issue = ItemIssue.objects.select_for_update().select_related(
                'request__item', 'request__requested_by'
            ).get(pk=pk, request__requested_by=request.user)
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
        unused = issue.issued_quantity - actual_used

        # Return unused quantity to stock
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
# NEW — USER ACTIVITY VIEW
# GET /api/inventory/activity/users/<id>/
# Admin views all requests made by or reviewed by a specific user.
# ─────────────────────────────────────────────────

class UserActivityView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, user_id):
        from apps.users.models import User
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'detail': 'User not found.'}, status=404)

        if user.is_supervisor:
            requests_qs = ItemRequest.objects.filter(
                requested_by=user
            ).select_related('item').order_by('-requested_at')
        else:
            # manager — show what they've approved/rejected/issued
            requests_qs = ItemRequest.objects.filter(
                approved_by=user
            ).select_related('item').order_by('-reviewed_at')

        serializer = UserActivitySerializer(requests_qs, many=True)

        # Summary stats
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
# DASHBOARD SUMMARY  (extended in Phase 2)
# ─────────────────────────────────────────────────

class DashboardSummaryView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        total_items = Item.objects.count()
        low_stock_count = Item.objects.filter(
            available_quantity__lt=F('threshold_quantity')
        ).count()
        out_of_stock = Item.objects.filter(available_quantity=0).count()
        pending_requests = ItemRequest.objects.filter(status='pending').count()

        # NEW: outstanding asset returns (issued assets not yet returned)
        unreturned_assets = ItemIssue.objects.filter(
            request__item__item_type='asset',
            returned_at__isnull=True,
        ).count()

        # NEW: consumables pending finalization
        unfinalized_consumables = ItemIssue.objects.filter(
            request__item__item_type='consumable',
            usage_finalized=False,
        ).count()

        return Response({
            'total_items': total_items,
            'low_stock_count': low_stock_count,
            'out_of_stock_count': out_of_stock,
            'pending_requests': pending_requests,
            'unreturned_assets': unreturned_assets,
            'unfinalized_consumables': unfinalized_consumables,
        })

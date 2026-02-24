from django.utils import timezone
from django.db import transaction
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Category, Item, ItemRequest, ItemIssue
from .serializers import (
    CategorySerializer, ItemSerializer,
    ItemRequestSerializer, ItemRequestReviewSerializer, ItemIssueSerializer,
)
from apps.users.permissions import IsAdmin, IsAdminOrManager, IsManager, IsSupervisor


# ─────────────────────────────────────────────────
# CATEGORY VIEWS
# ─────────────────────────────────────────────────

class CategoryListCreateView(generics.ListCreateAPIView):
    """
    GET  — All authenticated users
    POST — Admin only
    """
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
# ITEM VIEWS
# ─────────────────────────────────────────────────

class ItemListCreateView(generics.ListCreateAPIView):
    """
    GET  — All users can view items
    POST — Admin only
    """
    serializer_class = ItemSerializer

    def get_queryset(self):
        qs = Item.objects.select_related('category').all()
        # Filter by item_type
        item_type = self.request.query_params.get('type')
        if item_type:
            qs = qs.filter(item_type=item_type)
        # Filter by category
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category_id=category)
        # Filter by low stock
        low_stock = self.request.query_params.get('low_stock')
        if low_stock == 'true':
            # Items where available_quantity < threshold_quantity
            from django.db.models import F
            qs = qs.filter(available_quantity__lt=F('threshold_quantity'))
        # Search
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(name__icontains=search)
        return qs

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAdmin()]
        return [IsAuthenticated()]


class ItemDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET/PUT/PATCH — All users can view, Admin can edit
    DELETE        — Admin only
    """
    queryset = Item.objects.select_related('category').all()
    serializer_class = ItemSerializer

    def get_permissions(self):
        if self.request.method in ['PUT', 'PATCH', 'DELETE']:
            return [IsAdmin()]
        return [IsAuthenticated()]


class LowStockItemsView(APIView):
    """
    GET /api/inventory/items/low-stock/
    Admin dashboard — returns all items below threshold.
    """
    permission_classes = [IsAdmin]

    def get(self, request):
        from django.db.models import F
        items = Item.objects.filter(
            available_quantity__lt=F('threshold_quantity')
        ).select_related('category')
        serializer = ItemSerializer(items, many=True)
        return Response({
            'count': items.count(),
            'items': serializer.data,
        })


# ─────────────────────────────────────────────────
# ITEM REQUEST VIEWS (Supervisor → Manager workflow)
# ─────────────────────────────────────────────────

class ItemRequestListCreateView(generics.ListCreateAPIView):
    """
    GET  — Supervisors see own requests; Managers/Admin see all
    POST — Supervisors only
    """
    serializer_class = ItemRequestSerializer

    def get_queryset(self):
        user = self.request.user
        qs = ItemRequest.objects.select_related('item', 'requested_by', 'approved_by')
        if user.is_supervisor:
            return qs.filter(requested_by=user)
        return qs  # managers and admin see all

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
    """
    POST /api/inventory/requests/<id>/review/
    Manager approves or rejects a pending request.
    """
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
            # Check stock availability
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
    """
    POST /api/inventory/requests/<id>/issue/
    Manager issues an approved request. Deducts from available_quantity.
    """
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

        # Deduct stock
        item.available_quantity -= issued_qty
        item.save()

        # Create issue record
        issue = ItemIssue.objects.create(
            request=item_request,
            issued_by=request.user,
            issued_quantity=issued_qty,
            expected_return_date=request.data.get('expected_return_date'),
            notes=request.data.get('notes', ''),
        )

        # Update request status
        item_request.status = ItemRequest.Status.ISSUED
        item_request.save()

        return Response(ItemIssueSerializer(issue).data, status=201)


# ─────────────────────────────────────────────────
# ITEM ISSUE VIEWS
# ─────────────────────────────────────────────────

class ItemIssueListView(generics.ListAPIView):
    """
    GET /api/inventory/issues/
    Managers and Admin see all. Supervisors see their own.
    """
    serializer_class = ItemIssueSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = ItemIssue.objects.select_related(
            'request__item', 'request__requested_by', 'issued_by'
        )
        if user.is_supervisor:
            return qs.filter(request__requested_by=user)
        return qs


class DashboardSummaryView(APIView):
    """
    GET /api/inventory/dashboard/
    Admin dashboard summary stats.
    """
    permission_classes = [IsAdmin]

    def get(self, request):
        from django.db.models import F
        total_items = Item.objects.count()
        low_stock_count = Item.objects.filter(
            available_quantity__lt=F('threshold_quantity')
        ).count()
        out_of_stock = Item.objects.filter(available_quantity=0).count()
        pending_requests = ItemRequest.objects.filter(status='pending').count()

        return Response({
            'total_items': total_items,
            'low_stock_count': low_stock_count,
            'out_of_stock_count': out_of_stock,
            'pending_requests': pending_requests,
        })

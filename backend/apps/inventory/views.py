import csv
from datetime import timedelta
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from django.db import models as dm, transaction
from django.db.models import Sum, F, Count, Value, DecimalField, Prefetch
from django.db.models.functions import Coalesce
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from rest_framework.exceptions import PermissionDenied

from .models import (
    Category, Item, ItemRequest, ItemIssue, ItemIssueAdjustment,
    ItemUsageLog, PurchaseRequest, StockEntry,
)
from .serializers import (
    CategorySerializer, ItemSerializer,
    StockEntrySerializer,
    ItemRequestSerializer, ItemRequestBatchSerializer, ItemRequestReviewSerializer,
    PurchaseRequestSerializer,
    ItemIssueSerializer, ItemIssueAdjustmentSerializer, ItemUsageLogSerializer,
    ReturnAssetSerializer, FinalizeConsumableSerializer,
    UserActivitySerializer,
    StandardPagination,
)
from apps.core.notifications import (
    notify_inventory_approval_undone,
    notify_inventory_quantity_adjusted,
)
from apps.users.permissions import IsAdmin, IsAdminOrHKInventoryManager, IsSupervisor
from .permissions import IsAdminOrInventoryManager
from .request_permissions import filter_requestable_items


def _is_hostel_office(user):
    return bool(user and getattr(user, 'is_hostel_office', False))


class IsInventoryReportViewer(IsAuthenticated):
    def has_permission(self, request, view):
        user = request.user
        return bool(
            super().has_permission(request, view)
            and (
                getattr(user, 'is_admin', False)
                or getattr(user, 'is_inventory_manager', False)
                or getattr(user, 'is_hk_inventory_manager', False)
                or getattr(user, 'is_horticulture_manager', False)
                or getattr(user, 'role', '') == 'technical_assistant'
                or _is_hostel_office(user)
            )
        )


def _hostel_office_staff_area_names(user):
    try:
        from apps.housekeeping.models import HKUserArea
    except Exception:
        return None

    links = (
        HKUserArea.objects
        .select_related('area')
        .filter(
            user=user,
            area__is_active=True,
        )
        .filter(
            dm.Q(area__area_type='hostel')
            | dm.Q(area__name__iexact='Hostel Common Area')
            | dm.Q(area__name__iexact='Hostels Reliever')
        )
        .order_by('area__name')
    )
    names = []
    seen = set()
    for link in links:
        name = (link.area.name or '').strip()
        if name and name not in seen:
            seen.add(name)
            names.append(name)
    return names


def _hostel_office_staff_ids():
    try:
        from apps.housekeeping.models import HKArea, HKUserArea
    except Exception:
        return []

    area_ids = (
        HKArea.objects
        .filter(is_active=True)
        .filter(
            dm.Q(area_type__in=['hostel', 'jrha'])
            | dm.Q(name__iexact='Hostel Common Area')
            | dm.Q(name__iexact='Hostels Reliever')
            | dm.Q(name__icontains='JRHA')
            | dm.Q(name__icontains='Jeet Hostel')
        )
        .values_list('id', flat=True)
    )
    return list(
        HKUserArea.objects
        .filter(area_id__in=area_ids, user__role__in=['supervisor', 'caretaker'])
        .values_list('user_id', flat=True)
        .distinct()
    )


def _sync_horticulture_request_status(item_request, status_value):
    try:
        from apps.housekeeping.models import HKStockRequest
        hk_req = HKStockRequest.objects.filter(inventory_request=item_request).first()
        if hk_req:
            hk_req.status = status_value
            if status_value == ItemRequest.Status.REJECTED:
                hk_req.covered_quantity = 0
                hk_req.save(update_fields=['status', 'covered_quantity'])
            else:
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


# ─────────────────────────────────────────────────
# CATEGORY VIEWS
# ─────────────────────────────────────────────────

class CategoryListCreateView(generics.ListCreateAPIView):
    serializer_class = CategorySerializer

    def get_queryset(self):
        return Category.objects.annotate(item_count=Count('items')).all()

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAdminOrHKInventoryManager()]
        return [IsAuthenticated()]


# ─────────────────────────────────────────────────
# ITEM VIEWS
# ─────────────────────────────────────────────────

class ItemListCreateView(generics.ListCreateAPIView):
    serializer_class = ItemSerializer
    pagination_class = StandardPagination

    def get_queryset(self):
        qs = filter_requestable_items(Item.objects.select_related('category').all(), self.request.user)
        item_type = self.request.query_params.get('type')
        if item_type:
            qs = qs.filter(item_type=item_type)
        category = self.request.query_params.get('category')
        if category:
            if str(category).isdigit():
                qs = qs.filter(category_id=category)
            else:
                qs = qs.filter(
                    dm.Q(category__name__iexact=category)
                    | dm.Q(category__name__icontains=category)
                )
        exclude_category = self.request.query_params.get('exclude_category')
        if exclude_category:
            if str(exclude_category).isdigit():
                qs = qs.exclude(category_id=exclude_category)
            else:
                qs = qs.exclude(
                    dm.Q(category__name__iexact=exclude_category)
                    | dm.Q(category__name__icontains=exclude_category)
                )
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
            return [IsAdminOrInventoryManager()]
        return [IsAuthenticated()]


class ItemDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ItemSerializer

    def get_queryset(self):
        return filter_requestable_items(Item.objects.select_related('category').all(), self.request.user)

    def get_permissions(self):
        if self.request.method in ['PUT', 'PATCH', 'DELETE']:
            return [IsAdminOrInventoryManager()]
        return [IsAuthenticated()]


class LowStockItemsView(APIView):
    permission_classes = [IsInventoryReportViewer]

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
    permission_classes = [IsInventoryReportViewer]

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

        adjustments = (
            ItemIssueAdjustment.objects
            .filter(issue__request__item=item)
            .select_related('adjusted_by', 'issue__request__requested_by')
            .order_by('-created_at')
        )
        for adj in adjustments:
            mgr_name = (adj.adjusted_by.get_full_name() or adj.adjusted_by.username) if adj.adjusted_by else 'Manager'
            action_label = 'Approval Undone (Restored to Pending)' if adj.action_type == ItemIssueAdjustment.ActionType.REVERSAL else 'Issue Quantity Adjusted'
            events.append({
                'type': f'issue_{adj.action_type}',
                'date': adj.created_at.isoformat(),
                '_sort_dt': adj.created_at,
                'quantity': adj.quantity_returned_to_stock,
                'person': mgr_name,
                'detail': f"{action_label}: prev={adj.previous_quantity}, new={adj.new_quantity}. Reason: {adj.reason or 'None'}",
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
    pagination_class = StandardPagination

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAdminOrInventoryManager()]
        return [IsInventoryReportViewer()]

    def get_queryset(self):
        qs = StockEntry.objects.select_related('item', 'item__category', 'added_by').all().order_by('-added_at')
        params = getattr(self.request, 'query_params', getattr(self.request, 'GET', {}))
        item_id = params.get('item')
        if item_id:
            qs = qs.filter(item_id=item_id)

        category = params.get('category')
        if category:
            if str(category).isdigit():
                qs = qs.filter(item__category_id=category)
            else:
                qs = qs.filter(
                    dm.Q(item__category__name__iexact=category)
                    | dm.Q(item__category__name__icontains=category)
                )

        exclude_category = params.get('exclude_category')
        if exclude_category:
            if str(exclude_category).isdigit():
                qs = qs.exclude(item__category_id=exclude_category)
            else:
                qs = qs.exclude(
                    dm.Q(item__category__name__iexact=exclude_category)
                    | dm.Q(item__category__name__icontains=exclude_category)
                )

        user = self.request.user
        if not category and not exclude_category:
            if getattr(user, 'is_horticulture_manager', False) or getattr(user, 'role', '') == 'horticulture_manager':
                qs = qs.filter(
                    dm.Q(item__category__name__icontains='Horticulture')
                    | dm.Q(item__category__name__iexact='Garden & Horticulture Equipment')
                )
            elif getattr(user, 'is_hk_inventory_manager', False) or getattr(user, 'role', '') == 'hk_inventory_manager':
                qs = qs.exclude(
                    dm.Q(item__category__name__icontains='Horticulture')
                    | dm.Q(item__category__name__iexact='Garden & Horticulture Equipment')
                )

        return qs

    def perform_create(self, serializer):
        serializer.save(added_by=self.request.user)


class ItemStockEntriesView(generics.ListAPIView):
    serializer_class = StockEntrySerializer
    permission_classes = [IsInventoryReportViewer]

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
        qs = ItemRequest.objects.select_related('item__category', 'requested_by', 'approved_by').prefetch_related('requisition_items__inventory_item__category')
        params = getattr(self.request, 'query_params', getattr(self.request, 'GET', {}))
        category = params.get('category')
        if category:
            if str(category).isdigit():
                qs = qs.filter(item__category_id=category)
            else:
                qs = qs.filter(
                    dm.Q(item__category__name__iexact=category)
                    | dm.Q(item__category__name__icontains='Horticulture')
                    | dm.Q(purpose__icontains='[Horticulture')
                )
        exclude_category = params.get('exclude_category')
        if exclude_category:
            if str(exclude_category).isdigit():
                qs = qs.exclude(item__category_id=exclude_category)
            else:
                qs = qs.exclude(
                    dm.Q(item__category__name__iexact=exclude_category)
                    | dm.Q(item__category__name__icontains='Horticulture')
                    | dm.Q(purpose__icontains='[Horticulture')
                )
        if getattr(user, 'role', '') in ['supervisor', 'caretaker']:
            return qs.filter(requested_by=user)
        if _is_hostel_office(user):
            return qs.filter(requested_by_id__in=_hostel_office_staff_ids())
        return qs

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAuthenticated()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        if getattr(self.request.user, 'role', '') not in ['supervisor', 'caretaker']:
            raise PermissionDenied('Only supervisors/caretakers can create item requests.')
        serializer.save(requested_by=self.request.user)


class ItemRequestBatchCreateView(generics.CreateAPIView):
    serializer_class = ItemRequestBatchSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        if getattr(self.request.user, 'role', '') not in ['supervisor', 'caretaker']:
            raise PermissionDenied('Only supervisors/caretakers can create item requests.')
        serializer.save(requested_by=self.request.user)


class ItemRequestDetailView(generics.RetrieveAPIView):
    queryset = ItemRequest.objects.select_related('item', 'requested_by', 'approved_by').prefetch_related('requisition_items__inventory_item')
    serializer_class = ItemRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        if getattr(user, 'role', '') in ['supervisor', 'caretaker']:
            return qs.filter(requested_by=user)
        if _is_hostel_office(user):
            return qs.filter(requested_by_id__in=_hostel_office_staff_ids())
        return qs


class PurchaseRequestListCreateView(generics.ListCreateAPIView):
    serializer_class = PurchaseRequestSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardPagination

    def get_queryset(self):
        user = self.request.user
        qs = PurchaseRequest.objects.select_related(
            'requested_by',
            'category',
            'decided_by',
        ).order_by('-created_at')
        status_filter = (self.request.query_params.get('status') or '').strip().lower()
        if status_filter:
            qs = qs.filter(status=status_filter)
        item_type_filter = (self.request.query_params.get('item_type') or '').strip().lower()
        if item_type_filter in ['asset', 'consumable']:
            qs = qs.filter(item_type=item_type_filter)
        if getattr(user, 'role', '') != 'admin':
            if _is_hostel_office(user) or getattr(user, 'is_hk_inventory_manager', False) or getattr(user, 'is_horticulture_manager', False):
                return qs
            qs = qs.filter(requested_by=user)
        return qs

    def perform_create(self, serializer):
        role = getattr(self.request.user, 'role', '')
        if role not in ['inventory_manager', 'admin', 'hk_inventory_manager', 'horticulture_manager']:
            raise PermissionDenied('Only inventory managers/admin can create purchase requests.')
        serializer.save(requested_by=self.request.user)


class PurchaseRequestDecisionView(APIView):
    permission_classes = [IsAdminOrHKInventoryManager]

    def post(self, request, pk):
        try:
            purchase_request = PurchaseRequest.objects.select_related('requested_by').get(pk=pk)
        except PurchaseRequest.DoesNotExist:
            return Response({'detail': 'Purchase request not found.'}, status=404)

        if purchase_request.status != PurchaseRequest.Status.PENDING:
            return Response({'detail': 'Only pending purchase requests can be decided.'}, status=400)

        decision = (request.data.get('decision') or '').strip().lower()
        note = (request.data.get('admin_note') or '').strip()
        if decision not in {PurchaseRequest.Status.APPROVED, PurchaseRequest.Status.REJECTED}:
            return Response({'detail': 'decision must be approved or rejected.'}, status=400)

        purchase_request.status = decision
        purchase_request.admin_note = note
        purchase_request.decided_by = request.user
        purchase_request.decided_at = timezone.now()
        purchase_request.save(update_fields=['status', 'admin_note', 'decided_by', 'decided_at', 'updated_at'])

        return Response(PurchaseRequestSerializer(purchase_request).data, status=200)


class ReviewRequestView(APIView):
    permission_classes = [IsAdminOrInventoryManager]

    @transaction.atomic
    def post(self, request, pk):
        try:
            item_request = ItemRequest.objects.select_related('item').prefetch_related('requisition_items').select_for_update().get(
                pk=pk, status=ItemRequest.Status.PENDING
            )
        except ItemRequest.DoesNotExist:
            return Response({'detail': 'Request not found or already reviewed.'}, status=404)

        serializer = ItemRequestReviewSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        action = serializer.validated_data['action']
        if action == 'approve':
            lines = item_request.requisition_lines()
            item_ids = [line.inventory_item_id for line in lines]
            locked_items = {
                item.id: item
                for item in Item.objects.select_for_update().filter(pk__in=item_ids)
            }
            for line in lines:
                item = locked_items.get(line.inventory_item_id)
                available_to_reserve = (
                    item.available_quantity - item.reserved_quantity
                    if item else 0
                )
                if not item or line.quantity > available_to_reserve:
                    return Response(
                        {'detail': f'Insufficient stock for {line.inventory_item.name}. Available: {available_to_reserve} {line.unit}.'},
                        status=400
                    )
            for line in lines:
                Item.objects.filter(pk=line.inventory_item_id).update(
                    reserved_quantity=F('reserved_quantity') + line.quantity
                )
            first_line = next((line for line in lines if line.inventory_item_id == item_request.item_id), None)
            first_item = locked_items.get(item_request.item_id)
            item_request.units_remaining = max(
                (
                    (first_item.available_quantity - first_item.reserved_quantity)
                    if first_item else 0
                ) - (first_line.quantity if first_line else 0),
                0,
            )
            item_request.status = ItemRequest.Status.APPROVED
        else:
            item_request.status = ItemRequest.Status.REJECTED
            item_request.rejection_reason = serializer.validated_data.get('rejection_reason', '')
            item = Item.objects.select_for_update().get(pk=item_request.item_id)
            item_request.units_remaining = item.available_quantity

        item_request.save()
        _sync_horticulture_request_status(item_request, item_request.status)
        from apps.core.notifications import notify_inventory_approved, notify_inventory_rejected
        if item_request.status == ItemRequest.Status.APPROVED:
            notify_inventory_approved(item_request)
        elif item_request.status == ItemRequest.Status.REJECTED:
            notify_inventory_rejected(item_request, item_request.rejection_reason)

        return Response(ItemRequestSerializer(item_request).data)


class IssueItemView(APIView):
    permission_classes = [IsAdminOrInventoryManager]

    @transaction.atomic
    def post(self, request, pk):
        try:
            item_request = ItemRequest.objects.select_for_update().get(
                pk=pk,
                status__in=[ItemRequest.Status.PENDING, ItemRequest.Status.APPROVED],
            )
        except ItemRequest.DoesNotExist:
            return Response({'detail': 'Request not found or already actioned.'}, status=404)

        if item_request.undo_consumed or (hasattr(item_request, 'issue') and item_request.issue.is_reversed):
            return Response(
                {'detail': 'Cannot issue a request that has already been finalized or reversed.'},
                status=400,
            )

        was_pending = item_request.status == ItemRequest.Status.PENDING

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

        available_to_issue = item.available_quantity
        if not was_pending and item.reserved_quantity >= item_request.quantity_requested:
            available_to_issue = min(item.available_quantity, item.reserved_quantity)
        if issued_qty > available_to_issue:
            return Response(
                {'detail': f'Insufficient stock. Available: {available_to_issue}.'},
                status=400
            )

        expected_return_date = None
        if item.item_type == Item.ItemType.ASSET:
            raw_return_date = (request.data.get('expected_return_date') or '').strip()
            if raw_return_date:
                expected_return_date = parse_date(raw_return_date)
                if expected_return_date is None:
                    return Response({'detail': 'Invalid expected return date.'}, status=400)
                if expected_return_date < timezone.localdate():
                    return Response(
                        {'detail': 'Expected return date cannot be in the past.'},
                        status=400,
                    )

        reserved_release = 0 if was_pending else min(item.reserved_quantity, item_request.quantity_requested)
        Item.objects.filter(pk=item.pk).update(
            available_quantity=F('available_quantity') - issued_qty,
            reserved_quantity=F('reserved_quantity') - reserved_release,
        )

        existing_issue = ItemIssue.objects.filter(request=item_request).first()
        if existing_issue:
            existing_issue.issued_by = request.user
            existing_issue.issued_quantity = issued_qty
            existing_issue.original_quantity = issued_qty
            existing_issue.expected_return_date = expected_return_date
            existing_issue.notes = request.data.get('notes', '')
            existing_issue.is_reversed = False
            existing_issue.reversed_at = None
            existing_issue.reversed_by = None
            existing_issue.reversal_reason = ''
            existing_issue.issued_at = timezone.now()
            existing_issue.save()
            issue = existing_issue
        else:
            issue = ItemIssue.objects.create(
                request=item_request,
                issued_by=request.user,
                issued_quantity=issued_qty,
                original_quantity=issued_qty,
                expected_return_date=expected_return_date,
                notes=request.data.get('notes', ''),
            )

        if was_pending:
            # Skipping the separate approval step — record the issuer as the
            # reviewer so the audit trail still shows who actioned it.
            item_request.approved_by = request.user
            item_request.reviewed_at = timezone.now()
            item_request.units_remaining = max(item.available_quantity - issued_qty, 0)

        item_request.status = ItemRequest.Status.ISSUED
        item_request.save()
        _sync_horticulture_request_status(item_request, ItemRequest.Status.ISSUED)
        try:
            from apps.housekeeping.models import HKStockRequest
            hk_req = HKStockRequest.objects.filter(inventory_request=item_request).first()
            if hk_req:
                hk_req.status = 'issued'
                hk_req.save(update_fields=['status'])
        except Exception:
            pass

        from apps.core.notifications import notify_inventory_approved
        notify_inventory_approved(item_request)

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
        ).annotate(
            total_consumed=Coalesce(
                Sum('usage_logs__quantity_used'),
                Value(0),
                output_field=DecimalField(max_digits=10, decimal_places=2),
            )
        ).order_by('-issued_at')
        params = getattr(self.request, 'query_params', getattr(self.request, 'GET', {}))
        issue_id = params.get('id')
        if issue_id:
            qs = qs.filter(pk=issue_id)
        request_id = params.get('request_id')
        if request_id:
            qs = qs.filter(request_id=request_id)
        category = params.get('category')
        if category:
            if str(category).isdigit():
                qs = qs.filter(request__item__category_id=category)
            else:
                qs = qs.filter(
                    dm.Q(request__item__category__name__iexact=category)
                    | dm.Q(request__item__category__name__icontains='Horticulture')
                    | dm.Q(request__purpose__icontains='[Horticulture')
                )
        exclude_category = params.get('exclude_category')
        if exclude_category:
            if str(exclude_category).isdigit():
                qs = qs.exclude(request__item__category_id=exclude_category)
            else:
                qs = qs.exclude(
                    dm.Q(request__item__category__name__iexact=exclude_category)
                    | dm.Q(request__item__category__name__icontains='Horticulture')
                    | dm.Q(request__purpose__icontains='[Horticulture')
                )
        include_reversed = params.get('include_reversed')
        if not (include_reversed and str(include_reversed).lower() in ['true', '1']):
            qs = qs.filter(is_reversed=False).exclude(request__status=ItemRequest.Status.REJECTED)

        if getattr(user, 'role', '') in ['supervisor', 'caretaker']:
            return qs.filter(request__requested_by=user)
        if _is_hostel_office(user):
            return qs.filter(request__requested_by_id__in=_hostel_office_staff_ids())
        return qs


# ─────────────────────────────────────────────────
# UNDO APPROVAL / ADJUST ISSUED QUANTITY
# ─────────────────────────────────────────────────

class AdjustOrReverseIssueView(APIView):
    permission_classes = [IsAdminOrInventoryManager]

    @transaction.atomic
    def post(self, request, pk):
        try:
            issue = (
                ItemIssue.objects
                .select_for_update()
                .select_related('request__item', 'request__requested_by')
                .get(pk=pk)
            )
        except ItemIssue.DoesNotExist:
            return Response({'detail': 'Issue record not found.'}, status=status.HTTP_404_NOT_FOUND)

        if issue.is_reversed:
            return Response(
                {'detail': 'This issue has already been undone.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 24-hour window check
        issued_at = issue.issued_at
        if issued_at and (timezone.now() - issued_at > timedelta(hours=24)):
            return Response(
                {'detail': 'Undo or adjustment window (24 hours) has expired. Approval is now final.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if issue.returned_at:
            return Response(
                {'detail': 'Cannot modify an issue where the asset has already been returned.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if issue.usage_finalized:
            return Response(
                {'detail': 'Cannot modify an issue where consumable usage has already been finalized.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        action = (request.data.get('action') or '').strip().lower()
        reason = (request.data.get('reason') or '').strip()
        if not reason:
            return Response(
                {'reason': ['A reason must be provided for reversing or adjusting an issue.']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if issue.is_reversed:
            return Response(
                {'detail': 'This issue has already been reversed or rejected.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if issue.adjustments.exists():
            return Response(
                {'detail': 'Only one undo/adjust operation is permitted for this issue.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        item = Item.objects.select_for_update().get(pk=issue.request.item_id)
        item_request = ItemRequest.objects.select_for_update().get(pk=issue.request_id)

        if item_request.undo_consumed or issue.is_reversed or issue.adjustments.exists():
            return Response(
                {'detail': 'Only one undo/adjust operation is permitted for this request.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if item_request.status == ItemRequest.Status.REJECTED:
            return Response(
                {'detail': 'This request has already been rejected.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        total_consumed = issue.usage_logs.aggregate(
            c=Coalesce(Sum('quantity_used'), Value(0), output_field=DecimalField(max_digits=10, decimal_places=2))
        )['c'] or Decimal('0')

        # ── ACTION 1: REJECT REQUEST (RESTORE STOCK & REJECT) ──────────────────
        if action in ['reject', 'reversal', 'undo']:
            if total_consumed > 0:
                return Response(
                    {
                        'detail': (
                            f'Cannot reject request: {total_consumed} units have already been reported as used '
                            f'or consumed by the supervisor. Downstream usage cannot be undone.'
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            restore_qty = issue.issued_quantity
            # 1. Restore stock to warehouse
            Item.objects.filter(pk=item.pk).update(
                available_quantity=F('available_quantity') + restore_qty
            )
            item.refresh_from_db()

            # 2. Mark issue as reversed
            issue.is_reversed = True
            issue.reversed_at = timezone.now()
            issue.reversed_by = request.user
            issue.reversal_reason = reason
            issue.save(update_fields=['is_reversed', 'reversed_at', 'reversed_by', 'reversal_reason'])

            # 3. Mark item request as REJECTED
            item_request.status = ItemRequest.Status.REJECTED
            item_request.approved_by = request.user
            item_request.reviewed_at = timezone.now()
            item_request.rejection_reason = reason
            item_request.units_remaining = item.available_quantity
            item_request.undo_consumed = True
            item_request.save(update_fields=[
                'status', 'approved_by', 'reviewed_at', 'rejection_reason', 'units_remaining', 'undo_consumed'
            ])

            # 4. Sync with horticulture & HKStockRequest to rejected
            _sync_horticulture_request_status(item_request, ItemRequest.Status.REJECTED)
            try:
                from apps.housekeeping.models import HKStockRequest
                hk_req = HKStockRequest.objects.filter(inventory_request=item_request).first()
                if hk_req:
                    hk_req.status = 'rejected'
                    hk_req.covered_quantity = 0
                    hk_req.save(update_fields=['status', 'covered_quantity'])
            except Exception:
                pass
            try:
                from apps.horticulture.models import HorticultureStockRequest
                horti_req = HorticultureStockRequest.objects.filter(inventory_request=item_request).first()
                if horti_req:
                    horti_req.status = 'rejected'
                    horti_req.rejection_reason = reason
                    horti_req.reviewed_by = request.user
                    horti_req.reviewed_at = timezone.now()
                    horti_req.save(update_fields=['status', 'rejection_reason', 'reviewed_by', 'reviewed_at'])
            except Exception:
                pass

            # 5. Record audit trail
            adjustment = ItemIssueAdjustment.objects.create(
                issue=issue,
                action_type=ItemIssueAdjustment.ActionType.REVERSAL,
                previous_quantity=issue.issued_quantity,
                new_quantity=0,
                quantity_returned_to_stock=restore_qty,
                reason=reason,
                adjusted_by=request.user,
            )

            # 6. Notify supervisor of rejection
            from apps.core.notifications import notify_inventory_rejected
            notify_inventory_rejected(item_request, rejection_reason=reason)

            return Response({
                'detail': 'Request rejected successfully. Issued quantity returned to warehouse stock.',
                'issue': ItemIssueSerializer(issue).data,
                'request': ItemRequestSerializer(item_request).data,
                'adjustment': ItemIssueAdjustmentSerializer(adjustment).data,
            }, status=status.HTTP_200_OK)

        # ── ACTION 2: QUANTITY ADJUSTMENT ─────────────────────────────────────
        elif action == 'adjustment':
            raw_new_qty = request.data.get('new_quantity')
            try:
                new_quantity = Decimal(str(raw_new_qty).strip())
            except (InvalidOperation, TypeError, ValueError):
                return Response(
                    {'new_quantity': ['A valid numerical quantity is required.']},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if new_quantity <= 0:
                return Response(
                    {'new_quantity': ['Adjusted quantity must be greater than zero. To reverse completely, select Undo Entire Approval.']},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if new_quantity < total_consumed:
                return Response(
                    {
                        'new_quantity': [
                            f'Adjusted quantity cannot be less than already consumed quantity ({total_consumed}).'
                        ]
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            current_qty = issue.issued_quantity
            diff = current_qty - new_quantity

            if diff == Decimal('0'):
                return Response(
                    {'new_quantity': ['Adjusted quantity is identical to current issued quantity. No change needed.']},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if diff > 0:
                # Returning excess to warehouse stock
                Item.objects.filter(pk=item.pk).update(available_quantity=F('available_quantity') + int(diff))
                returned_to_stock = int(diff)
            else:
                # Manager is increasing quantity (can give more than original requested quantity)
                needed = abs(diff)
                if item.available_quantity < needed:
                    return Response(
                        {'detail': f'Insufficient warehouse stock. Needed: {needed}, Available: {item.available_quantity}.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                Item.objects.filter(pk=item.pk).update(available_quantity=F('available_quantity') - int(needed))
                returned_to_stock = 0

            # Update issue
            issue.issued_quantity = int(new_quantity)
            issue.save(update_fields=['issued_quantity'])

            # Update request
            item_request.quantity_requested = int(new_quantity)
            item_request.undo_consumed = True
            item_request.save(update_fields=['quantity_requested', 'undo_consumed'])

            # Update RequisitionItem if exists
            try:
                from .models import RequisitionItem
                RequisitionItem.objects.filter(requisition=item_request, inventory_item=item_request.item).update(quantity=int(new_quantity))
            except Exception:
                pass

            # Sync HKStockRequest
            try:
                from apps.housekeeping.models import HKStockRequest
                hk_req = HKStockRequest.objects.filter(inventory_request=item_request).first()
                if hk_req:
                    hk_req.quantity = int(new_quantity)
                    hk_req.save(update_fields=['quantity'])
            except Exception:
                pass

            # Sync HorticultureStockRequest
            try:
                from apps.horticulture.models import HorticultureStockRequest
                horti_req = HorticultureStockRequest.objects.filter(inventory_request=item_request).first()
                if horti_req:
                    horti_req.quantity = int(new_quantity)
                    horti_req.save(update_fields=['quantity'])
            except Exception:
                pass

            # Record audit trail
            adjustment = ItemIssueAdjustment.objects.create(
                issue=issue,
                action_type=ItemIssueAdjustment.ActionType.ADJUSTMENT,
                previous_quantity=int(current_qty),
                new_quantity=int(new_quantity),
                quantity_returned_to_stock=returned_to_stock,
                reason=reason,
                adjusted_by=request.user,
            )

            # Notify supervisor
            notify_inventory_quantity_adjusted(
                item_request,
                old_qty=current_qty,
                new_qty=new_quantity,
                reason=reason,
                manager=request.user,
                orig_requested_qty=issue.original_quantity or current_qty,
            )

            return Response({
                'detail': f'Issued quantity adjusted from {current_qty} to {new_quantity}.',
                'issue': ItemIssueSerializer(issue).data,
                'request': ItemRequestSerializer(item_request).data,
                'adjustment': ItemIssueAdjustmentSerializer(adjustment).data,
            }, status=status.HTTP_200_OK)

        else:
            return Response(
                {'action': ["Invalid action. Must be 'reversal' (undo) or 'adjustment'."]},
                status=status.HTTP_400_BAD_REQUEST,
            )


class IssueAdjustmentHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            issue = ItemIssue.objects.get(pk=pk)
        except ItemIssue.DoesNotExist:
            return Response({'detail': 'Issue record not found.'}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        # Supervisor can view their own, manager/admin can view any
        if getattr(user, 'role', '') in ['supervisor', 'caretaker'] and issue.request.requested_by_id != user.id:
            raise PermissionDenied('You do not have permission to view adjustments for this issue.')

        adjustments = issue.adjustments.select_related('adjusted_by').order_by('-created_at')
        return Response(ItemIssueAdjustmentSerializer(adjustments, many=True).data)


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

        update_kwargs = {'available_quantity': F('available_quantity') + returned_qty}
        if lost_qty > 0:
            update_kwargs['total_quantity'] = F('total_quantity') - lost_qty

        Item.objects.filter(pk=issue.request.item_id).update(**update_kwargs)
        updated_item = Item.objects.select_for_update().get(pk=issue.request.item_id)
        if updated_item.available_quantity > updated_item.total_quantity:
            raise AssertionError('available_quantity cannot exceed total_quantity')

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
            if user.is_admin or user.is_inventory_manager or getattr(user, 'is_hk_inventory_manager', False) or getattr(user, 'is_horticulture_manager', False):
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
        issue.save(update_fields=[
            'actual_quantity_used', 'usage_finalized', 'usage_finalized_at',
            'notes',
        ])

        return Response(ItemIssueSerializer(issue).data)


class IssueUsageLogView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_issue(self, user, pk, for_update=False):
        base_qs = ItemIssue.objects.select_related(
            'request__item', 'request__requested_by'
        )
        if for_update:
            base_qs = base_qs.select_for_update()

        if _is_hostel_office(user):
            return base_qs.get(pk=pk, request__requested_by_id__in=_hostel_office_staff_ids())
        if user.is_admin or user.is_inventory_manager or getattr(user, 'is_hk_inventory_manager', False) or getattr(user, 'is_horticulture_manager', False):
            return base_qs.get(pk=pk)
        if user.is_supervisor or user.is_caretaker:
            return base_qs.get(pk=pk, request__requested_by=user)
        raise PermissionDenied('Permission denied.')

    def get(self, request, pk):
        try:
            issue = self._get_issue(request.user, pk)
        except ItemIssue.DoesNotExist:
            return Response({'detail': 'Issue record not found.'}, status=404)
        except PermissionDenied as exc:
            return Response({'detail': str(exc)}, status=403)

        logs = (
            ItemUsageLog.objects
            .filter(issue=issue)
            .select_related('logged_by')
            .order_by('-logged_at')
        )
        total_consumed = logs.aggregate(
            total=Coalesce(
                Sum('quantity_used'),
                Value(0),
                output_field=DecimalField(max_digits=10, decimal_places=2),
            )
        )['total']
        issued_qty = issue.issued_quantity
        remaining = max(Decimal(issued_qty) - total_consumed, Decimal('0'))
        issue.total_consumed = total_consumed

        return Response({
            'issue': ItemIssueSerializer(issue).data,
            'total_consumed': total_consumed,
            'issued_quantity': issued_qty,
            'remaining_quantity': remaining,
            'total_used': total_consumed,
            'logs': ItemUsageLogSerializer(logs, many=True).data,
        })

    @transaction.atomic
    def post(self, request, pk):
        user = request.user
        if not (user.is_supervisor or user.is_caretaker):
            return Response({'detail': 'Permission denied.'}, status=403)

        try:
            issue = self._get_issue(user, pk, for_update=True)
        except ItemIssue.DoesNotExist:
            return Response({'detail': 'Issue record not found.'}, status=404)

        if issue.is_reversed or issue.request.status == ItemRequest.Status.REJECTED:
            return Response({'detail': 'Cannot log usage for a reversed or rejected issue.'}, status=400)

        raw_qty = request.data.get('quantity_used')
        purpose = (request.data.get('purpose') or '').strip()
        notes = (request.data.get('notes') or '').strip()

        try:
            quantity_used = Decimal(str(raw_qty))
        except (TypeError, ValueError, InvalidOperation):
            return Response({'quantity_used': 'Enter a valid number.'}, status=400)

        if quantity_used <= 0:
            return Response({'quantity_used': 'Quantity must be greater than 0.'}, status=400)

        quantity_used = quantity_used.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        if issue.request.item.item_type == 'asset':
            if quantity_used != quantity_used.to_integral_value():
                return Response({'quantity_used': 'Enter a whole number for assets.'}, status=400)

        if not purpose:
            return Response({'purpose': 'Please describe what the item was used for.'}, status=400)

        total_consumed = ItemUsageLog.objects.filter(issue=issue).aggregate(
            total=Coalesce(
                Sum('quantity_used'),
                Value(0),
                output_field=DecimalField(max_digits=10, decimal_places=2),
            )
        )['total']
        remaining = Decimal(issue.issued_quantity) - total_consumed
        if remaining <= 0:
            return Response({'quantity_used': 'All issued quantity has already been logged.'}, status=400)
        if quantity_used > remaining:
            remaining_display = remaining.quantize(Decimal('0.01'))
            return Response(
                {
                    'quantity_used': (
                        f'Cannot exceed remaining quantity ({remaining_display} {issue.request.item.unit}).'
                    )
                },
                status=400
            )

        log = ItemUsageLog.objects.create(
            issue=issue,
            quantity_used=quantity_used,
            purpose=purpose,
            notes=notes,
            logged_by=user,
        )

        return Response(ItemUsageLogSerializer(log).data, status=201)


class UserUsageLogsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, user_id):
        month_raw = request.query_params.get('month')
        year_raw = request.query_params.get('year')
        try:
            month = int(month_raw)
            year = int(year_raw)
        except (TypeError, ValueError):
            return Response({'detail': 'month and year are required.'}, status=400)

        if month < 1 or month > 12 or year < 2000:
            return Response({'detail': 'Invalid month or year.'}, status=400)

        UserModel = get_user_model()
        try:
            user = UserModel.objects.get(pk=user_id)
        except UserModel.DoesNotExist:
            return Response({'detail': 'User not found.'}, status=404)

        can_manage_inventory = bool(
            request.user.is_admin
            or getattr(request.user, 'is_inventory_manager', False)
            or getattr(request.user, 'is_hk_inventory_manager', False)
            or getattr(request.user, 'is_horticulture_manager', False)
        )
        user_area_names = _hostel_office_staff_area_names(user)
        if not can_manage_inventory:
            if not _is_hostel_office(request.user):
                raise PermissionDenied('You do not have permission to view this usage report.')
            if not user_area_names:
                return Response({'detail': 'This staff member is not assigned to hostel areas.'}, status=403)

        logs_prefetch = Prefetch(
            'usage_logs',
            queryset=ItemUsageLog.objects.order_by('logged_at'),
        )
        issues_qs = (
            ItemIssue.objects
            .filter(
                request__requested_by_id=user_id,
                issued_at__year=year,
                issued_at__month=month,
            )
            .select_related('request__item')
            .prefetch_related(logs_prefetch)
            .annotate(
                total_used=Coalesce(
                    Sum('usage_logs__quantity_used'),
                    Value(0),
                    output_field=DecimalField(max_digits=10, decimal_places=2),
                )
            )
            .order_by('issued_at')
        )

        results = []
        for issue in issues_qs:
            item = issue.request.item
            issued_qty = Decimal(issue.issued_quantity).quantize(Decimal('0.01'))
            total_used = (issue.total_used or Decimal('0')).quantize(Decimal('0.01'))
            remaining = issued_qty - total_used
            if remaining < 0:
                remaining = Decimal('0.00')

            logs = []
            for log in issue.usage_logs.all():
                logs.append({
                    'date': log.logged_at,
                    'quantity_used': log.quantity_used.quantize(Decimal('0.01')),
                    'purpose': log.purpose,
                })

            results.append({
                'issue_id': issue.id,
                'item_name': item.name,
                'unit': item.unit,
                'issued_quantity': issued_qty,
                'total_used': total_used,
                'remaining': remaining.quantize(Decimal('0.01')),
                'logs': logs,
            })

        return Response({
            'user': {
                'id': user.id,
                'name': user.get_full_name() or user.username,
                'area_names': user_area_names or [],
            },
            'month': month,
            'year': year,
            'items': results,
        })


class ItemUsageReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        params = getattr(request, 'query_params', getattr(request, 'GET', {}))
        category = params.get('category')
        exclude_category = params.get('exclude_category')
        area = params.get('area')
        person = params.get('person')
        item = params.get('item')
        date_from = params.get('date_from')
        date_to = params.get('date_to')
        month = params.get('month')
        year = params.get('year')
        download = params.get('download')

        qs = ItemUsageLog.objects.select_related(
            'issue',
            'issue__request',
            'issue__request__item',
            'issue__request__item__category',
            'issue__request__requested_by',
            'logged_by',
        ).order_by('-logged_at')

        # Filter by category
        if category:
            if str(category).isdigit():
                qs = qs.filter(issue__request__item__category_id=category)
            else:
                qs = qs.filter(
                    dm.Q(issue__request__item__category__name__iexact=category)
                    | dm.Q(issue__request__item__category__name__icontains='Horticulture')
                    | dm.Q(issue__request__purpose__icontains='[Horticulture')
                )

        if exclude_category:
            if str(exclude_category).isdigit():
                qs = qs.exclude(issue__request__item__category_id=exclude_category)
            else:
                qs = qs.exclude(
                    dm.Q(issue__request__item__category__name__iexact=exclude_category)
                    | dm.Q(issue__request__item__category__name__icontains='Horticulture')
                    | dm.Q(issue__request__purpose__icontains='[Horticulture')
                )

        # Collect all available filter options across the category scope before applying specific query filters
        from apps.horticulture.models import HorticultureStockRequest, HorticultureArea
        from apps.housekeeping.models import HKStockRequest

        avail_areas = set()
        avail_items = set()
        avail_people = set()

        if category and 'horticulture' in str(category).lower():
            try:
                for ha in HorticultureArea.objects.filter(is_active=True).values_list('name', flat=True):
                    avail_areas.add(ha)
            except Exception:
                pass

        scope_logs = list(qs)
        scope_req_ids = [l.issue.request_id for l in scope_logs if l.issue and l.issue.request_id]
        scope_horti_map = {
            hr.inventory_request_id: hr.area.name
            for hr in HorticultureStockRequest.objects.filter(inventory_request_id__in=scope_req_ids).select_related('area')
            if hr.area
        }
        scope_hk_map = {
            hr.inventory_request_id: hr.area.name
            for hr in HKStockRequest.objects.filter(inventory_request_id__in=scope_req_ids).select_related('area')
            if hr.area
        }

        for l in scope_logs:
            issue = l.issue
            req = issue.request if issue else None
            it = req.item if req else None
            if it and it.name:
                avail_items.add(it.name)
            if l.logged_by:
                name = l.logged_by.get_full_name() or l.logged_by.username
                if name:
                    avail_people.add(name)
            if req and req.requested_by:
                name = req.requested_by.get_full_name() or req.requested_by.username
                if name:
                    avail_people.add(name)
            an = None
            if req:
                an = scope_horti_map.get(req.id) or scope_hk_map.get(req.id)
                if not an and req.purpose:
                    p = req.purpose
                    if p.startswith('[Horticulture - '):
                        end = p.find(']')
                        if end > 16:
                            an = p[16:end]
                    elif p.startswith('[HK - '):
                        end = p.find(']')
                        if end > 6:
                            an = p[6:end]
            if an:
                avail_areas.add(an)

        # Date filtering
        if date_from:
            qs = qs.filter(logged_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(logged_at__date__lte=date_to)
        if month and str(month).isdigit():
            qs = qs.filter(logged_at__month=int(month))
        if year and str(year).isdigit():
            qs = qs.filter(logged_at__year=int(year))

        # Item filtering
        if item and item != 'all':
            if str(item).isdigit():
                qs = qs.filter(issue__request__item_id=item)
            else:
                qs = qs.filter(issue__request__item__name__iexact=item)

        # Person filtering
        if person and person != 'all':
            qs = qs.filter(
                dm.Q(logged_by__username=person)
                | dm.Q(logged_by__first_name__icontains=person)
                | dm.Q(logged_by__last_name__icontains=person)
                | dm.Q(issue__request__requested_by__username=person)
                | dm.Q(issue__request__requested_by__first_name__icontains=person)
                | dm.Q(issue__request__requested_by__last_name__icontains=person)
            )

        logs_list = list(qs)
        req_ids = [l.issue.request_id for l in logs_list if l.issue and l.issue.request_id]

        horti_req_map = {
            hr.inventory_request_id: hr.area.name
            for hr in HorticultureStockRequest.objects.filter(inventory_request_id__in=req_ids).select_related('area')
            if hr.area
        }
        hk_req_map = {
            hr.inventory_request_id: hr.area.name
            for hr in HKStockRequest.objects.filter(inventory_request_id__in=req_ids).select_related('area')
            if hr.area
        }

        rows = []
        item_agg = {}
        area_agg = {}

        for log in logs_list:
            issue = log.issue
            req = issue.request if issue else None
            item_obj = req.item if req else None

            area_name = None
            if req:
                area_name = horti_req_map.get(req.id) or hk_req_map.get(req.id)
                if not area_name:
                    p = req.purpose or ''
                    if p.startswith('[Horticulture - '):
                        end = p.find(']')
                        if end > 16:
                            area_name = p[16:end]
                    elif p.startswith('[HK - '):
                        end = p.find(']')
                        if end > 6:
                            area_name = p[6:end]

            if not area_name:
                area_name = 'General'

            if area and area != 'all' and area_name.lower() != area.lower():
                continue

            qty = float(log.quantity_used) if log.quantity_used is not None else 0.0
            item_name = item_obj.name if item_obj else '—'
            unit = item_obj.unit if item_obj else ''

            if item_name not in item_agg:
                item_agg[item_name] = {'item_name': item_name, 'unit': unit, 'total_used': 0.0, 'log_count': 0}
            item_agg[item_name]['total_used'] = round(item_agg[item_name]['total_used'] + qty, 2)
            item_agg[item_name]['log_count'] += 1

            if area_name not in area_agg:
                area_agg[area_name] = {'area_name': area_name, 'log_count': 0, 'items': set()}
            area_agg[area_name]['log_count'] += 1
            area_agg[area_name]['items'].add(item_name)

            rows.append({
                'id': log.id,
                'logged_at': log.logged_at.isoformat() if log.logged_at else None,
                'date': log.logged_at.strftime('%Y-%m-%d') if log.logged_at else '',
                'time': log.logged_at.strftime('%I:%M %p') if log.logged_at else '',
                'item_id': item_obj.id if item_obj else None,
                'item_name': item_name,
                'item_code': item_obj.item_code if item_obj else '—',
                'item_unit': unit,
                'category': item_obj.category.name if item_obj and item_obj.category else '',
                'quantity_used': qty,
                'purpose': log.purpose or '',
                'notes': log.notes or '',
                'logged_by': log.logged_by.get_full_name() or log.logged_by.username if log.logged_by else '—',
                'requested_by': req.requested_by.get_full_name() or req.requested_by.username if req and req.requested_by else '—',
                'area_name': area_name,
                'issue_id': issue.id if issue else None,
                'issued_quantity': float(issue.issued_quantity) if issue and issue.issued_quantity else 0.0,
                'issued_at': issue.issued_at.strftime('%Y-%m-%d') if issue and issue.issued_at else '',
            })

        area_summary = [
            {'area_name': k, 'log_count': v['log_count'], 'items_used': sorted(list(v['items']))}
            for k, v in sorted(area_agg.items(), key=lambda x: -x[1]['log_count'])
        ]
        item_summary = sorted(item_agg.values(), key=lambda x: -x['total_used'])

        if download == 'csv':
            response = HttpResponse(content_type='text/csv; charset=utf-8-sig')
            filename = f"usage_report_{timezone.localdate()}.csv"
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            writer = csv.writer(response)
            writer.writerow([
                'Log ID', 'Date', 'Time', 'Area', 'Item Name', 'Item Code',
                'Quantity Used', 'Unit', 'Purpose / Work Done',
                'Reported By', 'Requested By', 'Issue ID', 'Issued Qty', 'Issued Date'
            ])
            for r in rows:
                writer.writerow([
                    r['id'], r['date'], r['time'], r['area_name'], r['item_name'], r['item_code'],
                    r['quantity_used'], r['item_unit'], r['purpose'],
                    r['logged_by'], r['requested_by'], r['issue_id'], r['issued_quantity'], r['issued_at']
                ])
            return response

        total_qty = sum(r['quantity_used'] for r in rows)
        return Response({
            'summary': {
                'total_logs': len(rows),
                'total_quantity_used': round(total_qty, 2),
                'unique_items_count': len(item_agg),
                'unique_areas_count': len(area_agg),
            },
            'filters': {
                'areas': sorted(list(avail_areas)),
                'items': sorted(list(avail_items)),
                'people': sorted(list(avail_people)),
            },
            'item_summary': item_summary,
            'area_summary': area_summary,
            'logs': rows,
        })


# ─────────────────────────────────────────────────
# USER ACTIVITY VIEW
# ─────────────────────────────────────────────────

class UserActivityView(APIView):
    permission_classes = [IsAdminOrHKInventoryManager]

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
    permission_classes = [IsInventoryReportViewer]

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
            is_reversed=False,
        ).exclude(request__status=ItemRequest.Status.REJECTED).count()

        unfinalized_consumables = ItemIssue.objects.filter(
            request__item__item_type='consumable',
            usage_finalized=False,
            is_reversed=False,
        ).exclude(request__status=ItemRequest.Status.REJECTED).count()

        overdue_returns = ItemIssue.objects.filter(
            request__item__item_type='asset',
            returned_at__isnull=True,
            expected_return_date__lt=timezone.now().date(),
            is_reversed=False,
        ).exclude(request__status=ItemRequest.Status.REJECTED).count()

        return Response({
            'total_items': total_items,
            'low_stock_count': low_stock_count,
            'out_of_stock_count': out_of_stock,
            'pending_requests': pending_requests,
            'unreturned_assets': unreturned_assets,
            'unfinalized_consumables': unfinalized_consumables,
            'overdue_returns': overdue_returns,
        })

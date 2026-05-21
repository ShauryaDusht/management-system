from django.utils import timezone
from django.utils.dateparse import parse_date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from django.db import transaction
from django.db.models import Sum, F, Count, Value, DecimalField, Prefetch
from django.db.models.functions import Coalesce
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from rest_framework.exceptions import PermissionDenied

from .models import Category, Item, ItemRequest, ItemIssue, ItemUsageLog, PurchaseRequest, StockEntry
from .serializers import (
    CategorySerializer, ItemSerializer,
    StockEntrySerializer,
    ItemRequestSerializer, ItemRequestReviewSerializer,
    PurchaseRequestSerializer,
    ItemIssueSerializer, ItemUsageLogSerializer,
    ReturnAssetSerializer, FinalizeConsumableSerializer,
    UserActivitySerializer,
    StandardPagination,
)
from apps.users.permissions import IsAdmin, IsSupervisor
from .permissions import IsAdminOrInventoryManager


def _sync_horticulture_request_status(item_request, status_value):
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
            return [IsAdmin()]
        return [IsAuthenticated()]


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
            qs = qs.filter(requested_by=user)
        return qs

    def perform_create(self, serializer):
        role = getattr(self.request.user, 'role', '')
        if role not in ['inventory_manager', 'admin']:
            raise PermissionDenied('Only inventory managers/admin can create purchase requests.')
        serializer.save(requested_by=self.request.user)


class PurchaseRequestDecisionView(APIView):
    permission_classes = [IsAdmin]

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
        _sync_horticulture_request_status(item_request, item_request.status)

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

        reserved_to_release = min(item.reserved_quantity, item_request.quantity_requested)
        Item.objects.filter(pk=item.pk).update(
            available_quantity=F('available_quantity') - issued_qty,
            reserved_quantity=F('reserved_quantity') - reserved_to_release,
        )

        issue = ItemIssue.objects.create(
            request=item_request,
            issued_by=request.user,
            issued_quantity=issued_qty,
            expected_return_date=expected_return_date,
            notes=request.data.get('notes', ''),
        )

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

        if user.is_admin or user.is_inventory_manager:
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
    permission_classes = [IsAdminOrInventoryManager]

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
            },
            'month': month,
            'year': year,
            'items': results,
        })


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

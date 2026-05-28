from django.urls import path

from .api_views import (
    AdjustStockView,
    ApproveRequestView, RejectRequestView, MarkUrgentView,
)
from .views import (
    CategoryListCreateView,
    ItemListCreateView, ItemDetailView, LowStockItemsView,
    ItemHistoryView, ItemStockEntriesView,
    StockEntryListCreateView,
    ItemRequestListCreateView, ItemRequestBatchCreateView, ItemRequestDetailView,
    PurchaseRequestListCreateView, PurchaseRequestDecisionView,
    ReviewRequestView, IssueItemView,
    ItemIssueListView,
    ReturnAssetView, FinalizeConsumableView, IssueUsageLogView,
    UserActivityView,
    UserUsageLogsView,
    DashboardSummaryView,
)

# ─── BUG-02 FIX: Route audit ─────────────────────────────────────────────────
#
# The old file had two overlapping route families:
#
#   PRIMARY (views.py)       /inventory/items/           paginated, uses ItemSerializer
#   LEGACY  (api_views.py)   /inventory/api/items/       no pagination, same serializer
#
#   PRIMARY (views.py)       /inventory/requests/        full workflow endpoint
#   LEGACY  (api_views.py)   /inventory/api/requests/    same, via ViewSet
#
# The LEGACY /api/items/ and /api/requests/ routes have been REMOVED.
# Every frontend page has been updated to use the PRIMARY routes via inventoryAPI.*.
#
# The /api/ routes below are KEPT because they have NO equivalent in views.py:
#   - adjust-stock   → AdjustStockView   (no equivalent ItemAdjustView in views.py)
#   - approve        → ApproveRequestView (separate from ReviewRequestView by design)
#   - reject         → RejectRequestView
#   - mark-urgent    → MarkUrgentView
#
# These are the ONLY remaining api_views.py routes. Everything else is primary.
# ─────────────────────────────────────────────────────────────────────────────

urlpatterns = [
    # ── Categories ──────────────────────────────────────────────────────────
    path('categories/', CategoryListCreateView.as_view(), name='category-list'),

    # ── Items ────────────────────────────────────────────────────────────────
    path('items/', ItemListCreateView.as_view(), name='item-list'),
    path('items/low-stock/', LowStockItemsView.as_view(), name='item-low-stock'),
    path('items/<int:pk>/', ItemDetailView.as_view(), name='item-detail'),
    path('items/<int:pk>/history/', ItemHistoryView.as_view(), name='item-history'),
    path('items/<int:pk>/stock-entries/', ItemStockEntriesView.as_view(), name='item-stock'),

    # ── Stock entries (replenishment log) ────────────────────────────────────
    path('stock-entries/', StockEntryListCreateView.as_view(), name='stock-entry-list'),

    # ── Requests ─────────────────────────────────────────────────────────────
    path('requests/', ItemRequestListCreateView.as_view(), name='request-list'),
    path('requests/batch/', ItemRequestBatchCreateView.as_view(), name='request-batch-create'),
    path('requests/<int:pk>/', ItemRequestDetailView.as_view(), name='request-detail'),
    path('requests/<int:pk>/review/', ReviewRequestView.as_view(), name='request-review'),
    path('requests/<int:pk>/issue/', IssueItemView.as_view(), name='request-issue'),
    path('purchase-requests/', PurchaseRequestListCreateView.as_view(), name='purchase-request-list'),
    path('purchase-requests/<int:pk>/decision/', PurchaseRequestDecisionView.as_view(), name='purchase-request-decision'),

    # ── Issues ───────────────────────────────────────────────────────────────
    path('issues/', ItemIssueListView.as_view(), name='issue-list'),
    path('issues/<int:pk>/return/', ReturnAssetView.as_view(), name='issue-return'),
    path('issues/<int:pk>/finalize/', FinalizeConsumableView.as_view(), name='issue-finalize'),
    path('issues/<int:pk>/log-usage/', IssueUsageLogView.as_view(), name='issue-log-usage'),

    # ── User activity (admin) ────────────────────────────────────────────────
    path('activity/users/<int:user_id>/', UserActivityView.as_view(), name='user-activity'),
    path('users/<int:user_id>/usage-logs/', UserUsageLogsView.as_view(), name='user-usage-logs'),

    # ── Dashboard ────────────────────────────────────────────────────────────
    path('dashboard/', DashboardSummaryView.as_view(), name='dashboard-summary'),

    # ── Retained /api/ routes (no primary equivalent exists for these) ────────
    # These endpoints have no counterpart in views.py and are still actively
    # used by the frontend. They are kept intentionally and are NOT duplicates.
    path('api/items/<int:pk>/adjust-stock/', AdjustStockView.as_view(), name='item-adjust-stock'),
    path('api/requests/<int:pk>/approve/', ApproveRequestView.as_view(), name='api-request-approve'),
    path('api/requests/<int:pk>/reject/', RejectRequestView.as_view(), name='api-request-reject'),
    path('api/requests/<int:pk>/mark-urgent/', MarkUrgentView.as_view(), name='api-request-mark-urgent'),
]









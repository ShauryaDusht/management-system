from django.urls import path

from .api_views import (
    AdjustStockView, InventoryStatsView,
    ApproveRequestView, RejectRequestView, MarkUrgentView,
)
from .views import (
    CategoryListCreateView, CategoryDetailView,
    ItemListCreateView, ItemDetailView, LowStockItemsView,
    ItemHistoryView, ItemStockEntriesView,
    StockEntryListCreateView,
    ItemRequestListCreateView, ItemRequestDetailView,
    ReviewRequestView, IssueItemView,
    ItemIssueListView,
    ReturnAssetView, FinalizeConsumableView,
    UserActivityView,
    DashboardSummaryView,
)

urlpatterns = [
    # ── Categories ──────────────────────────────────────────────────────────
    path('categories/', CategoryListCreateView.as_view(), name='category-list'),
    path('categories/<int:pk>/', CategoryDetailView.as_view(), name='category-detail'),

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
    path('requests/<int:pk>/', ItemRequestDetailView.as_view(), name='request-detail'),
    path('requests/<int:pk>/review/', ReviewRequestView.as_view(), name='request-review'),
    path('requests/<int:pk>/issue/', IssueItemView.as_view(), name='request-issue'),

    # ── Issues ───────────────────────────────────────────────────────────────
    path('issues/', ItemIssueListView.as_view(), name='issue-list'),
    path('issues/<int:pk>/return/', ReturnAssetView.as_view(), name='issue-return'),
    path('issues/<int:pk>/finalize/', FinalizeConsumableView.as_view(), name='issue-finalize'),

    # ── User activity (admin) ────────────────────────────────────────────────
    path('activity/users/<int:user_id>/', UserActivityView.as_view(), name='user-activity'),

    # ── Dashboard ────────────────────────────────────────────────────────────
    path('dashboard/', DashboardSummaryView.as_view(), name='dashboard-summary'),

    # ── React admin API endpoints ────────────────────────────────────────────
    # These serve the React frontend and use slightly different serialization.
    # They are kept separate to avoid breaking the frontend during migration.
    path('api/items/<int:pk>/adjust-stock/', AdjustStockView.as_view(), name='item-adjust-stock'),
    path('api/stats/', InventoryStatsView.as_view(), name='inventory-stats'),
    path('api/requests/<int:pk>/approve/', ApproveRequestView.as_view(), name='api-request-approve'),
    path('api/requests/<int:pk>/reject/', RejectRequestView.as_view(), name='api-request-reject'),
    path('api/requests/<int:pk>/mark-urgent/', MarkUrgentView.as_view(), name='api-request-mark-urgent'),
]

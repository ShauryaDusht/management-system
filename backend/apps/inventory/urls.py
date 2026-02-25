from django.urls import path
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
    # Categories
    path('categories/', CategoryListCreateView.as_view(), name='category-list'),
    path('categories/<int:pk>/', CategoryDetailView.as_view(), name='category-detail'),

    # Items
    path('items/', ItemListCreateView.as_view(), name='item-list'),
    path('items/low-stock/', LowStockItemsView.as_view(), name='item-low-stock'),
    path('items/<int:pk>/', ItemDetailView.as_view(), name='item-detail'),
    path('items/<int:pk>/history/', ItemHistoryView.as_view(), name='item-history'),
    path('items/<int:pk>/stock-entries/', ItemStockEntriesView.as_view(), name='item-stock'),

    # Stock entries (replenishment log)
    path('stock-entries/', StockEntryListCreateView.as_view(), name='stock-entry-list'),

    # Requests
    path('requests/', ItemRequestListCreateView.as_view(), name='request-list'),
    path('requests/<int:pk>/', ItemRequestDetailView.as_view(), name='request-detail'),
    path('requests/<int:pk>/review/', ReviewRequestView.as_view(), name='request-review'),
    path('requests/<int:pk>/issue/', IssueItemView.as_view(), name='request-issue'),

    # Issues
    path('issues/', ItemIssueListView.as_view(), name='issue-list'),
    path('issues/<int:pk>/return/', ReturnAssetView.as_view(), name='issue-return'),
    path('issues/<int:pk>/finalize/', FinalizeConsumableView.as_view(), name='issue-finalize'),

    # User activity (admin)
    path('activity/users/<int:user_id>/', UserActivityView.as_view(), name='user-activity'),

    # Dashboard
    path('dashboard/', DashboardSummaryView.as_view(), name='dashboard-summary'),
]

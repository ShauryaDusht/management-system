from django.urls import path
from .views import (
    CategoryListCreateView, CategoryDetailView,
    ItemListCreateView, ItemDetailView, LowStockItemsView,
    ItemRequestListCreateView, ItemRequestDetailView,
    ReviewRequestView, IssueItemView,
    ItemIssueListView,
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

    # Requests (Supervisor → Manager workflow)
    path('requests/', ItemRequestListCreateView.as_view(), name='request-list'),
    path('requests/<int:pk>/', ItemRequestDetailView.as_view(), name='request-detail'),
    path('requests/<int:pk>/review/', ReviewRequestView.as_view(), name='request-review'),
    path('requests/<int:pk>/issue/', IssueItemView.as_view(), name='request-issue'),

    # Issues
    path('issues/', ItemIssueListView.as_view(), name='issue-list'),

    # Dashboard
    path('dashboard/', DashboardSummaryView.as_view(), name='dashboard-summary'),
]

from django.urls import path
from .views import InventoryReportView, RequestsReportView, IssuesReportView, StockMovementReportView

urlpatterns = [
    path('inventory/', InventoryReportView.as_view(), name='reports-inventory'),
    path('requests/', RequestsReportView.as_view(), name='reports-requests'),
    path('issues/', IssuesReportView.as_view(), name='reports-issues'),
    path('stock-movement/', StockMovementReportView.as_view(), name='reports-stock-movement'),
]

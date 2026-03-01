from django.urls import path
from .views import (
    InventoryReportView,
    RequestsReportView,
    MonthlyReportListView,
    MonthlyReportGenerateView,
    MonthlyReportDetailView,
    MonthlyReportCSVView,
    MonthlyReportPDFView,
)

urlpatterns = [
    # Existing
    path('inventory/', InventoryReportView.as_view(), name='reports-inventory'),
    path('requests/', RequestsReportView.as_view(), name='reports-requests'),

    # Phase 3A — Monthly procurement reports
    path('monthly/', MonthlyReportListView.as_view(), name='monthly-report-list'),
    path('monthly/generate/', MonthlyReportGenerateView.as_view(), name='monthly-report-generate'),
    path('monthly/<int:pk>/', MonthlyReportDetailView.as_view(), name='monthly-report-detail'),

    # Phase 3B — File downloads
    path('monthly/<int:pk>/csv/', MonthlyReportCSVView.as_view(), name='monthly-report-csv'),
    path('monthly/<int:pk>/pdf/', MonthlyReportPDFView.as_view(), name='monthly-report-pdf'),
]

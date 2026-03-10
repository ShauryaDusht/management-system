from django.urls import path
from .views import (
    AreaIssuesReportView,
    ConsumptionReportDetailView,
    ConsumptionReportGenerateView,
    ConsumptionReportItemCSVView,
    ConsumptionReportListView,
    ConsumptionReportRequesterCSVView,
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
    path('area-issues/', AreaIssuesReportView.as_view(), name='area-issues-report'),

    # Phase 3A — Monthly procurement reports
    path('monthly/', MonthlyReportListView.as_view(), name='monthly-report-list'),
    path('monthly/generate/', MonthlyReportGenerateView.as_view(), name='monthly-report-generate'),
    path('monthly/<int:pk>/', MonthlyReportDetailView.as_view(), name='monthly-report-detail'),

    # Phase 3B — File downloads
    path('monthly/<int:pk>/csv/', MonthlyReportCSVView.as_view(), name='monthly-report-csv'),
    path('monthly/<int:pk>/pdf/', MonthlyReportPDFView.as_view(), name='monthly-report-pdf'),

    # Item consumption reports
    path('consumption/', ConsumptionReportListView.as_view(), name='consumption-report-list'),
    path('consumption/generate/', ConsumptionReportGenerateView.as_view(), name='consumption-report-generate'),
    path('consumption/<int:pk>/', ConsumptionReportDetailView.as_view(), name='consumption-report-detail'),
    path('consumption/<int:pk>/csv/items/', ConsumptionReportItemCSVView.as_view(), name='consumption-report-item-csv'),
    path('consumption/<int:pk>/csv/requesters/', ConsumptionReportRequesterCSVView.as_view(), name='consumption-report-requester-csv'),
]

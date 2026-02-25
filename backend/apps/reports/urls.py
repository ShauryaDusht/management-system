from django.urls import path

from .views import InventoryReportView, RequestsReportView

urlpatterns = [
    path('inventory/', InventoryReportView.as_view(), name='reports-inventory'),
    path('requests/', RequestsReportView.as_view(), name='reports-requests'),
]

from django.urls import path
from .views import (
    HvacHealthView,
    HvacAuthCheckView,
    HvacLogsListView,
    HvacLogDetailView,
    HvacOverviewView,
    HvacSupervisorLogView,
    HvacPumpRatingsView,
    HvacImportCsvView,
    HvacImportUndoView,
    HvacImportHistoryView,
    HvacImportTemplateView,
)

urlpatterns = [
    path('health/', HvacHealthView.as_view(), name='hvac-health'),
    path('auth/', HvacAuthCheckView.as_view(), name='hvac-auth-check'),
    path('logs/', HvacLogsListView.as_view(), name='hvac-logs-list'),
    path('logs/<str:log_id>/', HvacLogDetailView.as_view(), name='hvac-log-detail'),
    path('overview/', HvacOverviewView.as_view(), name='hvac-overview'),
    path('supervisor/', HvacSupervisorLogView.as_view(), name='hvac-supervisor-log'),
    path('pump-ratings/', HvacPumpRatingsView.as_view(), name='hvac-pump-ratings'),
    path('import-csv/', HvacImportCsvView.as_view(), name='hvac-import-csv'),
    path('import-data/', HvacImportCsvView.as_view(), name='hvac-import-data'),
    path('import-undo/', HvacImportUndoView.as_view(), name='hvac-import-undo'),
    path('import-history/', HvacImportHistoryView.as_view(), name='hvac-import-history'),
    path('import-template/', HvacImportTemplateView.as_view(), name='hvac-import-template'),
]



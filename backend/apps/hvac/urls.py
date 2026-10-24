from django.urls import path
from .views import (
    HvacHealthView,
    HvacAuthCheckView,
    HvacLogsListView,
    HvacLogDetailView,
    HvacOverviewView,
    HvacSupervisorLogView,
    HvacPumpRatingsView,
)

urlpatterns = [
    path('health/', HvacHealthView.as_view(), name='hvac-health'),
    path('auth/', HvacAuthCheckView.as_view(), name='hvac-auth-check'),
    path('logs/', HvacLogsListView.as_view(), name='hvac-logs-list'),
    path('logs/<str:log_id>/', HvacLogDetailView.as_view(), name='hvac-log-detail'),
    path('overview/', HvacOverviewView.as_view(), name='hvac-overview'),
    path('supervisor/', HvacSupervisorLogView.as_view(), name='hvac-supervisor-log'),
    path('pump-ratings/', HvacPumpRatingsView.as_view(), name='hvac-pump-ratings'),
]

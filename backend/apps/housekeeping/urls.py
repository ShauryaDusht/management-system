from django.urls import path

from . import api_views
from .htmx_urls import urlpatterns as htmx_patterns

api_urlpatterns = [
    path('areas/', api_views.HKAreaListView.as_view(), name='hk-api-areas'),
    path('workers/', api_views.HKWorkerListView.as_view(), name='hk-api-workers'),
    path('workers/create/', api_views.HKWorkerCreateView.as_view(), name='hk-api-workers-create'),
    path('workers/<int:pk>/', api_views.HKWorkerDetailView.as_view(), name='hk-api-workers-detail'),
    path(
        'worker-selection-requests/',
        api_views.HKWorkerSelectionRequestListCreateView.as_view(),
        name='hk-api-worker-selection-requests',
    ),
    path(
        'worker-selection-requests/<int:pk>/decision/',
        api_views.HKWorkerSelectionRequestDecisionView.as_view(),
        name='hk-api-worker-selection-requests-decision',
    ),
    path('daily-records/', api_views.HKDailyRecordListView.as_view(), name='hk-api-records'),
    path('schedule-templates/', api_views.HKScheduleTemplateListView.as_view(), name='hk-api-templates'),
    path('attendance-summary/', api_views.HKAttendanceSummaryView.as_view(), name='hk-api-attendance'),
    path('stock-requests/', api_views.HKStockRequestListView.as_view(), name='hk-api-stock'),
    path('stock-requests/<int:pk>/status/', api_views.HKStockRequestStatusUpdateView.as_view(), name='hk-api-stock-status'),
    path('assign-area-task/', api_views.HKAssignAreaTaskView.as_view(), name='hk-api-assign-area-task'),
    path('promote-task-to-daily/', api_views.HKPromoteTaskToDailyView.as_view(), name='hk-api-promote-task-to-daily'),
    path('alerts/', api_views.HKAlertListView.as_view(), name='hk-api-alerts'),
    path('dashboard-summary/', api_views.HKDashboardSummaryView.as_view(), name='hk-api-dashboard'),
]

urlpatterns = htmx_patterns + api_urlpatterns

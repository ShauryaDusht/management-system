from django.urls import path

from . import api_views
from .htmx_urls import urlpatterns as htmx_patterns

api_urlpatterns = [
    path('areas/', api_views.HKAreaListCreateView.as_view(), name='hk-api-areas'),
    path('workers/', api_views.HKWorkerListView.as_view(), name='hk-api-workers'),
    path('workers/create/', api_views.HKWorkerCreateView.as_view(), name='hk-api-workers-create'),
    path('workers/<int:pk>/', api_views.HKWorkerDetailView.as_view(), name='hk-api-workers-detail'),
    path(
        'workers/reports/combined/csv/',
        api_views.HKWorkersCombinedCSVView.as_view(),
        name='hk-api-workers-combined-csv',
    ),
    path('workers/<int:pk>/report/', api_views.HKWorkerReportView.as_view(), name='hk-api-worker-report'),
    path('workers/<int:pk>/report/csv/', api_views.HKWorkerReportCSVView.as_view(), name='hk-api-worker-report-csv'),
    path(
        'workers/<int:pk>/report/regenerate/',
        api_views.HKWorkerReportRegenerateView.as_view(),
        name='hk-api-worker-report-regenerate',
    ),
    path(
        'supervisors/<int:pk>/report/',
        api_views.SupervisorReportView.as_view(),
        name='hk-api-supervisor-report',
    ),
    path(
        'supervisors/<int:pk>/report/csv/',
        api_views.SupervisorReportCSVView.as_view(),
        name='hk-api-supervisor-report-csv',
    ),
    path(
        'supervisors/<int:pk>/report/regenerate/',
        api_views.SupervisorReportRegenerateView.as_view(),
        name='hk-api-supervisor-report-regenerate',
    ),
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
    path(
        'incharge-assignments/',
        api_views.HKInchargeAssignmentListView.as_view(),
        name='hk-api-incharge-assignments',
    ),
    path(
        'incharge-assignments/report/',
        api_views.HKInchargeReportView.as_view(),
        name='hk-api-incharge-report',
    ),
    path(
        'incharge-assignments/<uuid:pk>/decision/',
        api_views.HKInchargeAssignmentDecisionView.as_view(),
        name='hk-api-incharge-assignments-decision',
    ),
    path('leave-requests/', api_views.HKLeaveRequestListView.as_view(), name='hk-api-leave-requests'),
    path('incharge-notifications/', api_views.HKInchargeNotificationListView.as_view(), name='hk-api-incharge-notifications'),
    path('daily-records/', api_views.HKDailyRecordListView.as_view(), name='hk-api-records'),
    path('schedule-templates/', api_views.HKScheduleTemplateListCreateView.as_view(), name='hk-api-templates'),
    path('schedule-templates/<int:pk>/', api_views.HKScheduleTemplateDetailView.as_view(), name='hk-api-templates-detail'),
    path('attendance-summary/', api_views.HKAttendanceSummaryView.as_view(), name='hk-api-attendance'),
    path('staff-attendance/', api_views.HKStaffAttendanceListView.as_view(), name='hk-api-staff-attendance'),
    path('stock-requests/', api_views.HKStockRequestListView.as_view(), name='hk-api-stock'),
    path('stock-requests/<int:pk>/status/', api_views.HKStockRequestStatusUpdateView.as_view(), name='hk-api-stock-status'),
    path('assign-area-task/', api_views.HKAssignAreaTaskView.as_view(), name='hk-api-assign-area-task'),
    path('promote-task-to-daily/', api_views.HKPromoteTaskToDailyView.as_view(), name='hk-api-promote-task-to-daily'),
    path('alerts/', api_views.HKAlertListView.as_view(), name='hk-api-alerts'),
    path('dashboard-summary/', api_views.HKDashboardSummaryView.as_view(), name='hk-api-dashboard'),
]

urlpatterns = htmx_patterns + api_urlpatterns

from django.urls import path

from .views import (
    AdminHorticultureAttendanceAPIView,
    AdminHorticultureSummaryAPIView,
    AdminHorticultureSupervisorsAPIView,
    AdminHorticultureZoneDetailAPIView,
    ManagerSeasonAPIView,
    ManagerWeeklySummaryAPIView,
    SupervisorAttendanceCreateAPIView,
    SupervisorDashboardAPIView,
    SupervisorTaskLogCreateAPIView,
    SupervisorTodayAttendanceAPIView,
    SupervisorWorkersAPIView,
    horticulture_attendance,
    horticulture_dashboard,
    horticulture_mark_task,
    horticulture_root,
)

urlpatterns = [
    path('admin/summary/', AdminHorticultureSummaryAPIView.as_view(), name='horti-admin-summary'),
    path('admin/zone/<int:zone_id>/', AdminHorticultureZoneDetailAPIView.as_view(), name='horti-admin-zone-detail'),
    path('admin/attendance/', AdminHorticultureAttendanceAPIView.as_view(), name='horti-admin-attendance'),
    path('admin/supervisors/', AdminHorticultureSupervisorsAPIView.as_view(), name='horti-admin-supervisors'),
    path('manager/season/', ManagerSeasonAPIView.as_view(), name='horti-manager-season'),
    path('manager/weekly-summary/', ManagerWeeklySummaryAPIView.as_view(), name='horti-manager-weekly-summary'),
    path('supervisor/dashboard/', SupervisorDashboardAPIView.as_view(), name='horti-supervisor-dashboard'),
    path('supervisor/workers/', SupervisorWorkersAPIView.as_view(), name='horti-supervisor-workers'),
    path('supervisor/task-log/', SupervisorTaskLogCreateAPIView.as_view(), name='horti-supervisor-task-log'),
    path('supervisor/attendance/', SupervisorAttendanceCreateAPIView.as_view(), name='horti-supervisor-attendance'),
    path('supervisor/attendance/today/', SupervisorTodayAttendanceAPIView.as_view(), name='horti-supervisor-attendance-today'),
]

mobile_urlpatterns = [
    path('', horticulture_root, name='horti-root'),
    path('dashboard/', horticulture_dashboard, name='horti-dashboard'),
    path('mark-task/', horticulture_mark_task, name='horti-mark-task'),
    path('attendance/', horticulture_attendance, name='horti-attendance'),
]

from django.urls import path

from .htmx_views import (
    hk_add_complaint,
    hk_add_extra_work,
    hk_attendance,
    hk_attendance_history,
    hk_complaint_detail,
    hk_complaints,
    hk_dashboard,
    hk_generate_daily_tasks,
    hk_mark_task_done,
    hk_my_tasks,
    hk_reports,
    hk_worker_task_detail,
    hk_worker_tasks,
)

urlpatterns = [
    path('', hk_dashboard, name='hk_dashboard'),
    path('attendance/', hk_attendance, name='hk_attendance'),
    path('attendance/history/', hk_attendance_history, name='hk_attendance_history'),
    path('tasks/my/', hk_my_tasks, name='hk_my_tasks'),
    path('tasks/mark-done/<int:task_id>/', hk_mark_task_done, name='hk_mark_task_done'),
    path('tasks/workers/', hk_worker_tasks, name='hk_worker_tasks'),
    path('tasks/worker/<int:worker_id>/', hk_worker_task_detail, name='hk_worker_task_detail'),
    path('tasks/extra/', hk_add_extra_work, name='hk_add_extra_work'),
    path('tasks/generate/', hk_generate_daily_tasks, name='hk_generate_daily_tasks'),
    path('complaints/', hk_complaints, name='hk_complaints'),
    path('complaints/add/', hk_add_complaint, name='hk_add_complaint'),
    path('complaints/<int:complaint_id>/', hk_complaint_detail, name='hk_complaint_detail'),
    path('reports/', hk_reports, name='hk_reports'),
]

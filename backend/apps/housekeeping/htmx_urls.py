from django.urls import path
from .htmx_views import (
    hk_login, hk_logout, hk_dashboard, hk_mark_task, hk_log_extra_work,
    hk_schedule, hk_attendance, hk_sunday_incharge,
    hk_stock, hk_stock_request, hk_profile, hk_alerts_manage,
    hk_assign_reliever, hk_worker_selection_request, hk_worker_selection_submit,
    hk_incharge_assign, hk_incharge_respond,
)

urlpatterns = [
    path('login/',    hk_login,             name='hk_login'),
    path('logout/',   hk_logout,            name='hk_logout'),
    path('dashboard/', hk_dashboard,        name='hk_dashboard'),
    path('task/<int:record_id>/mark/', hk_mark_task, name='hk_mark_task'),
    path('extra-work/', hk_log_extra_work,  name='hk_extra_work'),
    path('schedule/', hk_schedule,          name='hk_schedule'),
    path('attendance/', hk_attendance,      name='hk_attendance'),
    path('attendance/sunday-incharge/', hk_sunday_incharge, name='hk_sunday_incharge'),
    path('attendance/assign-reliever/', hk_assign_reliever, name='hk_assign_reliever'),
    path('worker-selection/request/', hk_worker_selection_request, name='hk_worker_selection_request'),
    path('worker-selection/submit/', hk_worker_selection_submit, name='hk_worker_selection_submit'),
    path('incharge/assign/', hk_incharge_assign, name='hk_incharge_assign'),
    path('incharge/respond/', hk_incharge_respond, name='hk_incharge_respond'),
    path('stock/',    hk_stock,             name='hk_stock'),
    path('stock/request/', hk_stock_request, name='hk_stock_request'),
    path('profile/',  hk_profile,           name='hk_profile'),
    path('alerts/',   hk_alerts_manage,     name='hk_alerts_manage'),
]

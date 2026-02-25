from django.urls import path

from .htmx_views import (
    mobile_login,
    mobile_dashboard,
    mobile_inventory_list,
    mobile_request_form,
    mobile_my_requests,
    mobile_manager_requests,
    mobile_approve_request,
    mobile_reject_request,
)

urlpatterns = [
    path('mobile/login/', mobile_login, name='mobile_login'),
    path('mobile/', mobile_dashboard, name='mobile_dashboard'),
    path('mobile/list/', mobile_inventory_list, name='mobile_inventory_list'),
    path('mobile/request/', mobile_request_form, name='mobile_request_form'),
    path('mobile/my-requests/', mobile_my_requests, name='mobile_my_requests'),
    path('mobile/manager-requests/', mobile_manager_requests, name='mobile_manager_requests'),
    path('mobile/approve/<int:pk>/', mobile_approve_request, name='mobile_approve_request'),
    path('mobile/reject/<int:pk>/', mobile_reject_request, name='mobile_reject_request'),
]

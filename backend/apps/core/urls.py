from django.urls import path
from apps.core.setup_views import setup_page
from apps.core import notification_views

urlpatterns = [
    path('setup/', setup_page, name='setup'),
    path('api/notifications/', notification_views.NotificationListAPIView.as_view(), name='api-notifications-list'),
    path('api/notifications/<int:pk>/read/', notification_views.NotificationMarkReadAPIView.as_view(), name='api-notifications-mark-read'),
    path('api/notifications/mark-all-read/', notification_views.NotificationMarkAllReadAPIView.as_view(), name='api-notifications-mark-all-read'),
    path('portal/notifications/', notification_views.portal_notifications_page, name='portal-notifications-page'),
    path('housekeeping/notifications/', notification_views.portal_notifications_page, name='hk-notifications-page'),
    path('horticulture/notifications/', notification_views.portal_notifications_page, name='horti-notifications-page'),
]

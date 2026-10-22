from django.urls import path
from .mobile_views import (
    mobile_wtp_root,
    mobile_dashboard,
    mobile_station_entry,
    mobile_block_entry,
    mobile_history,
    mobile_operators_view,
    mobile_gwssb_view,
)

mobile_urlpatterns = [
    path('', mobile_wtp_root, name='wtp-mobile-root'),
    path('dashboard/', mobile_dashboard, name='wtp-mobile-dashboard'),
    path('entry/<str:station>/', mobile_station_entry, name='wtp-mobile-entry'),
    path('blocks/', mobile_block_entry, name='wtp-mobile-blocks'),
    path('history/', mobile_history, name='wtp-mobile-history'),
    path('operators/', mobile_operators_view, name='wtp-mobile-operators'),
    path('gwssb/', mobile_gwssb_view, name='wtp-mobile-gwssb'),
]

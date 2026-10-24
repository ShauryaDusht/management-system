from django.urls import path
from .mobile_views import (
    mobile_hvac_root,
    mobile_dashboard,
    mobile_entry,
    mobile_flash,
    mobile_history,
    mobile_handover,
    mobile_operators_view,
)

mobile_urlpatterns = [
    path('', mobile_hvac_root, name='hvac-mobile-root'),
    path('dashboard/', mobile_dashboard, name='hvac-mobile-dashboard'),
    path('entry/', mobile_entry, name='hvac-mobile-entry'),
    path('flash/', mobile_flash, name='hvac-mobile-flash'),
    path('history/', mobile_history, name='hvac-mobile-history'),
    path('handover/', mobile_handover, name='hvac-mobile-handover'),
    path('operators/', mobile_operators_view, name='hvac-mobile-operators'),
]

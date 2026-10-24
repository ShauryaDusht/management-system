from django.urls import path
from .mobile_views import (
    mobile_substation_root,
    mobile_dashboard,
    mobile_entry_select,
    mobile_panel_entry,
    mobile_flash,
    mobile_history,
    mobile_operators_view,
)

mobile_urlpatterns = [
    path('', mobile_substation_root, name='substation-mobile-root'),
    path('dashboard/', mobile_dashboard, name='substation-mobile-dashboard'),
    path('entry/', mobile_entry_select, name='substation-mobile-entry-select'),
    path('entry/<str:sheet_id>/', mobile_panel_entry, name='substation-mobile-entry'),
    path('flash/', mobile_flash, name='substation-mobile-flash'),
    path('history/', mobile_history, name='substation-mobile-history'),
    path('operators/', mobile_operators_view, name='substation-mobile-operators'),
]

from django.urls import path
from .views import (
    LiftLicenseListView,
    LiftLicenseDetailView,
    LiftLicenseStatsView,
    LiftLicenseExportCSVView,
    LiftLicenseTriggerAlertView,
    LiftLicenseConfigView,
)

urlpatterns = [
    path('', LiftLicenseListView.as_view(), name='lift-license-list'),
    path('stats/', LiftLicenseStatsView.as_view(), name='lift-license-stats'),
    path('config/', LiftLicenseConfigView.as_view(), name='lift-license-config'),
    path('trigger-alert/', LiftLicenseTriggerAlertView.as_view(), name='lift-license-trigger-alert'),
    path('export/', LiftLicenseExportCSVView.as_view(), name='lift-license-export'),
    path('<int:pk>/', LiftLicenseDetailView.as_view(), name='lift-license-detail'),
]

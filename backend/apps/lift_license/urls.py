from django.urls import path
from .views import (
    LiftLicenseListView,
    LiftLicenseDetailView,
    LiftLicenseStatsView,
    LiftLicenseExportCSVView,
    LiftLicenseExportPDFView,
    LiftLicenseTriggerAlertView,
    LiftLicenseConfigView,
    LiftLicenseDocumentsListView,
    LiftLicenseDocumentDetailView,
)

urlpatterns = [
    path('', LiftLicenseListView.as_view(), name='lift-license-list'),
    path('stats/', LiftLicenseStatsView.as_view(), name='lift-license-stats'),
    path('config/', LiftLicenseConfigView.as_view(), name='lift-license-config'),
    path('trigger-alert/', LiftLicenseTriggerAlertView.as_view(), name='lift-license-trigger-alert'),
    path('export/', LiftLicenseExportCSVView.as_view(), name='lift-license-export'),
    path('export/pdf/', LiftLicenseExportPDFView.as_view(), name='lift-license-export-pdf'),
    path('<int:lift_id>/documents/', LiftLicenseDocumentsListView.as_view(), name='lift-license-documents-list'),
    path('documents/<int:pk>/', LiftLicenseDocumentDetailView.as_view(), name='lift-license-document-detail'),
    path('<int:pk>/', LiftLicenseDetailView.as_view(), name='lift-license-detail'),
]

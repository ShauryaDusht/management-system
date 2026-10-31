from django.urls import path

from .views import (
    geo_submit_form,
    geo_submit_record,
    GeoTrackerRecordsView,
    GeoTrackerRecordDetailView,
    GeoTrackerExportCSVView,
    GeoTrackerVarietiesView,
    GeoTrackerZonesView,
    GeoTrackerStatsView,
    GeoTrackerVarietyDetailView,
    GeoTrackerAreasView,
    GeoTrackerSyncStatusView,
    GeoTrackerSyncRecordsView,
    GeoTrackerSyncPhotosView,
)

# Public routes (no auth)
public_urlpatterns = [
    path('submit/', geo_submit_form, name='geo-submit-form'),
    path('submit/record/', geo_submit_record, name='geo-submit-record'),
]

# API routes (JWT auth / session auth)
urlpatterns = [
    path('sync/status/', GeoTrackerSyncStatusView.as_view(), name='geo-sync-status'),
    path('sync/records/', GeoTrackerSyncRecordsView.as_view(), name='geo-sync-records'),
    path('sync/records/<str:submission_id>/photos/', GeoTrackerSyncPhotosView.as_view(), name='geo-sync-photos'),
    path('records/export/', GeoTrackerExportCSVView.as_view(), name='geo-export-csv'),
    path('records/', GeoTrackerRecordsView.as_view(), name='geo-records'),
    path('records/<int:pk>/', GeoTrackerRecordDetailView.as_view(), name='geo-record-detail'),
    path('varieties/', GeoTrackerVarietiesView.as_view(), name='geo-varieties'),
    path('zones/', GeoTrackerAreasView.as_view(), name='geo-zones'),
    path('stats/', GeoTrackerStatsView.as_view(), name='geo-stats'),
    path('varieties/<int:pk>/', GeoTrackerVarietyDetailView.as_view(), name='geo-variety-detail'),
    path('areas/', GeoTrackerAreasView.as_view(), name='geo-areas'),
]

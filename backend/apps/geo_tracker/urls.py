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
)

# Public routes (no auth)
public_urlpatterns = [
    path('submit/', geo_submit_form, name='geo-submit-form'),
    path('submit/record/', geo_submit_record, name='geo-submit-record'),
]

# API routes (JWT auth via admin frontend)
urlpatterns = [
    path('records/', GeoTrackerRecordsView.as_view(), name='geo-records'),
    path('records/<int:pk>/', GeoTrackerRecordDetailView.as_view(), name='geo-record-detail'),
    path('records/export/', GeoTrackerExportCSVView.as_view(), name='geo-export-csv'),
    path('varieties/', GeoTrackerVarietiesView.as_view(), name='geo-varieties'),
    path('zones/', GeoTrackerZonesView.as_view(), name='geo-zones'),
    path('stats/', GeoTrackerStatsView.as_view(), name='geo-stats'),
]

from django.urls import path
from .views import (
    WtpHealthView,
    WtpSummaryView,
    StationReadingsView,
    StationReadingDetailView,
    BlockMetersView,
    BlockMeterDetailView,
    BlockReadingsView,
    StationMetersView,
    StationMeterDetailView,
    SupervisorLogsView,
    SupervisorVerifyView,
    SupervisorOverviewView,
)

urlpatterns = [
    path('health', WtpHealthView.as_view(), name='wtp-health'),
    path('health/', WtpHealthView.as_view(), name='wtp-health-slash'),
    path('summary', WtpSummaryView.as_view(), name='wtp-summary'),
    path('summary/', WtpSummaryView.as_view(), name='wtp-summary-slash'),

    # Station Readings
    path('readings', StationReadingsView.as_view(), name='wtp-readings'),
    path('readings/', StationReadingsView.as_view(), name='wtp-readings-slash'),
    path('readings/<int:pk>', StationReadingDetailView.as_view(), name='wtp-reading-detail'),
    path('readings/<int:pk>/', StationReadingDetailView.as_view(), name='wtp-reading-detail-slash'),

    # Block meters
    path('blocks/meters', BlockMetersView.as_view(), name='wtp-block-meters'),
    path('blocks/meters/', BlockMetersView.as_view(), name='wtp-block-meters-slash'),
    path('blocks/meters/<int:sr>', BlockMeterDetailView.as_view(), name='wtp-block-meter-detail'),
    path('blocks/meters/<int:sr>/', BlockMeterDetailView.as_view(), name='wtp-block-meter-detail-slash'),

    # Monthly block readings
    path('blocks', BlockReadingsView.as_view(), name='wtp-blocks'),
    path('blocks/', BlockReadingsView.as_view(), name='wtp-blocks-slash'),
    path('blocks/<str:month>', BlockReadingsView.as_view(), name='wtp-block-month'),
    path('blocks/<str:month>/', BlockReadingsView.as_view(), name='wtp-block-month-slash'),

    # Custom Station meters
    path('station-meters', StationMetersView.as_view(), name='wtp-station-meters'),
    path('station-meters/', StationMetersView.as_view(), name='wtp-station-meters-slash'),
    path('station-meters/<str:pk>', StationMeterDetailView.as_view(), name='wtp-station-meter-detail'),
    path('station-meters/<str:pk>/', StationMeterDetailView.as_view(), name='wtp-station-meter-detail-slash'),

    # Supervisor operations
    path('supervisor/logs', SupervisorLogsView.as_view(), name='wtp-supervisor-logs'),
    path('supervisor/logs/', SupervisorLogsView.as_view(), name='wtp-supervisor-logs-slash'),
    path('supervisor/verify', SupervisorVerifyView.as_view(), name='wtp-supervisor-verify'),
    path('supervisor/verify/', SupervisorVerifyView.as_view(), name='wtp-supervisor-verify-slash'),
    path('supervisor/overview', SupervisorOverviewView.as_view(), name='wtp-supervisor-overview'),
    path('supervisor/overview/', SupervisorOverviewView.as_view(), name='wtp-supervisor-overview-slash'),
]

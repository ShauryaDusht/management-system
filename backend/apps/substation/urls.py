from django.urls import path
from .views import (
    SubstationHealthView,
    SubstationSheetsView,
    SubstationQueryView,
    SubstationDocView,
    SubstationSummaryView,
    TorrentBillsView,
)

urlpatterns = [
    path('health', SubstationHealthView.as_view(), name='substation-health'),
    path('sheets/', SubstationSheetsView.as_view(), name='substation-sheets'),
    path('query', SubstationQueryView.as_view(), name='substation-query'),
    path('query/', SubstationQueryView.as_view(), name='substation-query-slash'),
    path('doc/<str:coll>/<str:doc_id>', SubstationDocView.as_view(), name='substation-doc'),
    path('doc/<str:coll>/<str:doc_id>/', SubstationDocView.as_view(), name='substation-doc-slash'),
    path('summary/', SubstationSummaryView.as_view(), name='substation-summary'),

    # Torrent Power Electricity Bill
    path('torrent', TorrentBillsView.as_view(), name='substation-torrent'),
    path('torrent/', TorrentBillsView.as_view(), name='substation-torrent-slash'),
    path('torrent/<str:month>', TorrentBillsView.as_view(), name='substation-torrent-month'),
    path('torrent/<str:month>/', TorrentBillsView.as_view(), name='substation-torrent-month-slash'),
]


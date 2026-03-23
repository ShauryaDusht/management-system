from django.urls import include, path
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse
from django.shortcuts import redirect
from config.admin import admin_site
from apps.core.portal_views import portal_root, portal_login, portal_logout
from apps.horticulture.views import horticulture_dashboard as horticulture_dashboard_view
from apps.housekeeping import api_views as hk_api_views


def backend_root(_request):
    return JsonResponse(
        {
            'service': 'inventory-management-backend',
            'status': 'ok',
            'api_base': '/api/',
            'admin': f"/{settings.ADMIN_URL}",
        }
    )


def api_root(_request):
    return JsonResponse(
        {
            'auth': '/api/auth/',
            'inventory': '/api/inventory/',
            'housekeeping': '/api/housekeeping/',
            'admin_gallery': '/api/admin/gallery/',
            'horticulture': '/api/horticulture/',
            'reports': '/api/reports/',
        }
    )


def legacy_admin_redirect(_request):
    return redirect(f'/{settings.ADMIN_URL}')

urlpatterns = [
    path('', backend_root),
    path('admin/', legacy_admin_redirect),
    path('api/', api_root),
    path(settings.ADMIN_URL, admin_site.urls),
    path('api/auth/', include('apps.users.urls')),
    path('api/inventory/', include('apps.inventory.urls')),
    path('api/reports/', include('apps.reports.urls')),
    path('api/horticulture/', include('apps.horticulture.urls')),
    path('api/housekeeping/', include('apps.housekeeping.urls')),
    path('api/admin/gallery/', hk_api_views.HKAdminGalleryView.as_view(), name='api-admin-gallery'),
    path('api/admin/gallery/grouped-by-area/', hk_api_views.HKAdminGalleryGroupedByAreaView.as_view(), name='api-admin-gallery-grouped'),
    path('api/admin/gallery/stats/', hk_api_views.HKAdminGalleryStatsView.as_view(), name='api-admin-gallery-stats'),
    path('api/admin/gallery/photos/<int:task_id>/', hk_api_views.HKAdminGalleryTaskPhotosView.as_view(), name='api-admin-gallery-task-photos'),
    path('api/admin/gallery/photo/<int:photo_id>/delete/', hk_api_views.HKAdminGalleryPhotoDeleteView.as_view(), name='api-admin-gallery-photo-delete'),
    path('api/admin/gallery/photo/<int:photo_id>/flag/', hk_api_views.HKAdminGalleryPhotoFlagView.as_view(), name='api-admin-gallery-photo-flag'),
    path('api/admin/gallery/export-csv/', hk_api_views.HKAdminGalleryExportCSVView.as_view(), name='api-admin-gallery-export-csv'),
    path('api/admin/gallery/task/<int:task_id>/download-zip/', hk_api_views.HKAdminGalleryTaskZipView.as_view(), name='api-admin-gallery-task-zip'),
    path('inventory/', include('apps.inventory.htmx_urls')),
    path('housekeeping/', include('apps.housekeeping.htmx_urls')),
    path('portal/', portal_root),
    path('portal/login/', portal_login, name='portal_login'),
    path('portal/logout/', portal_logout, name='portal_logout'),
    path('horticulture/dashboard/', horticulture_dashboard_view),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

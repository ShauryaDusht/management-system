from django.urls import include, path, re_path
from django.conf import settings
from django.http import JsonResponse
from django.http import HttpResponseRedirect
from django.shortcuts import redirect
from config.admin import admin_site
from apps.core.portal_views import portal_root, portal_login, portal_logout, portal_logo
from apps.core.media_views import serve_media_file
from apps.core.pwa_views import service_worker
from apps.geo_tracker.urls import public_urlpatterns as geo_public_urlpatterns
from apps.horticulture.urls import mobile_urlpatterns as horticulture_mobile_urlpatterns
from apps.substation.mobile_urls import mobile_urlpatterns as substation_mobile_urlpatterns
from apps.wtp_stp.mobile_urls import mobile_urlpatterns as wtp_mobile_urlpatterns
from apps.hvac.mobile_urls import mobile_urlpatterns as hvac_mobile_urlpatterns
from apps.housekeeping import api_views as hk_api_views


def backend_root(request):
    if 'text/html' in request.META.get('HTTP_ACCEPT', ''):
        return redirect('/portal/login/')
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
            'substation': '/api/substation/',
            'wtp': '/api/wtp/',
            'hvac': '/api/hvac/',
            'reports': '/api/reports/',
        }
    )


def legacy_admin_redirect(_request):
    return redirect(f'/{settings.ADMIN_URL}')


def admin_spa_section_redirect(section):
    def _redirect(request):
        query = request.META.get('QUERY_STRING', '')
        if settings.DEBUG:
            host = request.get_host().split(':')[0]
            target = f'http://{host}:5173/admin/{section}'
        else:
            target = f'/admin/{section}'
        if query:
            target = f'{target}?{query}'
        return HttpResponseRedirect(target)
    return _redirect


def admin_portal_redirect(request):
    if settings.DEBUG:
        host = request.get_host().split(':')[0]
        return HttpResponseRedirect(f'http://{host}:5173/admin/')
    return HttpResponseRedirect('/admin/')

urlpatterns = [
    path('', backend_root),
    path('', include('apps.core.urls')),
    path('campus-sanchalika-logo.png', portal_logo, name='portal_logo'),
    path('sw.js', service_worker, name='service-worker'),
    path('admin-portal/', admin_portal_redirect),
    path('admin-portal', admin_portal_redirect),
    path('admin/', legacy_admin_redirect),
    path('admin', legacy_admin_redirect),
    path('manage/', legacy_admin_redirect),
    path('manage', legacy_admin_redirect),
    path('login/', portal_login, name='portal_login_alias'),
    path('api/', api_root),
    path(settings.ADMIN_URL, admin_site.urls),
    path('api/auth/', include('apps.users.urls')),
    path('api/inventory/', include('apps.inventory.urls')),
    path('api/reports/', include('apps.reports.urls')),
    path('api/horticulture/', include('apps.horticulture.urls')),
    path('api/housekeeping/', include('apps.housekeeping.urls')),
    path('api/substation/', include('apps.substation.urls')),
    path('api/wtp/', include('apps.wtp_stp.urls')),
    path('api/hvac/', include('apps.hvac.urls')),
    path('geo/', include((geo_public_urlpatterns, 'geo_tracker_public'))),
    path('api/geo-tracker/', include('apps.geo_tracker.urls')),
    path('api/admin/gallery/', hk_api_views.HKAdminGalleryView.as_view(), name='api-admin-gallery'),
    path('api/admin/gallery/grouped-by-area/', hk_api_views.HKAdminGalleryGroupedByAreaView.as_view(), name='api-admin-gallery-grouped'),
    path('api/admin/gallery/stats/', hk_api_views.HKAdminGalleryStatsView.as_view(), name='api-admin-gallery-stats'),
    path('api/admin/gallery/photos/<int:task_id>/', hk_api_views.HKAdminGalleryTaskPhotosView.as_view(), name='api-admin-gallery-task-photos'),
    path('api/admin/gallery/photo/<int:photo_id>/delete/', hk_api_views.HKAdminGalleryPhotoDeleteView.as_view(), name='api-admin-gallery-photo-delete'),
    path('api/admin/gallery/photo/<int:photo_id>/flag/', hk_api_views.HKAdminGalleryPhotoFlagView.as_view(), name='api-admin-gallery-photo-flag'),
    path('api/admin/gallery/export-csv/', hk_api_views.HKAdminGalleryExportCSVView.as_view(), name='api-admin-gallery-export-csv'),
    path('api/admin/gallery/task/<int:task_id>/download-zip/', hk_api_views.HKAdminGalleryTaskZipView.as_view(), name='api-admin-gallery-task-zip'),
    path('inventory', admin_spa_section_redirect('inventory')),
    path('inventory/', admin_spa_section_redirect('inventory')),
    path('inventory/', include('apps.inventory.htmx_urls')),
    path('housekeeping', admin_spa_section_redirect('housekeeping')),
    path('housekeeping/', admin_spa_section_redirect('housekeeping')),
    path('housekeeping/', include('apps.housekeeping.htmx_urls')),
    path('dashboard', admin_spa_section_redirect('dashboard')),
    path('dashboard/', admin_spa_section_redirect('dashboard')),
    path('insights', admin_spa_section_redirect('insights')),
    path('insights/', admin_spa_section_redirect('insights')),
    path('users', admin_spa_section_redirect('users')),
    path('users/', admin_spa_section_redirect('users')),
    path('horticulture', admin_spa_section_redirect('horticulture')),
    path('horticulture/', include((horticulture_mobile_urlpatterns, 'horticulture_mobile'))),
    path('substation', admin_spa_section_redirect('substation')),
    path('substation/', include((substation_mobile_urlpatterns, 'substation_mobile'))),
    path('wtp', admin_spa_section_redirect('wtp')),
    path('wtp/', include((wtp_mobile_urlpatterns, 'wtp_mobile'))),
    path('wtp-stp', admin_spa_section_redirect('wtp-stp')),
    path('wtp-stp/', admin_spa_section_redirect('wtp-stp')),
    path('hvac', admin_spa_section_redirect('hvac')),
    path('hvac/', include((hvac_mobile_urlpatterns, 'hvac_mobile'))),
    path('portal/', portal_root),
    path('portal/login/', portal_login, name='portal_login'),
    path('portal/logout/', portal_logout, name='portal_logout'),
]

if settings.DEBUG:
    urlpatterns += [
        re_path(r'^media/(?P<path>.*)$', serve_media_file, name='media-file-fallback'),
    ]

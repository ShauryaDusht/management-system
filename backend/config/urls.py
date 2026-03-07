from django.contrib import admin
from django.urls import include, path
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse
from apps.core.portal_views import portal_root, portal_login, portal_logout
from apps.horticulture.views import horticulture_dashboard as horticulture_dashboard_view


def backend_root(_request):
    return JsonResponse(
        {
            'service': 'inventory-management-backend',
            'status': 'ok',
            'api_base': '/api/',
            'admin': '/admin/',
        }
    )


def api_root(_request):
    return JsonResponse(
        {
            'auth': '/api/auth/',
            'inventory': '/api/inventory/',
            'housekeeping': '/api/housekeeping/',
            'horticulture': '/api/horticulture/',
            'reports': '/api/reports/',
        }
    )

urlpatterns = [
    path('', backend_root),
    path('api/', api_root),
    path('admin/', admin.site.urls),
    path('api/auth/', include('apps.users.urls')),
    path('api/inventory/', include('apps.inventory.urls')),
    path('api/reports/', include('apps.reports.urls')),
    path('api/horticulture/', include('apps.horticulture.urls')),
    path('api/housekeeping/', include('apps.housekeeping.urls')),
    path('inventory/', include('apps.inventory.htmx_urls')),
    path('housekeeping/', include('apps.housekeeping.htmx_urls')),
    path('portal/', portal_root),
    path('portal/login/', portal_login, name='portal_login'),
    path('portal/logout/', portal_logout, name='portal_logout'),
    path('horticulture/dashboard/', horticulture_dashboard_view),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

from django.contrib import admin
from django.urls import include, path
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse


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
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

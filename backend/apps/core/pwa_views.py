from django.contrib.staticfiles import finders
from django.http import FileResponse, Http404
from django.views.decorators.cache import cache_control

@cache_control(no_cache=True, must_revalidate=True)
def service_worker(request):
    path = finders.find('pwa/sw.js')
    if not path:
        raise Http404("Service worker not found")
    return FileResponse(
        open(path, 'rb'),
        content_type='application/javascript',
        headers={'Service-Worker-Allowed': '/'},
    )

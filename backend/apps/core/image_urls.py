import logging
from urllib.parse import urlparse, urlunparse

from django.conf import settings


logger = logging.getLogger(__name__)

INTERNAL_HOSTS = {"backend", "web", "app", "django", "server"}
LOCAL_HOSTS = {"localhost", "127.0.0.1"}


def _first_header_value(value):
    return (value or "").split(",")[0].strip()


def public_origin(request):
    if request is None:
        return ""

    forwarded_host = _first_header_value(request.META.get("HTTP_X_FORWARDED_HOST"))
    host = forwarded_host or request.get_host()
    forwarded_proto = _first_header_value(request.META.get("HTTP_X_FORWARDED_PROTO"))
    scheme = forwarded_proto or ("https" if request.is_secure() else request.scheme)

    hostname = (urlparse(f"//{host}").hostname or "").lower()
    if hostname in INTERNAL_HOSTS or hostname in LOCAL_HOSTS:
        origin = request.META.get("HTTP_ORIGIN") or request.META.get("HTTP_REFERER") or ""
        try:
            parsed_origin = urlparse(origin)
            if parsed_origin.scheme and parsed_origin.netloc:
                return f"{parsed_origin.scheme}://{parsed_origin.netloc}"
        except Exception:
            pass

    return f"{scheme}://{host}"


def generate_image_url(request, raw_url):
    if not raw_url:
        return ""

    origin = public_origin(request)
    try:
        absolute = request.build_absolute_uri(raw_url) if request is not None else raw_url
    except Exception:
        absolute = raw_url

    try:
        parsed = urlparse(absolute)

        api_media = f"/api{settings.MEDIA_URL}"
        api_static = f"/api{settings.STATIC_URL}"
        if parsed.path.startswith(api_media):
            parsed = parsed._replace(path=parsed.path[len("/api"):])
        elif parsed.path.startswith(api_static):
            parsed = parsed._replace(path=parsed.path[len("/api"):])

        is_asset = (
            parsed.path.startswith(settings.MEDIA_URL)
            or parsed.path.startswith(settings.STATIC_URL)
        )

        if not is_asset:
            return urlunparse(parsed)

        if origin:
            public = urlparse(origin)
            parsed = parsed._replace(scheme=public.scheme, netloc=public.netloc)
            return urlunparse(parsed)

        return urlunparse(("", "", parsed.path, "", parsed.query, parsed.fragment))
    except Exception:
        return absolute


def image_field_url(request, file_field):
    if not file_field:
        return ""
    try:
        return generate_image_url(request, file_field.url)
    except Exception:
        return ""


def image_debug_payload(request, file_field):
    if not file_field:
        return {"name": "", "url": "", "exists": False, "size": 0}

    name = getattr(file_field, "name", "") or ""
    url = image_field_url(request, file_field)
    exists = False
    size = 0
    try:
        exists = bool(name and file_field.storage.exists(name))
    except Exception as exc:
        logger.warning("image_debug.storage_exists_failed name=%s error=%s", name, exc)
    try:
        size = int(file_field.size or 0) if exists else 0
    except Exception as exc:
        logger.warning("image_debug.storage_size_failed name=%s error=%s", name, exc)

    return {"name": name, "url": url, "exists": exists, "size": size}


def log_image_event(event, request=None, **fields):
    if not getattr(settings, "IMAGE_DEBUG_LOGS", True):
        return

    request_bits = {}
    if request is not None:
        request_bits = {
            "host": request.get_host(),
            "secure": request.is_secure(),
            "xfp": request.META.get("HTTP_X_FORWARDED_PROTO", ""),
            "xfh": request.META.get("HTTP_X_FORWARDED_HOST", ""),
            "origin": request.META.get("HTTP_ORIGIN", ""),
            "referer": request.META.get("HTTP_REFERER", ""),
        }
    logger.info("image_flow.%s request=%s fields=%s", event, request_bits, fields)

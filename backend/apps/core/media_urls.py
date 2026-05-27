from urllib.parse import urlparse, urlunparse


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
    if hostname in INTERNAL_HOSTS:
        origin = request.META.get("HTTP_ORIGIN") or request.META.get("HTTP_REFERER") or ""
        try:
            parsed_origin = urlparse(origin)
            if parsed_origin.scheme and parsed_origin.netloc:
                return f"{parsed_origin.scheme}://{parsed_origin.netloc}"
        except Exception:
            pass

    return f"{scheme}://{host}"


def public_media_url(request, raw_url):
    if not raw_url:
        return ""

    origin = public_origin(request)
    try:
        absolute = request.build_absolute_uri(raw_url) if request is not None else raw_url
    except Exception:
        absolute = raw_url

    try:
        parsed = urlparse(absolute)
        path_is_media = parsed.path.startswith("/media/") or parsed.path.startswith("/static/")
        hostname = (parsed.hostname or "").lower()
        missing_public_port = hostname in LOCAL_HOSTS and not parsed.port
        should_rewrite = path_is_media and (
            hostname in INTERNAL_HOSTS
            or missing_public_port
            or (origin and parsed.scheme == "http" and origin.startswith("https://"))
        )
        if should_rewrite and origin:
            public = urlparse(origin)
            parsed = parsed._replace(scheme=public.scheme, netloc=public.netloc)
        return urlunparse(parsed)
    except Exception:
        return absolute


def file_field_url(request, file_field):
    if not file_field:
        return ""
    try:
        return public_media_url(request, file_field.url)
    except Exception:
        return ""

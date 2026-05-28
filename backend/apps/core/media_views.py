import mimetypes
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404
from django.utils._os import safe_join


def serve_media_file(_request, path):
    """
    Fallback media responder for reverse proxies.

    Nginx should serve /media/ directly when its mounted media directory is in
    sync. If the host mount is missing a file but the backend container has it
    under MEDIA_ROOT, this view prevents uploaded images from becoming broken
    thumbnails in the admin gallery.
    """
    try:
        full_path = Path(safe_join(settings.MEDIA_ROOT, path))
    except ValueError as exc:
        raise Http404("Media file not found.") from exc

    if not full_path.is_file():
        raise Http404("Media file not found.")

    content_type, _encoding = mimetypes.guess_type(str(full_path))
    return FileResponse(open(full_path, "rb"), content_type=content_type or "application/octet-stream")

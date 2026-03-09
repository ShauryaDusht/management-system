from io import BytesIO

from django.core.files.base import ContentFile
from django.utils import timezone
from PIL import Image, ImageOps

MAIN_MAX_SIZE = (1280, 1280)
THUMB_MAX_SIZE = (300, 300)
MAIN_QUALITY = 80
THUMB_QUALITY = 70
RESAMPLE_LANCZOS = getattr(getattr(Image, "Resampling", Image), "LANCZOS")


def _as_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _normalize_image_mode(image):
    if image.mode == "RGB":
        return image
    if image.mode in {"RGBA", "LA"}:
        base = Image.new("RGB", image.size, (255, 255, 255))
        alpha = image.getchannel("A")
        base.paste(image.convert("RGB"), mask=alpha)
        return base
    return image.convert("RGB")


def _compression_ratio(original_size, saved_size):
    if original_size <= 0 or saved_size <= 0:
        return 0
    if saved_size >= original_size:
        return 0
    return int(round((1 - (saved_size / float(original_size))) * 100))


def process_task_photo(uploaded_file, task_id, original_size_hint=0):
    """
    Build compressed webp main photo + thumbnail from an uploaded image.
    Returns a dict containing django ContentFile objects and size metadata.
    """
    raw = uploaded_file.read()
    uploaded_file.seek(0)
    if not raw:
        raise ValueError("Uploaded photo is empty.")

    image = Image.open(BytesIO(raw))
    image = ImageOps.exif_transpose(image)
    image = _normalize_image_mode(image)

    main = image.copy()
    main.thumbnail(MAIN_MAX_SIZE, RESAMPLE_LANCZOS)
    main_buf = BytesIO()
    main.save(main_buf, format="WEBP", quality=MAIN_QUALITY, method=4)
    main_bytes = main_buf.getvalue()

    thumb = image.copy()
    thumb.thumbnail(THUMB_MAX_SIZE, RESAMPLE_LANCZOS)
    thumb_buf = BytesIO()
    thumb.save(thumb_buf, format="WEBP", quality=THUMB_QUALITY, method=3)
    thumb_bytes = thumb_buf.getvalue()

    stamp = timezone.now().strftime("%Y%m%d_%H%M%S_%f")
    task_token = str(task_id or "task")
    main_name = f"task-photo-{task_token}-{stamp}-main.webp"
    thumb_name = f"task-photo-{task_token}-{stamp}-thumb.webp"

    original_size = _as_int(original_size_hint, default=0) or len(raw)
    saved_size = len(main_bytes)
    thumb_size = len(thumb_bytes)

    return {
        "main_file": ContentFile(main_bytes, name=main_name),
        "thumb_file": ContentFile(thumb_bytes, name=thumb_name),
        "original_size": original_size,
        "saved_size": saved_size,
        "thumb_size": thumb_size,
        "compression_ratio": _compression_ratio(original_size, saved_size),
        "format": "webp",
    }

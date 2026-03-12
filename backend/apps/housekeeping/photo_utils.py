from io import BytesIO
import os

from django.core.files.base import ContentFile
from django.utils import timezone
from PIL import Image, ImageOps

MAIN_MAX_SIZE = (1280, 1280)
THUMB_MAX_SIZE = (300, 300)
MAIN_QUALITY = 85
MAIN_MIN_QUALITY = 40
MAIN_QUALITY_STEP = 5
MAIN_SKIP_THRESHOLD = 400 * 1024
MAIN_TARGET_MIN = 350 * 1024
MAIN_TARGET_MAX = 400 * 1024
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


def _guess_format(uploaded_file, image_format):
    fmt = (image_format or "").strip().lower()
    if fmt == "jpg":
        fmt = "jpeg"
    if not fmt:
        name = (getattr(uploaded_file, "name", "") or "").strip()
        ext = os.path.splitext(name)[1].lower().lstrip(".")
        if ext == "jpg":
            ext = "jpeg"
        if ext:
            fmt = ext
    if not fmt:
        content_type = (getattr(uploaded_file, "content_type", "") or "").lower()
        if content_type.startswith("image/"):
            fmt = content_type.split("/", 1)[1].strip()
    return fmt or "jpeg"


def _format_extension(fmt):
    if fmt in {"jpeg", "jpg"}:
        return "jpg"
    return fmt or "jpg"


def process_task_photo(uploaded_file, task_id, original_size_hint=0):
    """
    Build compressed main photo + thumbnail from an uploaded image.
    Skip compression if the original file is under 400KB.
    Returns a dict containing django ContentFile objects and size metadata.
    """
    raw = uploaded_file.read()
    uploaded_file.seek(0)
    if not raw:
        raise ValueError("Uploaded photo is empty.")

    image = Image.open(BytesIO(raw))
    original_format = image.format
    image = ImageOps.exif_transpose(image)
    image = _normalize_image_mode(image)

    original_size = _as_int(original_size_hint, default=0) or len(raw)
    use_original = len(raw) < MAIN_SKIP_THRESHOLD

    if use_original:
        main_bytes = raw
        main_format = _guess_format(uploaded_file, original_format)
    else:
        main = image.copy()
        main.thumbnail(MAIN_MAX_SIZE, RESAMPLE_LANCZOS)
        main_bytes = None
        main_format = "jpeg"
        quality = MAIN_QUALITY
        while quality >= MAIN_MIN_QUALITY:
            main_buf = BytesIO()
            main.save(main_buf, format="JPEG", quality=quality, optimize=True, progressive=True)
            candidate = main_buf.getvalue()
            main_bytes = candidate
            size = len(candidate)
            if MAIN_TARGET_MIN <= size <= MAIN_TARGET_MAX:
                break
            if size <= MAIN_TARGET_MAX:
                break
            quality -= MAIN_QUALITY_STEP

    thumb = image.copy()
    thumb.thumbnail(THUMB_MAX_SIZE, RESAMPLE_LANCZOS)
    thumb_buf = BytesIO()
    thumb.save(thumb_buf, format="WEBP", quality=THUMB_QUALITY, method=3)
    thumb_bytes = thumb_buf.getvalue()

    stamp = timezone.now().strftime("%Y%m%d_%H%M%S_%f")
    task_token = str(task_id or "task")
    main_ext = _format_extension(main_format)
    main_name = f"task-photo-{task_token}-{stamp}-main.{main_ext}"
    thumb_name = f"task-photo-{task_token}-{stamp}-thumb.webp"

    saved_size = len(main_bytes)
    thumb_size = len(thumb_bytes)

    if use_original:
        compression_ratio = 0
    else:
        compression_ratio = _compression_ratio(original_size, saved_size)

    return {
        "main_file": ContentFile(main_bytes, name=main_name),
        "thumb_file": ContentFile(thumb_bytes, name=thumb_name),
        "original_size": original_size,
        "saved_size": saved_size,
        "thumb_size": thumb_size,
        "compression_ratio": compression_ratio,
        "format": main_format,
    }

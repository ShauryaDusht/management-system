"""
Image compression helpers for geo_tracker photo uploads.

Goal: every PlantRecord.photo should end up at (or under) a target size
(default 300 KB) without the caller having to think about JPEG quality
levels or pixel dimensions.

`compress_image_to_max_kb()` is the single entry point used by:
  - PlantRecord.save()                          -> new uploads, any path
    (public submit form, Django admin, future API endpoints)
  - management command `compress_existing_photos` -> photos already on disk
"""

import io

from django.conf import settings
from django.core.files.base import ContentFile
from PIL import Image, ImageOps

# Can be overridden per-deployment via settings.GEO_TRACKER_PHOTO_MAX_KB.
DEFAULT_MAX_KB = getattr(settings, 'GEO_TRACKER_PHOTO_MAX_KB', 300)


def compress_image_to_max_kb(
    file_obj,
    max_kb=DEFAULT_MAX_KB,
    initial_quality=85,
    min_quality=20,
    quality_step=5,
    max_dimension=2000,
):
    """Re-encode an image so it fits under `max_kb` kilobytes.

    Strategy (cheapest first):
      1. Downscale only if the original is larger than `max_dimension` on
         its longest side (keeps the quality loop fast; rarely changes how
         the photo looks at normal viewing sizes).
      2. Step the JPEG quality down from `initial_quality` to `min_quality`
         until the encoded size is under the target.
      3. If still too big at the lowest acceptable quality (e.g. an
         enormous original), shrink the dimensions a bit and repeat — this
         only kicks in for unusually large source photos.

    `file_obj` can be any file-like object Pillow can open (an
    UploadedFile, a FieldFile's underlying file, a BytesIO, ...).

    Returns a `django.core.files.base.ContentFile` with the compressed
    bytes, or None if the file couldn't be read as an image.
    """
    try:
        file_obj.seek(0)
    except (AttributeError, ValueError):
        pass

    try:
        img = Image.open(file_obj)
        img.load()
    except Exception:
        return None

    # Apply the orientation baked into EXIF before we strip it, so photos
    # taken on phones don't end up sideways once re-encoded.
    img = ImageOps.exif_transpose(img)

    # JPEG has no alpha channel, so flatten any transparency onto white.
    if img.mode in ('RGBA', 'LA', 'P'):
        flattened = Image.new('RGB', img.size, (255, 255, 255))
        rgba = img.convert('RGBA')
        flattened.paste(rgba, mask=rgba.split()[-1])
        img = flattened
    elif img.mode != 'RGB':
        img = img.convert('RGB')

    if max(img.size) > max_dimension:
        ratio = max_dimension / max(img.size)
        img = img.resize(
            (max(1, int(img.width * ratio)), max(1, int(img.height * ratio))),
            Image.LANCZOS,
        )

    max_bytes = max_kb * 1024

    def encode(image, quality):
        buf = io.BytesIO()
        image.save(buf, format='JPEG', quality=quality, optimize=True)
        return buf

    quality = initial_quality
    buf = encode(img, quality)
    while buf.tell() > max_bytes and quality > min_quality:
        quality -= quality_step
        buf = encode(img, quality)

    # Last resort for very large originals: shrink dimensions a bit and
    # re-try at the lowest acceptable quality. Capped so a pathological
    # image can't loop forever.
    shrink_attempts = 0
    while buf.tell() > max_bytes and shrink_attempts < 6:
        img = img.resize(
            (max(1, int(img.width * 0.85)), max(1, int(img.height * 0.85))),
            Image.LANCZOS,
        )
        buf = encode(img, max(quality, min_quality))
        shrink_attempts += 1

    buf.seek(0)
    return ContentFile(buf.read())
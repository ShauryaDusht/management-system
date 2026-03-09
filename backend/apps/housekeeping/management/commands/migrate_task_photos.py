from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db.models import Q

from apps.housekeeping.models import HKDailyRecord
from apps.housekeeping.photo_utils import process_task_photo


class Command(BaseCommand):
    help = "Compress existing HK task photos into webp + thumbnail metadata."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Only report what would be migrated, do not write changes.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=0,
            help="Optional max number of records to process.",
        )
        parser.add_argument(
            "--all",
            action="store_true",
            help="Process all records with photos (default only missing compression metadata).",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        limit = max(0, int(options.get("limit") or 0))
        include_all = bool(options.get("all"))

        qs = HKDailyRecord.objects.filter(photo_after__isnull=False).exclude(photo_after="")
        if not include_all:
            qs = qs.filter(
                Q(photo_after_format="")
                | Q(photo_after_saved_size=0)
                | Q(photo_after_thumbnail__isnull=True)
                | Q(photo_after_thumbnail="")
            )
        qs = qs.order_by("id")
        if limit:
            qs = qs[:limit]

        total = qs.count()
        self.stdout.write(self.style.NOTICE(f"Found {total} photo records to process."))
        if total == 0:
            return

        ok = 0
        failed = 0
        for rec in qs:
            try:
                rec.photo_after.open("rb")
                raw = rec.photo_after.read()
            finally:
                try:
                    rec.photo_after.close()
                except Exception:
                    pass

            if not raw:
                failed += 1
                self.stdout.write(self.style.WARNING(f"Record {rec.id}: empty image, skipped."))
                continue

            old_name = rec.photo_after.name
            old_storage = rec.photo_after.storage
            old_thumb_name = rec.photo_after_thumbnail.name if rec.photo_after_thumbnail else ""
            old_thumb_storage = rec.photo_after_thumbnail.storage if rec.photo_after_thumbnail else old_storage

            uploaded = ContentFile(raw, name=old_name.split("/")[-1] or f"task-photo-{rec.id}.jpg")
            try:
                processed = process_task_photo(
                    uploaded,
                    task_id=rec.id,
                    original_size_hint=rec.photo_after_original_size or len(raw),
                )
            except Exception as ex:
                failed += 1
                self.stdout.write(self.style.WARNING(f"Record {rec.id}: process failed ({ex})."))
                continue

            if dry_run:
                ok += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f"[dry-run] Record {rec.id}: {processed['original_size']} -> {processed['saved_size']} bytes "
                        f"({processed['compression_ratio']}% saved)"
                    )
                )
                continue

            rec.photo_after = processed["main_file"]
            rec.photo_after_thumbnail = processed["thumb_file"]
            rec.photo_after_original_size = processed["original_size"]
            rec.photo_after_saved_size = processed["saved_size"]
            rec.photo_after_thumb_size = processed["thumb_size"]
            rec.photo_after_compression_ratio = processed["compression_ratio"]
            rec.photo_after_format = processed["format"]
            rec.save(
                update_fields=[
                    "photo_after",
                    "photo_after_thumbnail",
                    "photo_after_original_size",
                    "photo_after_saved_size",
                    "photo_after_thumb_size",
                    "photo_after_compression_ratio",
                    "photo_after_format",
                ]
            )

            # delete prior files after successful save to avoid orphan buildup
            try:
                if old_name and old_name != rec.photo_after.name:
                    old_storage.delete(old_name)
            except Exception:
                pass
            try:
                if old_thumb_name and old_thumb_name != (rec.photo_after_thumbnail.name if rec.photo_after_thumbnail else ""):
                    old_thumb_storage.delete(old_thumb_name)
            except Exception:
                pass

            ok += 1
            if ok % 10 == 0:
                self.stdout.write(self.style.NOTICE(f"Progress: {ok}/{total}"))

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. Successful: {ok}, Failed: {failed}, Dry-run: {dry_run}"
            )
        )

"""
Deletes task photos (and thumbnails) from HKDailyRecord and extra-work
photos from HKExtraWork that are older than --days days (default 50).

Only the image files are removed from disk; the database rows are kept
so that historical attendance / task records remain intact.

Run manually:
    python manage.py cleanup_old_photos
    python manage.py cleanup_old_photos --days 50
    python manage.py cleanup_old_photos --dry-run

Runs automatically via cron (see backend/scripts/cron_cleanup.sh).
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.housekeeping.models import HKDailyRecord, HKExtraWork


def _delete_file(storage, name, dry_run, stdout, label):
    """Delete a single file from storage, log the result."""
    if not name:
        return
    try:
        if storage.exists(name):
            if not dry_run:
                storage.delete(name)
            stdout.write(f"  {'[dry-run] ' if dry_run else ''}deleted {label}: {name}")
    except Exception as exc:
        stdout.write(f"  WARNING: could not delete {label} {name}: {exc}")


class Command(BaseCommand):
    help = "Delete photos older than N days from HKDailyRecord and HKExtraWork."

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=50,
            help="Delete photos from records older than this many days (default: 50).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview what would be deleted without touching any files.",
        )

    def handle(self, *args, **options):
        days = max(1, options["days"])
        dry_run = options["dry_run"]
        cutoff = timezone.now() - timedelta(days=days)

        if dry_run:
            self.stdout.write(self.style.WARNING(f"[DRY-RUN] cutoff: {cutoff.date()} ({days} days ago)"))
        else:
            self.stdout.write(self.style.NOTICE(f"Cutoff: {cutoff.date()} ({days} days ago)"))

        # ── HKDailyRecord photos ────────────────────────────────────────────
        daily_qs = HKDailyRecord.objects.filter(date__lt=cutoff.date()).exclude(
            photo_after="",
            photo_before="",
            photo_after_thumbnail="",
        )

        daily_cleaned = 0
        for record in daily_qs.iterator():
            cleaned = False

            for field_name in ("photo_before", "photo_after", "photo_after_thumbnail"):
                field = getattr(record, field_name)
                if field and field.name:
                    _delete_file(field.storage, field.name, dry_run, self.stdout, field_name)
                    if not dry_run:
                        setattr(record, field_name, "")
                    cleaned = True

            if cleaned and not dry_run:
                record.save(update_fields=["photo_before", "photo_after", "photo_after_thumbnail"])
                daily_cleaned += 1
            elif cleaned:
                daily_cleaned += 1

        # ── HKExtraWork photos ───────────────────────────────────────────────
        extra_qs = HKExtraWork.objects.filter(date__lt=cutoff.date()).exclude(photo="")

        extra_cleaned = 0
        for record in extra_qs.iterator():
            if record.photo and record.photo.name:
                _delete_file(record.photo.storage, record.photo.name, dry_run, self.stdout, "extra photo")
                if not dry_run:
                    record.photo = ""
                    record.save(update_fields=["photo"])
                extra_cleaned += 1

        # ── Summary ─────────────────────────────────────────────────────────
        prefix = "[dry-run] " if dry_run else ""
        self.stdout.write(
            self.style.SUCCESS(
                f"{prefix}Done. "
                f"DailyRecord rows cleaned: {daily_cleaned}, "
                f"ExtraWork rows cleaned: {extra_cleaned}."
            )
        )
"""
Compress PlantRecord photos that are already sitting in storage.

This is for the backlog of photos uploaded *before* automatic compression
was added to PlantRecord.save(). It rewrites each oversized photo's bytes
in place, at the exact same storage path/filename — nothing is deleted,
no record's photo reference changes, only the file content gets smaller.

Usage:
    python manage.py compress_existing_photos
    python manage.py compress_existing_photos --max-kb 300
    python manage.py compress_existing_photos --dry-run
"""

from django.core.management.base import BaseCommand

from apps.geo_tracker.models import PlantRecord
from apps.geo_tracker.utils import compress_image_to_max_kb


class Command(BaseCommand):
    help = (
        'Compress existing PlantRecord photos down to a target size '
        '(default 300 KB) in place. Photos already under the target are '
        'left untouched; nothing is ever deleted.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--max-kb', type=int, default=300,
            help='Target maximum file size in KB (default: 300)',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help="Report what would change without writing anything",
        )

    def handle(self, *args, **options):
        max_kb = options['max_kb']
        dry_run = options['dry_run']
        max_bytes = max_kb * 1024

        qs = PlantRecord.objects.exclude(photo='').exclude(photo__isnull=True)
        total = qs.count()
        compressed_count = 0
        skipped_count = 0
        saved_bytes_total = 0

        self.stdout.write(f'Found {total} record(s) with a photo. Target: {max_kb} KB each.')
        if dry_run:
            self.stdout.write(self.style.WARNING('Dry run — no files will be modified.'))

        for record in qs.iterator():
            label = record.tracking_id or f'pk={record.pk}'

            if not record.photo or not record.photo.storage.exists(record.photo.name):
                self.stdout.write(self.style.WARNING(f'{label}: photo file missing on disk, skipping'))
                skipped_count += 1
                continue

            try:
                original_size = record.photo.size
            except Exception as exc:
                self.stdout.write(self.style.WARNING(f'{label}: could not read file ({exc}), skipping'))
                skipped_count += 1
                continue

            if original_size <= max_bytes:
                skipped_count += 1
                continue

            record.photo.open('rb')
            try:
                compressed = compress_image_to_max_kb(record.photo.file, max_kb=max_kb)
            finally:
                record.photo.close()

            if compressed is None:
                self.stdout.write(self.style.WARNING(f'{label}: could not decode as an image, skipping'))
                skipped_count += 1
                continue

            new_size = compressed.size
            saved_bytes_total += max(0, original_size - new_size)

            if dry_run:
                self.stdout.write(
                    f'{label}: {original_size / 1024:.0f} KB -> {new_size / 1024:.0f} KB (dry run)'
                )
            else:
                storage = record.photo.storage
                name = record.photo.name
                with storage.open(name, 'wb') as dest:
                    dest.write(compressed.read())
                self.stdout.write(f'{label}: {original_size / 1024:.0f} KB -> {new_size / 1024:.0f} KB')

            compressed_count += 1

        self.stdout.write(self.style.SUCCESS(
            f'Done. Compressed {compressed_count}, skipped {skipped_count} of {total} total. '
            f'Saved ~{saved_bytes_total / 1024 / 1024:.2f} MB.'
        ))

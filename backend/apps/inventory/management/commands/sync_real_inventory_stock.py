from datetime import datetime, time

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.inventory.models import Item, StockEntry
from apps.inventory.stock_baseline import (
    BASELINE_RECEIVED_DATE,
    BASELINE_SYNC_MARKER,
    TRACKED_STOCK_ITEMS,
    stock_entry_note,
)


class Command(BaseCommand):
    help = (
        "Apply the real housekeeping consumable stock baseline and "
        "the received register dated 2026-02-12."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview updates without changing the database.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Reapply the baseline even if it has already been synced once.",
        )
        parser.add_argument(
            "--quiet",
            action="store_true",
            help="Suppress per-item output.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        force = options["force"]
        quiet = options["quiet"]

        already_applied = StockEntry.objects.filter(notes__startswith=BASELINE_SYNC_MARKER).exists()
        if already_applied and not force:
            if not quiet:
                self.stdout.write("Inventory baseline already applied. Skipping.")
            return

        admin_user = self._resolve_added_by_user()
        items_by_name = {item.name: item for item in Item.objects.all()}
        missing = [row["db_name"] for row in TRACKED_STOCK_ITEMS if row["db_name"] not in items_by_name]
        if missing:
            raise CommandError(
                "Cannot sync inventory baseline. Missing items: " + ", ".join(sorted(missing))
            )

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"Dry run: would sync {len(TRACKED_STOCK_ITEMS)} tracked items."
                )
            )
            return

        with transaction.atomic():
            self._sync_stock_entries(items_by_name, admin_user, quiet=quiet)
            self._sync_current_quantities(items_by_name, quiet=quiet)

        if not quiet:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Inventory baseline synced for {len(TRACKED_STOCK_ITEMS)} items."
                )
            )

    def _resolve_added_by_user(self):
        User = get_user_model()
        return (
            User.objects.filter(username="admin").first()
            or User.objects.filter(role="admin").order_by("id").first()
            or User.objects.order_by("id").first()
        )

    def _sync_stock_entries(self, items_by_name, admin_user, quiet=False):
        if admin_user is None:
            raise CommandError("Cannot create stock entries because no user exists.")

        receipt_dt = timezone.make_aware(
            datetime.combine(BASELINE_RECEIVED_DATE, time(hour=9, minute=0))
        )

        if StockEntry.objects.filter(notes__startswith=BASELINE_SYNC_MARKER).exists():
            for entry in StockEntry.objects.filter(notes__startswith=BASELINE_SYNC_MARKER):
                entry.delete()

        for row in TRACKED_STOCK_ITEMS:
            qty = int(row["received_quantity"] or 0)
            if qty <= 0:
                continue

            item = items_by_name[row["db_name"]]
            entry = StockEntry.objects.create(
                item=item,
                quantity_added=qty,
                added_by=admin_user,
                notes=stock_entry_note(row["label"]),
            )
            StockEntry.objects.filter(pk=entry.pk).update(added_at=receipt_dt)

            if not quiet:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Receipt synced: {row['label']} -> +{qty} on {BASELINE_RECEIVED_DATE.isoformat()}"
                    )
                )

    def _sync_current_quantities(self, items_by_name, quiet=False):
        for row in TRACKED_STOCK_ITEMS:
            item = items_by_name[row["db_name"]]
            current_quantity = int(row["current_quantity"] or 0)
            reserved_quantity = int(item.reserved_quantity or 0)
            target_total = current_quantity + reserved_quantity

            item.unit = row["unit"]
            item.available_quantity = current_quantity
            item.total_quantity = target_total
            item.save(update_fields=["unit", "available_quantity", "total_quantity", "updated_at"])

            if not quiet:
                self.stdout.write(
                    f"Stock set: {row['label']} -> current={current_quantity} {row['unit']}"
                )

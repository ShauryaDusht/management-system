from django.core.management.base import BaseCommand

from apps.inventory.master_data import MASTER_INVENTORY_ROWS, normalize_item_name
from apps.inventory.models import Item


class Command(BaseCommand):
    help = 'Sync item codes, names, units, quantities, and unit prices from the master inventory sheet.'

    def handle(self, *args, **options):
        items_by_pk = {item.pk: item for item in Item.objects.all()}
        items_by_code = {str(item.item_code or '').strip(): item for item in Item.objects.all() if item.item_code}
        items_by_name = {normalize_item_name(item.name): item for item in Item.objects.all()}

        updated = 0
        missing = []

        for row in MASTER_INVENTORY_ROWS:
            item = (
                items_by_code.get(row['item_code']) or
                items_by_pk.get(row['pk']) or
                items_by_name.get(normalize_item_name(row['name']))
            )
            if not item:
                missing.append({'pk': row['pk'], 'item_code': row['item_code'], 'name': row['name']})
                continue

            quantity = int(row['quantity'])
            existing_gap = max(int(item.total_quantity or 0) - int(item.available_quantity or 0), 0)
            next_available = max(quantity - existing_gap, 0)
            next_reserved = min(int(item.reserved_quantity or 0), next_available)

            Item.objects.filter(pk=item.pk).update(
                item_code=row['item_code'],
                name=row['name'],
                unit=row['unit'],
                total_quantity=quantity,
                available_quantity=next_available,
                reserved_quantity=next_reserved,
                unit_cost=row['unit_price'],
            )
            updated += 1

        self.stdout.write(self.style.SUCCESS(f'Updated inventory items: {updated}'))
        if missing:
            self.stdout.write(self.style.WARNING(f'Missing inventory items: {len(missing)}'))
            for row in missing:
                self.stdout.write(f"- {row['item_code']} {row['name']}")

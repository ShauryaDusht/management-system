from decimal import Decimal
from django.db import migrations


def sync_existing_horticulture_items(apps, schema_editor):
    HorticultureArea = apps.get_model('horticulture', 'HorticultureArea')
    HorticultureAreaStock = apps.get_model('horticulture', 'HorticultureAreaStock')
    Item = apps.get_model('inventory', 'Item')
    Category = apps.get_model('inventory', 'Category')

    horti_categories = Category.objects.filter(name__icontains='Horticulture')
    horti_items = list(
        Item.objects.filter(category__in=horti_categories)
    )

    if not horti_items:
        # Fallback to hardcoded names if category not named yet
        horti_items = list(Item.objects.filter(name__in=[
            'Oil', 'Petrol', 'Nilon Thread', 'Herbicides', 'Pesticides', 'Neem Oil'
        ]))

    areas = list(HorticultureArea.objects.all())
    if not areas or not horti_items:
        return

    to_create = []
    to_update = []

    for area in areas:
        existing = {
            s.item_id: s for s in HorticultureAreaStock.objects.filter(area=area) if s.item_id
        }
        existing_names = {
            s.item_name.lower(): s for s in HorticultureAreaStock.objects.filter(area=area)
        }

        for item in horti_items:
            stock = existing.get(item.id) or existing_names.get(item.name.lower())
            threshold = (
                Decimal(str(item.threshold_quantity))
                if item.threshold_quantity is not None
                else Decimal('5')
            )
            unit = getattr(item, 'unit', '') or ''

            if stock:
                changed = False
                if stock.item_id != item.id:
                    stock.item = item
                    changed = True
                if not stock.unit and unit:
                    stock.unit = unit
                    changed = True
                if changed:
                    to_update.append(stock)
            else:
                to_create.append(
                    HorticultureAreaStock(
                        area=area,
                        item=item,
                        item_name=item.name,
                        quantity=Decimal('0'),
                        unit=unit,
                        low_stock_threshold=threshold,
                    )
                )

    if to_create:
        HorticultureAreaStock.objects.bulk_create(to_create, ignore_conflicts=True)
    if to_update:
        HorticultureAreaStock.objects.bulk_update(to_update, ['item', 'unit'])


class Migration(migrations.Migration):

    dependencies = [
        ('horticulture', '0012_drop_horticulture_area_size'),
        ('inventory', '0001_initial_squashed_0015_fix_item_encoding'),
    ]

    operations = [
        migrations.RunPython(sync_existing_horticulture_items, migrations.RunPython.noop),
    ]

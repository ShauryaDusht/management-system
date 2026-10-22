import logging
from decimal import Decimal

from django.db import models
from django.db.models.signals import post_delete, post_save, pre_delete
from django.dispatch import receiver

logger = logging.getLogger(__name__)

HORTICULTURE_CATEGORY_NAMES = {
    'garden & horticulture equipment',
    'horticulture equipment',
    'garden equipment',
}


def is_horticulture_category(category):
    if not category:
        return False
    name = (getattr(category, 'name', '') or '').strip().lower()
    return 'horticulture' in name or name in HORTICULTURE_CATEGORY_NAMES


def sync_inventory_item_to_area_stocks(item):
    """
    Ensure all HorticultureArea objects have a HorticultureAreaStock record for this item
    if it belongs to the Garden & Horticulture Equipment category.
    If its category is changed away from horticulture, remove the stock records.
    """
    from apps.horticulture.models import HorticultureArea, HorticultureAreaStock

    if not is_horticulture_category(item.category):
        # Category is not horticulture; remove any linked stock records
        HorticultureAreaStock.objects.filter(
            models.Q(item=item) | models.Q(item_name__iexact=item.name)
        ).delete()
        return

    areas = HorticultureArea.objects.all()
    if not areas.exists():
        return

    unit = item.get_unit_display() or item.unit or ''
    threshold = (
        Decimal(str(item.threshold_quantity))
        if item.threshold_quantity is not None
        else Decimal('5')
    )

    existing_stocks = HorticultureAreaStock.objects.filter(
        models.Q(item=item) | models.Q(item_name__iexact=item.name)
    )
    existing_by_area = {stock.area_id: stock for stock in existing_stocks}

    to_create = []
    to_update = []

    for area in areas:
        stock = existing_by_area.get(area.id)
        if stock:
            changed = False
            if stock.item_id != item.id:
                stock.item = item
                changed = True
            if stock.item_name != item.name:
                stock.item_name = item.name
                changed = True
            if stock.unit != unit:
                stock.unit = unit
                changed = True
            if stock.low_stock_threshold != threshold:
                stock.low_stock_threshold = threshold
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
        HorticultureAreaStock.objects.bulk_update(
            to_update,
            ['item', 'item_name', 'unit', 'low_stock_threshold']
        )


def sync_area_to_all_horticulture_items(area):
    """
    Ensure a single HorticultureArea has stock records for all horticulture inventory items.
    """
    from apps.horticulture.models import HorticultureAreaStock
    from apps.inventory.models import Item

    items = Item.objects.select_related('category').all()
    horti_items = [item for item in items if is_horticulture_category(item.category)]

    existing_stocks = HorticultureAreaStock.objects.filter(area=area)
    existing_by_item_id = {stock.item_id: stock for stock in existing_stocks if stock.item_id}
    existing_by_name = {stock.item_name.lower(): stock for stock in existing_stocks}

    to_create = []
    to_update = []

    for item in horti_items:
        stock = existing_by_item_id.get(item.id) or existing_by_name.get(item.name.lower())
        unit = item.get_unit_display() or item.unit or ''
        threshold = (
            Decimal(str(item.threshold_quantity))
            if item.threshold_quantity is not None
            else Decimal('5')
        )

        if stock:
            changed = False
            if stock.item_id != item.id:
                stock.item = item
                changed = True
            if stock.item_name != item.name:
                stock.item_name = item.name
                changed = True
            if stock.unit != unit:
                stock.unit = unit
                changed = True
            if stock.low_stock_threshold != threshold:
                stock.low_stock_threshold = threshold
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
        HorticultureAreaStock.objects.bulk_update(
            to_update,
            ['item', 'item_name', 'unit', 'low_stock_threshold']
        )


@receiver(post_save, sender='inventory.Item')
def on_inventory_item_post_save(sender, instance, created, **kwargs):
    try:
        sync_inventory_item_to_area_stocks(instance)
    except Exception as exc:
        logger.exception("Error syncing inventory item to horticulture area stock: %s", exc)


@receiver(pre_delete, sender='inventory.Item')
def on_inventory_item_pre_delete(sender, instance, **kwargs):
    try:
        from apps.horticulture.models import HorticultureAreaStock
        HorticultureAreaStock.objects.filter(
            models.Q(item=instance) | models.Q(item_name__iexact=instance.name)
        ).delete()
    except Exception as exc:
        logger.exception("Error deleting horticulture area stock for item: %s", exc)


@receiver(post_delete, sender='inventory.Item')
def on_inventory_item_post_delete(sender, instance, **kwargs):
    try:
        from apps.horticulture.models import HorticultureAreaStock
        HorticultureAreaStock.objects.filter(
            models.Q(item=instance) | models.Q(item_name__iexact=instance.name)
        ).delete()
    except Exception as exc:
        logger.exception("Error during post_delete cleanup of horticulture area stock for item: %s", exc)


@receiver(post_save, sender='horticulture.HorticultureArea')
def on_horticulture_area_post_save(sender, instance, created, **kwargs):
    if created:
        try:
            sync_area_to_all_horticulture_items(instance)
        except Exception as exc:
            logger.exception("Error syncing new horticulture area stocks: %s", exc)

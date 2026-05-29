from .models import Item


UNAUTHORIZED_ITEM_REQUEST_MESSAGE = "You do not have permission to request this item."
EXCESSIVE_QUANTITY_MESSAGE = "Requested quantity exceeds available stock."


def can_request_assets(user):
    if not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "can_manage_inventory", False):
        return True

    try:
        from apps.horticulture.services import get_supervisor_zones
    except ImportError:
        return False

    return get_supervisor_zones(user).exists()


def filter_requestable_items(queryset, user):
    if can_request_assets(user):
        return queryset
    return queryset.filter(item_type=Item.ItemType.CONSUMABLE)


def user_can_request_item(user, item):
    return item.item_type != Item.ItemType.ASSET or can_request_assets(user)

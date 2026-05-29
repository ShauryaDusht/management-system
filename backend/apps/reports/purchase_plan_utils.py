from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from apps.inventory.models import Item


_TWOPLACES = Decimal("0.01")


MONTHLY_PURCHASE_DEFAULTS = {
    (2026, 1): {
        "Cleaning Acid": 0,
        "Aluminium Stick": 10,
        "Air Freshener (R5)": 140,
        "Floor Cleaner (R2)": 150,
        "Hand Wash Liquid": 140,
        "Surface Cleaner (R1)": 180,
        "Bamboo Stick (5 ft long)": 10,
        "Baygon Spray": 70,
        "Broom (Hard)": 400,
        "Broom (Soft)": 100,
        "Plastic Bucket (10 Ltr)": 0,
        "Carpet Shampoo 101": 0,
        "Carpet Brush": 0,
        "Ceramic Cleaner (R6)": 300,
        "Check Duster (250mm x 250mm)": 160,
        "Dry Mop Refill (24 inch)": 5,
        "Dry Mop Set (24 inch)": 10,
        "Dustpan (Plastic 200x200mm)": 20,
        "Feather Brush (250mm)": 0,
        "Floor Detergent (Powder)": 10,
        "Floor Duster (Cotton)": 80,
        "Glass Cleaner": 40,
        "Glass Duster (18x18 White)": 120,
        "Glass Squeeze/Wiper (2-in-1)": 0,
        "Rubber Gloves": 70,
        "Gun Spray": 0,
        "Kitchen Wiper (250mm)": 15,
        "Liquid Repellent (All Out Refill)": 0,
        "Odonil": 500,
        "Paper Napkin": 0,
        "Phenyl": 180,
        "Road Brush with Stick": 0,
        "Room Freshener": 75,
        "Scotch-Brite Pad (152x96mm)": 300,
        "Soap": 10,
        "Iron Scrapper (Patra)": 30,
        "Steel Polish": 0,
        "Wooden Polish": 0,
        "Tissue Paper (Soft)": 0,
        "Toilet Cleaning Brush": 20,
        "Toilet Paper Roll": 1250,
        "Wet Mop Refill Clip (6 inch)": 30,
        "Wet Mop Refill": 180,
        "Wiper (Big with Steel Rod)": 15,
        "Wiper (Small)": 10,
        "Naphthalene Balls": 10,
        "Plunger (Chowking Pump)": 0,
        "Bleaching Liquid": 150,
        "Scrubbing Pad": 0,
        "Garden Pipe 30mtr Roll": 0,
    },
    (2026, 2): {
        "Aluminium Stick": 10,
        "Air Freshener (R5)": 140,
        "Floor Cleaner (R2)": 150,
        "Hand Wash Liquid": 140,
        "Surface Cleaner (R1)": 180,
        "Bamboo Stick (5 ft long)": 10,
        "Baygon Spray": 70,
        "Broom (Hard)": 400,
        "Broom (Soft)": 150,
        "Carpet Brush": 10,
        "Ceramic Cleaner (R6)": 300,
        "Check Duster (250mm x 250mm)": 160,
        "Dry Mop Refill (24 inch)": 15,
        "Dry Mop Set (24 inch)": 15,
        "Dustpan (Plastic 200x200mm)": 10,
        "Floor Detergent (Powder)": 10,
        "Floor Duster (Cotton)": 80,
        "Glass Cleaner": 50,
        "Glass Duster (18x18 White)": 120,
        "Rubber Gloves": 70,
        "Gun Spray": 10,
        "Kitchen Wiper (250mm)": 15,
        "Liquid Repellent (All Out Refill)": 12,
        "Odonil": 300,
        "Phenyl": 180,
        "Room Freshener": 75,
        "Scotch-Brite Pad (152x96mm)": 300,
        "Soap": 20,
        "Iron Scrapper (Patra)": 40,
        "Steel Polish": 30,
        "Toilet Cleaning Brush": 20,
        "Toilet Paper Roll": 600,
        "Wet Mop Refill Clip (6 inch)": 15,
        "Wet Mop Refill": 180,
        "Wiper (Big with Steel Rod)": 15,
        "Wiper (Small)": 10,
        "Naphthalene Balls": 15,
        "Plunger (Chowking Pump)": 12,
        "Bleaching Liquid": 150,
    },
    (2026, 3): {
        "Aluminium Stick": 15,
        "Air Freshener (R5)": 70,
        "Floor Cleaner (R2)": 60,
        "Hand Wash Liquid": 50,
        "Surface Cleaner (R1)": 60,
        "Bamboo Stick (5 ft long)": 20,
        "Baygon Spray": 70,
        "Broom (Hard)": 400,
        "Broom (Soft)": 150,
        "Ceramic Cleaner (R6)": 150,
        "Check Duster (250mm x 250mm)": 160,
        "Dry Mop Refill (24 inch)": 20,
        "Dry Mop Set (24 inch)": 20,
        "Dustpan (Plastic 200x200mm)": 15,
        "Floor Detergent (Powder)": 10,
        "Floor Duster (Cotton)": 80,
        "Glass Cleaner": 60,
        "Glass Duster (18x18 White)": 120,
        "Rubber Gloves": 70,
        "Gun Spray": 10,
        "Kitchen Wiper (250mm)": 15,
        "Liquid Repellent (All Out Refill)": 15,
        "Odonil": 400,
        "Phenyl": 200,
        "Room Freshener": 75,
        "Scotch-Brite Pad (152x96mm)": 300,
        "Soap": 20,
        "Iron Scrapper (Patra)": 40,
        "Toilet Cleaning Brush": 20,
        "Toilet Paper Roll": 1400,
        "Wet Mop Refill Clip (6 inch)": 15,
        "Wet Mop Refill": 180,
        "Wiper (Big with Steel Rod)": 15,
        "Wiper (Small)": 10,
        "Naphthalene Balls": 15,
        "Plunger (Chowking Pump)": 12,
        "Bleaching Liquid": 150,
        "Scrubbing Pad": 2,
        "Garden Pipe 30mtr Roll": 2,
    },
}


def _as_decimal(value, default=0):
    if value in (None, ""):
        value = default
    try:
        return Decimal(str(value)).quantize(_TWOPLACES, rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(str(default or 0)).quantize(_TWOPLACES, rounding=ROUND_HALF_UP)


def _default_quantity_map(month: int, year: int):
    return MONTHLY_PURCHASE_DEFAULTS.get((year, month), {})


def list_default_purchase_plan_periods():
    return [(month, year) for year, month in sorted(MONTHLY_PURCHASE_DEFAULTS)]


def build_default_purchase_plan_data(month: int, year: int):
    default_quantities = _default_quantity_map(month, year)
    data = {}
    for item in Item.objects.select_related("category").all().order_by("category__name", "name"):
        data[str(item.id)] = {
            "purchase_quantity": int(default_quantities.get(item.name, 0) or 0),
            "planned_unit_cost": float(_as_decimal(item.unit_cost, 0)),
            "applied_quantity": 0,
        }
    return data


def merge_purchase_plan_data(existing_data, month: int, year: int):
    existing_data = existing_data or {}
    default_quantities = _default_quantity_map(month, year)
    merged = {}
    for item in Item.objects.select_related("category").all().order_by("category__name", "name"):
        existing = existing_data.get(str(item.id), {}) or {}
        merged[str(item.id)] = {
            "purchase_quantity": int(existing.get("purchase_quantity", default_quantities.get(item.name, 0)) or 0),
            "planned_unit_cost": float(_as_decimal(existing.get("planned_unit_cost"), item.unit_cost or 0)),
            "applied_quantity": max(0, int(existing.get("applied_quantity", 0) or 0)),
        }
    return merged


def serialize_purchase_plan(plan):
    merged_data = merge_purchase_plan_data(plan.data, plan.month, plan.year)
    rows = []
    total_estimated_cost = Decimal("0.00")
    total_purchase_quantity = 0
    purchase_items_count = 0

    for item in Item.objects.select_related("category").all().order_by("category__name", "name"):
        entry = merged_data.get(str(item.id), {})
        purchase_quantity = int(entry.get("purchase_quantity", 0) or 0)
        applied_quantity = max(0, int(entry.get("applied_quantity", 0) or 0))
        planned_unit_cost = _as_decimal(entry.get("planned_unit_cost"), item.unit_cost or 0)
        estimated_cost = (planned_unit_cost * purchase_quantity).quantize(_TWOPLACES, rounding=ROUND_HALF_UP)

        if purchase_quantity > 0:
            purchase_items_count += 1
            total_purchase_quantity += purchase_quantity
            total_estimated_cost += estimated_cost

        rows.append(
            {
                "item_id": item.id,
                "item_code": item.item_code,
                "item_name": item.name,
                "category": item.category.name if item.category else "",
                "item_type": item.item_type,
                "unit": item.unit,
                "available_quantity": int(item.available_quantity or 0),
                "current_unit_cost": float(_as_decimal(item.unit_cost, 0)),
                "planned_unit_cost": float(planned_unit_cost),
                "purchase_quantity": purchase_quantity,
                "received_quantity": applied_quantity,
                "pending_quantity": max(purchase_quantity - applied_quantity, 0),
                "estimated_cost": float(estimated_cost),
                "status": item.status,
            }
        )

    return {
        "id": plan.id,
        "month": plan.month,
        "year": plan.year,
        "period_label": plan.period_label,
        "updated_at": plan.updated_at,
        "updated_by_name": (
            plan.updated_by.get_full_name() or plan.updated_by.username
            if plan.updated_by else None
        ),
        "summary": {
            "items_count": len(rows),
            "purchase_items_count": purchase_items_count,
            "total_purchase_quantity": total_purchase_quantity,
            "total_estimated_cost": float(total_estimated_cost.quantize(_TWOPLACES, rounding=ROUND_HALF_UP)),
        },
        "rows": rows,
    }


def serialize_purchase_plan_summary(plan):
    merged_data = merge_purchase_plan_data(plan.data, plan.month, plan.year)
    total_estimated_cost = Decimal("0.00")
    total_purchase_quantity = 0
    purchase_items_count = 0

    for item in Item.objects.all().only("id", "unit_cost"):
        entry = merged_data.get(str(item.id), {})
        purchase_quantity = int(entry.get("purchase_quantity", 0) or 0)
        if purchase_quantity <= 0:
            continue

        planned_unit_cost = _as_decimal(entry.get("planned_unit_cost"), item.unit_cost or 0)
        estimated_cost = (planned_unit_cost * purchase_quantity).quantize(_TWOPLACES, rounding=ROUND_HALF_UP)
        purchase_items_count += 1
        total_purchase_quantity += purchase_quantity
        total_estimated_cost += estimated_cost

    return {
        "id": plan.id,
        "month": plan.month,
        "year": plan.year,
        "period_label": plan.period_label,
        "updated_at": plan.updated_at,
        "updated_by_name": (
            plan.updated_by.get_full_name() or plan.updated_by.username
            if plan.updated_by else None
        ),
        "summary": {
            "purchase_items_count": purchase_items_count,
            "total_purchase_quantity": total_purchase_quantity,
            "total_estimated_cost": float(total_estimated_cost.quantize(_TWOPLACES, rounding=ROUND_HALF_UP)),
        },
    }


def normalize_purchase_plan_rows(rows, month: int, year: int):
    rows = rows or []
    payload_by_item_id = {}
    for row in rows:
        try:
            item_id = int(row.get("item_id"))
        except (TypeError, ValueError):
            continue
        payload_by_item_id[item_id] = row

    normalized = {}
    default_quantities = _default_quantity_map(month, year)
    for item in Item.objects.all().order_by("category__name", "name"):
        payload = payload_by_item_id.get(item.id, {})
        purchase_quantity = payload.get("purchase_quantity", default_quantities.get(item.name, 0))
        try:
            purchase_quantity = max(0, int(purchase_quantity or 0))
        except (TypeError, ValueError):
            purchase_quantity = 0

        normalized[str(item.id)] = {
            "purchase_quantity": purchase_quantity,
            "planned_unit_cost": float(_as_decimal(payload.get("planned_unit_cost"), item.unit_cost or 0)),
            "applied_quantity": max(0, int(payload.get("applied_quantity", 0) or 0)),
        }

    return normalized

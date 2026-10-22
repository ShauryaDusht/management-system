import json
import math
from datetime import datetime, date, timedelta
from pathlib import Path
from django.utils import timezone
from .models import HvacLog, HvacSupervisorLog

OPERATOR_NAMES = [
    'Ramesh Varma', 'Kailash Solanki', 'Mohan Prajapati',
    'Sanjay Patel', 'Dinesh Chavda', 'Amit Sharma',
]

_CACHED_TEMPLATES = None


def get_slot_templates():
    global _CACHED_TEMPLATES
    if _CACHED_TEMPLATES is not None:
        return _CACHED_TEMPLATES

    fixture_dir = Path(__file__).resolve().parent / 'fixtures' / 'seed'
    templates = []
    if fixture_dir.exists():
        for jf in sorted(fixture_dir.glob('s*.json')):
            try:
                with open(jf, 'r', encoding='utf-8') as f:
                    templates.append(json.load(f))
            except Exception as e:
                print(f"[HVAC Demo] Could not load {jf}: {e}")

    templates.sort(key=lambda x: x.get('slot', 0))
    _CACHED_TEMPLATES = templates
    return templates


def r2(val):
    if val is None:
        return None
    return round(float(val), 2)


def ensure_hvac_demo_data(target_date=None):
    """
    Ensures that target_date (defaults to today) has complete, realistic
    24-hour HVAC demo readings and shift supervisor handovers.
    """
    if target_date is None:
        target_date = timezone.localdate()
    elif isinstance(target_date, str):
        try:
            target_date = datetime.strptime(target_date[:10], '%Y-%m-%d').date()
        except Exception:
            target_date = timezone.localdate()

    d_str = target_date.strftime('%Y-%m-%d')

    # If already has 24 logs, return immediately
    existing_count = HvacLog.objects.filter(date=target_date).count()
    if existing_count >= 24:
        return existing_count

    templates = get_slot_templates()
    if not templates:
        return 0

    # Calculate day offset from fixed epoch (2026-10-01) for consistent cumulative meters
    epoch = date(2026, 10, 1)
    day_offset = (target_date - epoch).days
    if day_offset < 0:
        day_offset = abs(day_offset) % 30

    base_mwh1 = 8420.15 + day_offset * 92.5
    base_mwh2 = 8512.40 + day_offset * 118.2
    base_wm1 = 18450.0 + day_offset * 210.0
    base_wm2 = 11240.0 + day_offset * 95.0

    seeded = 0
    for b in templates:
        slot = b.get('slot', 0)
        time_str = b.get('time', f"{(slot + 7) % 24:02d}:30")
        shift_str = str(b.get('shift') or ((slot // 8) + 1))
        op_name = OPERATOR_NAMES[(slot // 4 + day_offset) % len(OPERATOR_NAMES)]

        v = dict(b.get('v', {}))

        # Dynamic variation
        for k, val in list(v.items()):
            if isinstance(val, (int, float)) and not k.endswith('_mwh') and not k.endswith('_kl'):
                factor = 1.0 + 0.02 * math.sin(slot * 1.7 + day_offset * 3 + len(k))
                v[k] = r2(val * factor)

        # Progressive cumulative meters
        v['pn1_mwh'] = r2(base_mwh1 + slot * 3.85)
        v['pn2_mwh'] = r2(base_mwh2 + slot * 4.92)
        v['wm1_kl'] = r2(base_wm1 + slot * 8.75)
        v['wm2_kl'] = r2(base_wm2 + slot * 3.42)

        # Chiller 5 or 6 active based on template or daytime
        if v.get('c5_evapIn') is not None and v.get('c5_evapOut') is not None:
            v['c5_st'] = 'on'
        elif v.get('c6_evapIn') is not None and v.get('c6_evapOut') is not None:
            v['c6_st'] = 'on'

        # Chiller 6 on during peak afternoon load (slots 8 to 20, 15:30 to 03:30)
        if 8 <= slot <= 20:
            v['c6_st'] = 'on'
            v['c6_evapIn'] = r2(11.2 + 0.5 * math.sin(slot))
            v['c6_evapOut'] = r2(7.8 + 0.3 * math.cos(slot))
            v['c6_rla'] = r2(52.0 + (slot % 5))

        # Clean log ID
        clean_time = time_str.replace(':', '')
        log_id = f"{d_str}_{clean_time}"

        HvacLog.objects.update_or_create(
            id=log_id,
            defaults={
                'date': target_date,
                'time': time_str,
                'slot': slot,
                'shift': shift_str,
                'operator': op_name,
                'setpoint': 7.0 if slot % 2 == 0 else 7.5,
                'values': v,
                'ts': int(datetime.combine(target_date, datetime.min.time()).timestamp() * 1000) + slot * 3600000,
            }
        )
        seeded += 1

    # Ensure supervisor handovers for all 3 shifts
    for s in ['1', '2', '3']:
        HvacSupervisorLog.objects.update_or_create(
            date=target_date,
            shift=s,
            defaults={
                'status': 'Normal' if (day_offset + int(s)) % 4 != 0 else 'Attention Needed',
                'chillers_checked': True,
                'pumps_checked': True,
                'towers_checked': True,
                'panels_checked': True,
                'water_checked': True,
                'notes': f"Shift {s} on {d_str}: Chiller 5 & 6 operating normally. Delta T within optimal range. Water makeup normal.",
                'supervisor_name': 'R. K. Verma (HVAC Engineer)',
            }
        )

    return seeded


def seed_hvac_demo_range(days_back=7, days_ahead=2):
    """Seed demo data across a date window surrounding today."""
    today = timezone.localdate()
    total = 0
    for offset in range(-days_back, days_ahead + 1):
        target = today + timedelta(days=offset)
        total += ensure_hvac_demo_data(target)
    return total

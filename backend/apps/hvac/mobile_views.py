from datetime import datetime, date
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.views.decorators.cache import never_cache
from django.contrib import messages
from django.utils import timezone

from apps.users.models import User, unique_standard_username

from .models import HvacLog, HvacSupervisorLog, CHILLERS, derive_values, check_alerts, PUMP_RATED_LIMITS
from .views import TIME_SLOTS


def get_current_slot(now_time=None):
    if now_time is None:
        now_time = timezone.localtime().time()
    h = now_time.hour
    m = now_time.minute
    # Calculate index in 24 slots: slot 0 is 07:30, slot 1 is 08:30 ...
    idx = ((h - (1 if m < 30 else 0)) - 7 + 24) % 24
    return idx


def mobile_hvac_root(request):
    return redirect('/hvac/dashboard/')


@login_required(login_url='/portal/login/')
@never_cache
def mobile_dashboard(request):
    today = timezone.localdate()
    today_str = str(today)
    date_str = request.GET.get('date', today_str)
    shift_filter = request.GET.get('shift', '')
    try:
        query_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        query_date = today
        date_str = today_str

    is_today = (date_str == today_str)
    formatted_date = query_date.strftime('%a, %d %b %Y')

    active_slot = get_current_slot()
    active_shift = (active_slot // 8) + 1

    logs = list(HvacLog.objects.filter(date=query_date).order_by('slot'))
    slots_map = {l.slot: l for l in logs}

    user_role = getattr(request.user, 'role', '')
    is_operator = user_role in ['hvac_operator', 'operator']
    is_supervisor = user_role in ['hvac_engineer', 'hvac_supervisor', 'supervisor', 'admin'] or request.user.is_superuser

    latest = logs[-1] if logs else HvacLog.objects.order_by('-date', '-slot').first()
    latest_vals = latest.values if latest else {}

    # Status of chillers
    chillers_status = []
    for n, name, tr in CHILLERS:
        prefix = f'c{n}_'
        is_on = latest_vals.get(f'{prefix}st') == 'on' or (
            latest_vals.get(f'{prefix}st') is None and latest_vals.get(f'{prefix}evapOut') is not None
        )
        ein = latest_vals.get(f'{prefix}evapIn')
        eout = latest_vals.get(f'{prefix}evapOut')
        dt = None
        if ein is not None and eout is not None:
            try:
                dt = round(float(ein) - float(eout), 2)
            except (ValueError, TypeError):
                dt = None

        is_dt_high = bool(is_on and dt is not None and dt > 4.0)

        chillers_status.append({
            'num': n,
            'name': name,
            'tr': tr,
            'running': is_on,
            'evapIn': ein,
            'evapOut': eout,
            'dt': dt,
            'is_dt_high': is_dt_high,
            'rla': latest_vals.get(f'{prefix}rla'),
        })

    # Energy calculations
    p1_open = logs[0].values.get('pn1_mwh') if logs and logs[0].values.get('pn1_mwh') is not None else None
    p1_close = logs[-1].values.get('pn1_mwh') if logs and logs[-1].values.get('pn1_mwh') is not None else None
    p1_cons = max(0, round(float(p1_close) - float(p1_open), 2)) if (p1_open is not None and p1_close is not None) else None

    p2_open = logs[0].values.get('pn2_mwh') if logs and logs[0].values.get('pn2_mwh') is not None else None
    p2_close = logs[-1].values.get('pn2_mwh') if logs and logs[-1].values.get('pn2_mwh') is not None else None
    p2_cons = max(0, round(float(p2_close) - float(p2_open), 2)) if (p2_open is not None and p2_close is not None) else None

    total_energy = round((p1_cons or 0) + (p2_cons or 0), 2) if (p1_cons is not None or p2_cons is not None) else None

    # Water calculations (Old, New, Chilled)
    wm1_open = logs[0].values.get('wm1_kl') if logs and logs[0].values.get('wm1_kl') is not None else None
    wm1_close = logs[-1].values.get('wm1_kl') if logs and logs[-1].values.get('wm1_kl') is not None else None
    wm1_cons = max(0, round(float(wm1_close) - float(wm1_open), 2)) if (wm1_open is not None and wm1_close is not None) else None

    wm2_open = logs[0].values.get('wm2_kl') if logs and logs[0].values.get('wm2_kl') is not None else None
    wm2_close = logs[-1].values.get('wm2_kl') if logs and logs[-1].values.get('wm2_kl') is not None else None
    wm2_cons = max(0, round(float(wm2_close) - float(wm2_open), 2)) if (wm2_open is not None and wm2_close is not None) else None

    wm3_open = (logs[0].values.get('wm3_kl') if logs[0].values.get('wm3_kl') is not None else logs[0].values.get('wm_chilled_kl')) if logs else None
    wm3_close = (logs[-1].values.get('wm3_kl') if logs[-1].values.get('wm3_kl') is not None else logs[-1].values.get('wm_chilled_kl')) if logs else None
    wm3_cons = max(0, round(float(wm3_close) - float(wm3_open), 2)) if (wm3_open is not None and wm3_close is not None) else None

    total_water = round((wm1_cons or 0) + (wm2_cons or 0) + (wm3_cons or 0), 2) if (wm1_cons is not None or wm2_cons is not None or wm3_cons is not None) else None

    # Pump rated limits daily analysis (Supervisor & Engineer Portals)
    pumps_daily = []
    pumps_reached_count = 0
    slot_pump_alerts = {s: [] for s in range(24)}

    if is_supervisor:
        for p_key, limit in PUMP_RATED_LIMITS.items():
            peak_a = None
            peak_v = None
            reached_events = []

            for l in logs:
                vals = l.values or {}
                a_val = vals.get(f'{p_key}_a')
                v_val = vals.get(f'{p_key}_v')

                if a_val is not None and a_val != '':
                    try:
                        num_a = float(a_val)
                        if peak_a is None or num_a > peak_a:
                            peak_a = num_a
                        if num_a >= limit['max_a']:
                            diff = round(num_a - limit['max_a'], 2)
                            reached_events.append({
                                'slot': l.slot,
                                'time': l.time,
                                'val': num_a,
                                'limit': limit['max_a'],
                                'diff': diff,
                                'type': 'Current',
                            })
                            slot_pump_alerts[l.slot].append({
                                'pump_name': limit['name'],
                                'pump_key': p_key,
                                'msg': f"Current ({num_a} A) reached rated max ({limit['max_a']} A)",
                            })
                    except (ValueError, TypeError):
                        pass

                if v_val is not None and v_val != '':
                    try:
                        num_v = float(v_val)
                        if peak_v is None or num_v > peak_v:
                            peak_v = num_v
                        if num_v >= limit['max_v']:
                            diff = round(num_v - limit['max_v'], 2)
                            reached_events.append({
                                'slot': l.slot,
                                'time': l.time,
                                'val': num_v,
                                'limit': limit['max_v'],
                                'diff': diff,
                                'type': 'Voltage',
                            })
                            slot_pump_alerts[l.slot].append({
                                'pump_name': limit['name'],
                                'pump_key': p_key,
                                'msg': f"Voltage ({num_v} V) reached rated max ({limit['max_v']} V)",
                            })
                    except (ValueError, TypeError):
                        pass

            has_reached = len(reached_events) > 0
            if has_reached:
                pumps_reached_count += 1

            group_code = 'PRI' if p_key.startswith('pri') else ('SEC' if p_key.startswith('sec') else 'CON')
            group_name = 'Primary' if p_key.startswith('pri') else ('Secondary' if p_key.startswith('sec') else 'Condenser')
            pct = round((peak_a / limit['max_a']) * 100) if (peak_a is not None and limit['max_a'] > 0) else 0

            pumps_daily.append({
                'key': p_key,
                'name': limit['name'],
                'short_name': limit['name'].split(' (')[0],
                'group': group_name,
                'group_code': group_code,
                'max_a': limit['max_a'],
                'max_v': limit['max_v'],
                'range_a': limit.get('range_a', ''),
                'range_v': limit.get('range_v', ''),
                'peak_a': peak_a,
                'peak_v': peak_v,
                'pct': pct,
                'has_reached': has_reached,
                'status': 'ALERT' if has_reached else ('NORMAL' if peak_a and peak_a > 0 else 'STANDBY'),
                'reached_events': reached_events,
            })

    # Hourly slot entries list
    slot_cards = []
    for idx, time_label in enumerate(TIME_SLOTS):
        log_entry = slots_map.get(idx)
        shift = (idx // 8) + 1
        if shift_filter and str(shift) != str(shift_filter):
            continue

        running_names = []
        if log_entry:
            for num, name, _ in CHILLERS:
                c_st = log_entry.values.get(f'c{num}_st')
                c_out = log_entry.values.get(f'c{num}_evapOut')
                if c_st == 'on' or (c_st is None and c_out is not None):
                    running_names.append(name)

        slot_cards.append({
            'slot': idx,
            'time': time_label,
            'shift': shift,
            'has_entry': log_entry is not None,
            'operator': log_entry.operator if log_entry else None,
            'setpoint': log_entry.setpoint if log_entry else None,
            'running_chillers': running_names,
            'alerts_count': len(check_alerts(log_entry.values, include_pumps=is_supervisor)) if log_entry else 0,
            'pump_alerts': slot_pump_alerts.get(idx, []) if is_supervisor else [],
            'is_current': idx == active_slot,
        })

    # Active alerts (Supervisor and Engineer portals see pump overload alerts; operators see only chiller alerts)
    alerts = []
    for l in logs:
        for a in check_alerts(l.values, include_pumps=is_supervisor):
            alerts.append({'time': l.time, 'msg': a})

    active_slot_logged = active_slot in slots_map

    return render(request, 'hvac/mobile/dashboard.html', {
        'today': today_str,
        'today_date': today_str,
        'query_date': date_str,
        'current_date': date_str,
        'is_today': is_today,
        'formatted_date': formatted_date,
        'shift_filter': shift_filter,
        'active_slot': active_slot,
        'active_slot_logged': active_slot_logged,
        'active_shift': active_shift,
        'active_time': TIME_SLOTS[active_slot] if 0 <= active_slot < len(TIME_SLOTS) else '08:30',
        'logs_count': len(logs),
        'total_slots': 24,
        'slot_cards': slot_cards,
        'chillers_status': chillers_status,
        'pumps_daily': pumps_daily,
        'pumps_reached_count': pumps_reached_count,
        'slot_pump_alerts': slot_pump_alerts,
        'total_energy': total_energy,
        'p1_cons': p1_cons,
        'p2_cons': p2_cons,
        'total_water': total_water,
        'wm1_cons': wm1_cons,
        'wm2_cons': wm2_cons,
        'wm3_cons': wm3_cons,
        'alerts': alerts,
        'user': request.user,
        'is_operator': is_operator,
        'is_supervisor': is_supervisor,
        'active_nav': 'dashboard',
    })


@login_required(login_url='/portal/login/')
@never_cache
def mobile_entry(request):
    today = timezone.localdate()
    today_str = str(today)
    date_str = request.GET.get('date', today_str)
    try:
        parsed_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        parsed_date = today
        date_str = today_str

    is_today = (date_str == today_str)
    formatted_date = parsed_date.strftime('%a, %d %b %Y')
    slot_idx = int(request.GET.get('slot', get_current_slot()))

    time_str = TIME_SLOTS[slot_idx] if 0 <= slot_idx < len(TIME_SLOTS) else '08:30'
    shift_str = str((slot_idx // 8) + 1)
    log_id = f"{date_str}_{time_str.replace(':', '')}"

    existing = HvacLog.objects.filter(id=log_id).first()

    user_role = getattr(request.user, 'role', '')
    is_supervisor = user_role in ['hvac_engineer', 'hvac_supervisor', 'supervisor', 'admin'] or request.user.is_superuser
    is_operator = not is_supervisor
    is_locked = (existing is not None) and (not is_supervisor)

    if request.method == 'POST':
        if is_locked:
            messages.error(request, "Permission Denied: Operators have access to enter new readings only and cannot edit already logged slots.")
            return redirect(f"/hvac/dashboard/?date={date_str}")

        operator = request.POST.get('operator', '').strip() or request.user.get_full_name() or request.user.username
        setpoint = request.POST.get('setpoint')
        v = {}

        for k, val in request.POST.items():
            if k in ['csrfmiddlewaretoken', 'operator', 'setpoint', 'date', 'slot']:
                continue
            val = val.strip()
            if val != '':
                try:
                    v[k] = round(float(val), 2)
                except ValueError:
                    v[k] = val

        # Bidirectional sync between v1, v2, v3 and vab, vbc, vca for legacy compatibility
        for n, _, _ in CHILLERS:
            p = f'c{n}_'
            if f'{p}v1' in v and f'{p}vab' not in v:
                v[f'{p}vab'] = v[f'{p}v1']
            if f'{p}v2' in v and f'{p}vbc' not in v:
                v[f'{p}vbc'] = v[f'{p}v2']
            if f'{p}v3' in v and f'{p}vca' not in v:
                v[f'{p}vca'] = v[f'{p}v3']
            if f'{p}vab' in v and f'{p}v1' not in v:
                v[f'{p}v1'] = v[f'{p}vab']
            if f'{p}vbc' in v and f'{p}v2' not in v:
                v[f'{p}v2'] = v[f'{p}vbc']
            if f'{p}vca' in v and f'{p}v3' not in v:
                v[f'{p}v3'] = v[f'{p}vca']

        # Water meter alias compatibility for chilled meter
        if 'wm3_kl' in v and 'wm_chilled_kl' not in v:
            v['wm_chilled_kl'] = v['wm3_kl']
        elif 'wm_chilled_kl' in v and 'wm3_kl' not in v:
            v['wm3_kl'] = v['wm_chilled_kl']

        HvacLog.objects.update_or_create(
            id=log_id,
            defaults={
                'date': date_str,
                'time': time_str,
                'slot': slot_idx,
                'shift': shift_str,
                'operator': operator,
                'setpoint': float(setpoint) if setpoint else None,
                'values': v,
                'ts': int(timezone.now().timestamp() * 1000),
            }
        )
        messages.success(request, f"Saved readings for {time_str} ({date_str}) successfully!")
        return redirect(f"/hvac/dashboard/?date={date_str}")

    # Build 24-Hour slots navigation strip
    day_logs = {l.slot: l for l in HvacLog.objects.filter(date=date_str)}
    slot_nav = []
    for idx, t_str in enumerate(TIME_SLOTS):
        s_num = (idx // 8) + 1
        slot_nav.append({
            'idx': idx,
            'label': t_str,
            'shift': s_num,
            'is_active': idx == slot_idx,
            'is_logged': idx in day_logs,
        })

    vals = existing.values if existing else {}

    # Chillers 1 to 7 structured data with pre-filled inputs
    chillers_data = []
    for n, name, tr in CHILLERS:
        p = f'c{n}_'
        chillers_data.append({
            'num': n,
            'name': name,
            'tr': tr,
            'st': vals.get(f'{p}st', ''),
            'rla': vals.get(f'{p}rla', ''),
            'evapIn': vals.get(f'{p}evapIn', ''),
            'evapOut': vals.get(f'{p}evapOut', ''),
            'evapP': vals.get(f'{p}evapP', ''),
            'condIn': vals.get(f'{p}condIn', ''),
            'condOut': vals.get(f'{p}condOut', ''),
            'condP': vals.get(f'{p}condP', ''),
            'drift': vals.get(f'{p}drift', ''),
            'oilP': vals.get(f'{p}oilP', ''),
            'oilL': vals.get(f'{p}oilL', ''),
            'l1': vals.get(f'{p}l1', ''),
            'l2': vals.get(f'{p}l2', ''),
            'l3': vals.get(f'{p}l3', ''),
            'vab': vals.get(f'{p}vab', ''),
            'vbc': vals.get(f'{p}vbc', ''),
            'vca': vals.get(f'{p}vca', ''),
            'v1': vals.get(f'{p}v1') if vals.get(f'{p}v1') is not None else vals.get(f'{p}vab', ''),
            'v2': vals.get(f'{p}v2') if vals.get(f'{p}v2') is not None else vals.get(f'{p}vbc', ''),
            'v3': vals.get(f'{p}v3') if vals.get(f'{p}v3') is not None else vals.get(f'{p}vca', ''),
        })

    # Pumps groups configuration
    pumps_config = [
        ('pri', 'Primary Chilled Water Pumps', ['1', '2', '3', '4', '5', '6', 'NA 1', 'NA 2', 'NA 3', 'NA 4']),
        ('sec', 'Secondary Chilled Water Pumps', ['1', '2', '3', '4', '5', '6', '7', 'NA 1', 'NA 2', 'NA 3', 'NA 4']),
        ('con', 'Condenser Water Pumps', ['1', '2', '3', '4', '5', '6', 'NA 1', 'NA 2', 'NA 3', 'NA 4']),
    ]
    pumps_data = []
    for g_prefix, g_name, pump_list in pumps_config:
        items = []
        for p_label in pump_list:
            key_id = g_prefix + p_label.replace(' ', '')
            items.append({
                'label': f"{p_label}",
                'key': key_id,
                'v': vals.get(f'{key_id}_v', ''),
                'a': vals.get(f'{key_id}_a', ''),
            })
        pumps_data.append({
            'prefix': g_prefix,
            'name': g_name,
            'items': items,
        })

    # Cooling Towers
    towers_config = [
        ('ct1', 'Cooling Tower 1', 2),
        ('ct2', 'Cooling Tower 2', 2),
        ('ct3', 'Cooling Tower 3', 2),
        ('ct4', 'Cooling Tower 4', 2),
        ('ct5', 'Cooling Tower 5', 4),
        ('ctn1', 'Cooling Tower NA 1', 2),
        ('ctn2', 'Cooling Tower NA 2', 2),
    ]
    towers_data = []
    for t_key, t_name, fan_count in towers_config:
        fans = []
        for fi in range(1, fan_count + 1):
            fans.append({
                'num': fi,
                'key': f"{t_key}_f{fi}",
                'val': vals.get(f"{t_key}_f{fi}", ''),
            })
        towers_data.append({
            'key': t_key,
            'name': t_name,
            'fans': fans,
        })

    # Panels: Panel 1, Panel 2
    panels_data = [
        {
            'num': 1,
            'name': 'HVAC Panel 1',
            'mwh': vals.get('pn1_mwh', ''),
            'amp': vals.get('pn1_amp', ''),
            'pf': vals.get('pn1_pf', ''),
        },
        {
            'num': 2,
            'name': 'HVAC Panel 2',
            'mwh': vals.get('pn2_mwh', ''),
            'amp': vals.get('pn2_amp', ''),
            'pf': vals.get('pn2_pf', ''),
        },
    ]

    # Water Meters: Old, New, Chilled
    water_data = [
        {'num': 1, 'name': 'Old', 'key': 'wm1_kl', 'val': vals.get('wm1_kl', '')},
        {'num': 2, 'name': 'New', 'key': 'wm2_kl', 'val': vals.get('wm2_kl', '')},
        {'num': 3, 'name': 'Chilled', 'key': 'wm3_kl', 'val': vals.get('wm3_kl', vals.get('wm_chilled_kl', ''))},
    ]

    return render(request, 'hvac/mobile/entry.html', {
        'date': date_str,
        'current_date': date_str,
        'today_date': today_str,
        'is_today': is_today,
        'formatted_date': formatted_date,
        'slot': slot_idx,
        'time': time_str,
        'shift': shift_str,
        'existing': existing,
        'values': vals,
        'slot_nav': slot_nav,
        'chillers_data': chillers_data,
        'pumps_data': pumps_data,
        'towers_data': towers_data,
        'panels_data': panels_data,
        'water_data': water_data,
        'user': request.user,
        'is_locked': is_locked,
        'is_supervisor': is_supervisor,
        'is_operator': is_operator,
        'active_nav': 'entry',
    })


@login_required(login_url='/portal/login/')
@never_cache
def mobile_flash(request):
    today = timezone.localdate()
    today_str = str(today)
    date_str = request.GET.get('date', today_str)
    try:
        parsed_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        parsed_date = today
        date_str = today_str

    is_today = (date_str == today_str)
    formatted_date = parsed_date.strftime('%a, %d %b %Y')

    logs = list(HvacLog.objects.filter(date=date_str).order_by('slot'))

    user_role = getattr(request.user, 'role', '')
    is_operator = user_role in ['hvac_operator', 'operator']
    is_supervisor = user_role in ['hvac_engineer', 'hvac_supervisor', 'supervisor', 'admin'] or request.user.is_superuser

    # Decorate logs with running chillers and portal alerts
    for l in logs:
        if isinstance(l.values, dict) and 'wm3_kl' not in l.values and 'wm_chilled_kl' in l.values:
            l.values['wm3_kl'] = l.values['wm_chilled_kl']
        l.portal_alerts = check_alerts(l.values, include_pumps=is_supervisor)
        rc = []
        for num, name, _ in CHILLERS:
            c_st = l.values.get(f'c{num}_st')
            c_out = l.values.get(f'c{num}_evapOut')
            if c_st == 'on' or (c_st is None and c_out is not None):
                rc.append(name)
        l.running_names = ", ".join(rc) if rc else "None"

    # Pump analysis for supervisor in flash report
    pumps_daily = []
    pumps_reached_count = 0
    if is_supervisor:
        for p_key, limit in PUMP_RATED_LIMITS.items():
            peak_a = None
            has_reached = False
            for l in logs:
                vals = l.values or {}
                a_val = vals.get(f'{p_key}_a')
                if a_val is not None and a_val != '':
                    try:
                        num_a = float(a_val)
                        if peak_a is None or num_a > peak_a:
                            peak_a = num_a
                        if num_a >= limit['max_a']:
                            has_reached = True
                    except (ValueError, TypeError):
                        pass
            if has_reached:
                pumps_reached_count += 1
                pumps_daily.append({
                    'key': p_key,
                    'name': limit['name'],
                    'peak_a': peak_a,
                    'max_a': limit['max_a'],
                    'has_reached': True,
                })

    p1_open = logs[0].values.get('pn1_mwh') if logs and logs[0].values.get('pn1_mwh') is not None else None
    p1_close = logs[-1].values.get('pn1_mwh') if logs and logs[-1].values.get('pn1_mwh') is not None else None
    p1_cons = max(0, round(float(p1_close) - float(p1_open), 2)) if (p1_open is not None and p1_close is not None) else None

    p2_open = logs[0].values.get('pn2_mwh') if logs and logs[0].values.get('pn2_mwh') is not None else None
    p2_close = logs[-1].values.get('pn2_mwh') if logs and logs[-1].values.get('pn2_mwh') is not None else None
    p2_cons = max(0, round(float(p2_close) - float(p2_open), 2)) if (p2_open is not None and p2_close is not None) else None

    total_energy = round((p1_cons or 0) + (p2_cons or 0), 2) if (p1_cons is not None or p2_cons is not None) else None

    wm1_open = logs[0].values.get('wm1_kl') if logs and logs[0].values.get('wm1_kl') is not None else None
    wm1_close = logs[-1].values.get('wm1_kl') if logs and logs[-1].values.get('wm1_kl') is not None else None
    wm1_cons = max(0, round(float(wm1_close) - float(wm1_open), 2)) if (wm1_open is not None and wm1_close is not None) else None

    wm2_open = logs[0].values.get('wm2_kl') if logs and logs[0].values.get('wm2_kl') is not None else None
    wm2_close = logs[-1].values.get('wm2_kl') if logs and logs[-1].values.get('wm2_kl') is not None else None
    wm2_cons = max(0, round(float(wm2_close) - float(wm2_open), 2)) if (wm2_open is not None and wm2_close is not None) else None

    wm3_open = (logs[0].values.get('wm3_kl') if logs[0].values.get('wm3_kl') is not None else logs[0].values.get('wm_chilled_kl')) if logs else None
    wm3_close = (logs[-1].values.get('wm3_kl') if logs[-1].values.get('wm3_kl') is not None else logs[-1].values.get('wm_chilled_kl')) if logs else None
    wm3_cons = max(0, round(float(wm3_close) - float(wm3_open), 2)) if (wm3_open is not None and wm3_close is not None) else None

    total_water = round((wm1_cons or 0) + (wm2_cons or 0) + (wm3_cons or 0), 2) if (wm1_cons is not None or wm2_cons is not None or wm3_cons is not None) else None

    return render(request, 'hvac/mobile/flash.html', {
        'date': date_str,
        'current_date': date_str,
        'today_date': today_str,
        'is_today': is_today,
        'formatted_date': formatted_date,
        'logs': logs,
        'total_slots': len(logs),
        'total_energy': total_energy,
        'p1_cons': p1_cons,
        'p2_cons': p2_cons,
        'total_water': total_water,
        'wm1_cons': wm1_cons,
        'wm2_cons': wm2_cons,
        'wm3_cons': wm3_cons,
        'slots': TIME_SLOTS,
        'pumps_daily': pumps_daily,
        'pumps_reached_count': pumps_reached_count,
        'is_supervisor': is_supervisor,
        'is_operator': is_operator,
        'user': request.user,
        'active_nav': 'flash',
    })


@login_required(login_url='/portal/login/')
@never_cache
def mobile_history(request):
    dates = HvacLog.objects.values('date').distinct().order_by('-date')
    history_items = []
    for d in dates:
        d_val = d['date']
        cnt = HvacLog.objects.filter(date=d_val).count()
        pct = min(100, int(round((cnt / 24) * 100)))
        history_items.append({
            'date': d_val,
            'count': cnt,
            'pct': pct,
            'is_complete': cnt >= 24,
        })

    return render(request, 'hvac/mobile/history.html', {
        'history_items': history_items,
        'user': request.user,
        'active_nav': 'history',
    })


@login_required(login_url='/portal/login/')
def mobile_handover(request):
    today = timezone.localdate()
    today_str = str(today)
    date_str = request.GET.get('date', today_str)
    active_slot = get_current_slot()
    current_shift = str((active_slot // 8) + 1)
    shift_str = request.GET.get('shift', current_shift)

    try:
        query_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        query_date = today
        date_str = today_str

    is_today = (date_str == today_str)
    formatted_date = query_date.strftime('%a, %d %b %Y')

    user_role = getattr(request.user, 'role', '')
    is_supervisor = user_role in ['hvac_engineer', 'hvac_supervisor', 'supervisor', 'admin'] or request.user.is_superuser

    existing = HvacSupervisorLog.objects.filter(date=query_date, shift=shift_str).first()

    if request.method == 'POST':
        status_val = request.POST.get('status', 'Normal')
        chillers_checked = bool(request.POST.get('chillers_checked'))
        pumps_checked = bool(request.POST.get('pumps_checked'))
        towers_checked = bool(request.POST.get('towers_checked'))
        panels_checked = bool(request.POST.get('panels_checked'))
        water_checked = bool(request.POST.get('water_checked'))
        notes = request.POST.get('notes', '').strip()
        supervisor_name = request.POST.get('supervisor_name', '').strip() or request.user.get_full_name() or request.user.username

        HvacSupervisorLog.objects.update_or_create(
            date=query_date,
            shift=shift_str,
            defaults={
                'status': status_val,
                'chillers_checked': chillers_checked,
                'pumps_checked': pumps_checked,
                'towers_checked': towers_checked,
                'panels_checked': panels_checked,
                'water_checked': water_checked,
                'notes': notes,
                'supervisor_name': supervisor_name,
            }
        )
        messages.success(request, f"Shift {shift_str} Handover & Verification saved successfully!")
        return redirect(f"/hvac/handover/?date={date_str}&shift={shift_str}")

    recent_handovers = HvacSupervisorLog.objects.filter(date=query_date).order_by('shift')

    return render(request, 'hvac/mobile/handover.html', {
        'date': date_str,
        'current_date': date_str,
        'today_date': today_str,
        'is_today': is_today,
        'formatted_date': formatted_date,
        'shift': shift_str,
        'existing': existing,
        'recent_handovers': recent_handovers,
        'is_supervisor': is_supervisor,
        'user': request.user,
        'active_nav': 'dashboard',
    })


@login_required(login_url='/portal/login/')
@never_cache
def mobile_operators_view(request):
    """
    Mobile operator management for HVAC supervisors and engineers.
    Allows adding, toggling status, and removing hvac_operator accounts.
    """
    user_role = getattr(request.user, 'role', '')
    is_allowed = (user_role in ['hvac_engineer', 'hvac_supervisor', 'admin'] or request.user.is_superuser)
    if not is_allowed:
        messages.error(request, 'Only HVAC Supervisors and Engineers can manage field operators.')
        return redirect('/hvac/dashboard/')

    if request.method == 'POST':
        action = request.POST.get('action')
        if action == 'add':
            first_name = request.POST.get('first_name', '').strip()
            last_name = request.POST.get('last_name', '').strip()
            phone = request.POST.get('phone', '').strip().replace(' ', '').replace('-', '')
            password = request.POST.get('password', '').strip() or 'IITGN@2025'

            if not first_name or not last_name:
                messages.error(request, 'First name and Last name are required.')
            elif not phone or len(phone) < 10:
                messages.error(request, 'Valid 10-digit mobile number is required.')
            else:
                username = unique_standard_username(first_name, last_name, model=User)
                if not username:
                    username = f"{first_name.lower().replace(' ', '')}.{last_name.lower().replace(' ', '')}"

                if User.objects.filter(username=username).exists():
                    messages.error(request, f'Username {username} already exists.')
                else:
                    new_user = User.objects.create(
                        username=username,
                        first_name=first_name,
                        last_name=last_name,
                        phone=phone[-10:],
                        role=User.Role.HVAC_OPERATOR,
                        is_active=True,
                    )
                    new_user.set_password(password)
                    new_user.save()
                    messages.success(request, f'Operator {new_user.get_full_name()} added successfully! (Login ID: {new_user.phone})')
            return redirect('/hvac/operators/')

        elif action == 'toggle_status':
            op_id = request.POST.get('operator_id')
            op = get_object_or_404(User, id=op_id, role=User.Role.HVAC_OPERATOR)
            op.is_active = not op.is_active
            op.save(update_fields=['is_active'])
            messages.success(request, f'Operator {op.get_full_name()} is now {"Active" if op.is_active else "Inactive"}.')
            return redirect('/hvac/operators/')

        elif action == 'delete':
            op_id = request.POST.get('operator_id')
            op = get_object_or_404(User, id=op_id, role=User.Role.HVAC_OPERATOR)
            name = op.get_full_name() or op.username
            op.delete()
            messages.success(request, f'Operator {name} was permanently removed.')
            return redirect('/hvac/operators/')

    operators = User.objects.filter(role=User.Role.HVAC_OPERATOR).order_by('-is_active', 'first_name')
    context = {
        'operators': operators,
        'active_count': sum(1 for o in operators if o.is_active),
        'total_count': len(operators),
        'active_nav': 'operators',
        'is_supervisor': True,
    }
    return render(request, 'hvac/mobile/operators.html', context)


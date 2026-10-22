from datetime import datetime
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.utils import timezone

from .models import WtpReading, BlockMeter, BlockReading, SupervisorLog, StationMeter, GwssbBill
from .views import clean_reading_values

STATIONS = [
    {'id': 'wtp', 'name': 'WTP / WSC-II', 'tag': 'Water Treatment & Pumping'},
    {'id': 'stp', 'name': 'STP / WSC-I', 'tag': 'Sewage Treatment & Irrigation'},
    {'id': 'wsc3', 'name': 'WSC-III', 'tag': 'Housing & Irrigation'},
    {'id': 'jm', 'name': 'Jalmandapam', 'tag': 'Tanks Storage & Level Meters'},
]

SHIFTS = [
    {'id': 1, 'name': 'Shift 1', 'time': '6 AM - 2 PM'},
    {'id': 2, 'name': 'Shift 2', 'time': '2 PM - 10 PM'},
    {'id': 3, 'name': 'Shift 3', 'time': '10 PM - 6 AM'},
]


def get_current_shift(now_time=None):
    if now_time is None:
        now_time = timezone.localtime().time()
    h = now_time.hour
    if 6 <= h < 14:
        return 1
    elif 14 <= h < 22:
        return 2
    else:
        return 3


def mobile_wtp_root(request):
    return redirect('/wtp/dashboard/')


@login_required(login_url='/portal/login/')
def mobile_dashboard(request):
    today = timezone.localdate()
    today_str = str(today)
    date_str = request.GET.get('date', today_str)
    try:
        query_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        query_date = today
        date_str = today_str

    is_today = (date_str == today_str)
    formatted_date = query_date.strftime('%a, %d %b %Y')

    active_shift = get_current_shift()
    readings = WtpReading.objects.filter(date=query_date)

    user_role = getattr(request.user, 'role', '')
    is_operator = user_role in ['wtp_operator', 'operator']
    is_supervisor = user_role in ['plant_engineer', 'wtp_supervisor', 'supervisor', 'electrical_supervisor', 'admin'] or request.user.is_superuser

    # Station status map
    station_cards = []
    for st in STATIONS:
        st_readings = readings.filter(station=st['id'])
        shift_status = {}
        # Jalmandapam has Initial Value (1) and Final Value (2) instead of 3 shifts
        shifts_to_check = [1, 2] if st['id'] == 'jm' else [1, 2, 3]
        for s in shifts_to_check:
            r = st_readings.filter(shift=s).first()
            label = ('Initial Value' if s == 1 else 'Final Value') if st['id'] == 'jm' else f"Shift {s}"
            shift_status[s] = {
                'entered': r is not None,
                'status': r.status if r else 'pending',
                'by': r.by if r else None,
                'label': label,
            }
        station_cards.append({
            'id': st['id'],
            'name': st['name'],
            'tag': st['tag'],
            'is_jm': st['id'] == 'jm',
            'shifts': shift_status,
        })

    # Jalmandapam latest levels
    jm_reading = readings.filter(station='jm').order_by('-shift').first()
    tank_levels = []
    if jm_reading and jm_reading.values:
        for i in range(1, 6):
            lvl = jm_reading.values.get(f"jm{i}")
            if lvl is not None:
                tank_levels.append({
                    'num': i,
                    'lvl': lvl,
                    'pct': min(100, round((lvl / 4.0) * 100)),
                })

    # Supervisor log for today
    sup_log = SupervisorLog.objects.filter(date=query_date).order_by('-shift').first()
    latest_gwssb = GwssbBill.objects.order_by('-month').first()

    return render(request, 'wtp_stp/mobile/dashboard.html', {
        'today': today_str,
        'today_date': today_str,
        'query_date': date_str,
        'current_date': date_str,
        'is_today': is_today,
        'formatted_date': formatted_date,
        'active_shift': active_shift,
        'station_cards': station_cards,
        'tank_levels': tank_levels,
        'sup_log': sup_log,
        'latest_gwssb': latest_gwssb,
        'user': request.user,
        'is_operator': is_operator,
        'is_supervisor': is_supervisor,
        'active_nav': 'dashboard',
    })


@login_required(login_url='/portal/login/')
def mobile_station_entry(request, station='wtp'):
    today = timezone.localdate()
    today_str = str(today)
    date_str = request.GET.get('date', today_str)
    shift_val = int(request.GET.get('shift', get_current_shift()))
    if station == 'jm' and shift_val not in [1, 2]:
        shift_val = 1

    try:
        parsed_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        parsed_date = today
        date_str = today_str

    is_today = (date_str == today_str)
    formatted_date = parsed_date.strftime('%a, %d %b %Y')

    st_info = next((s for s in STATIONS if s['id'] == station), STATIONS[0])

    user_role = getattr(request.user, 'role', '')
    is_supervisor = (user_role in ['plant_engineer', 'wtp_supervisor', 'supervisor', 'admin', 'electrical_supervisor', 'hvac_engineer', 'hvac_supervisor'] or request.user.is_superuser)
    is_operator = not is_supervisor

    # Fetch existing values
    existing = WtpReading.objects.filter(date=parsed_date, shift=shift_val, station=station).first()
    has_existing = bool(existing and existing.values and any(v != '' and v is not None for v in existing.values.values()))
    is_locked = has_existing and is_operator

    if request.method == 'POST':
        if is_locked:
            messages.error(request, f"Permission Denied: Shift {shift_val} reading for {st_info['name']} is already recorded. Operators cannot edit logged shifts. Contact Shift Engineer for any revisions.")
            return redirect(f"/wtp/dashboard/?date={date_str}")

        values = {}
        for key, val in request.POST.items():
            if key in ['csrfmiddlewaretoken', 'date', 'shift', 'station', 'by']:
                continue
            try:
                num = float(val)
                values[key] = num
            except (ValueError, TypeError):
                continue

        if not values:
            messages.error(request, 'Please enter at least one meter reading.')
        else:
            by_user = request.POST.get('by') or request.user.get_full_name() or request.user.username
            reading, created = WtpReading.objects.get_or_create(
                date=parsed_date,
                shift=shift_val,
                station=station,
                defaults={'values': values, 'by': by_user}
            )
            if not created:
                current = dict(reading.values or {})
                current.update(values)
                reading.values = current
                reading.by = by_user
                reading.save()

            if station == 'jm':
                reading_name = 'Final Value' if shift_val == 2 else 'Initial Value'
                messages.success(request, f"Saved readings for Jalmandapam ({reading_name}) successfully.")
            else:
                messages.success(request, f"Saved readings for {st_info['name']} (Shift {shift_val}) successfully.")
            return redirect(f"/wtp/dashboard/?date={date_str}")

    vals = existing.values if existing else {}

    # Fetch custom station meters (e.g. custom WSC meters with multiplying coefficients)
    custom_meters = list(StationMeter.objects.filter(station=station))
    for cm in custom_meters:
        cm.val = vals.get(cm.k, '')

    return render(request, 'wtp_stp/mobile/station_entry.html', {
        'station': st_info,
        'shift': shift_val,
        'date': date_str,
        'current_date': date_str,
        'today_date': today_str,
        'is_today': is_today,
        'formatted_date': formatted_date,
        'vals': vals,
        'existing': existing,
        'has_existing': has_existing,
        'is_locked': is_locked,
        'is_supervisor': is_supervisor,
        'is_operator': is_operator,
        'custom_meters': custom_meters,
        'user': request.user,
        'active_nav': 'entry',
    })


@login_required(login_url='/portal/login/')
def mobile_block_entry(request):
    current_month = timezone.localdate().strftime('%Y-%m')
    month = request.GET.get('month', current_month)
    meters = BlockMeter.objects.all().order_by('sr')

    user_role = getattr(request.user, 'role', '')
    is_supervisor = (user_role in ['plant_engineer', 'wtp_supervisor', 'supervisor', 'admin', 'electrical_supervisor', 'hvac_engineer', 'hvac_supervisor'] or request.user.is_superuser)
    is_operator = not is_supervisor

    doc = BlockReading.objects.filter(month=month).first()
    has_existing = bool(doc and doc.readings and any(v != '' and v is not None for v in doc.readings.values()))
    is_locked = has_existing and is_operator

    if request.method == 'POST':
        month_post = request.POST.get('month', month)
        if is_locked:
            messages.error(request, f"Permission Denied: Block meter readings for {month_post} are already recorded. Operators cannot edit logged readings.")
            return redirect(f"/wtp/blocks/?month={month_post}")

        readings = {}
        for key, val in request.POST.items():
            if key.startswith('m'):
                try:
                    num = float(val)
                    readings[key] = num
                except (ValueError, TypeError):
                    continue

        if not readings:
            messages.error(request, 'Please enter at least one block reading.')
        else:
            by_user = request.POST.get('by') or request.user.get_full_name() or request.user.username
            doc, created = BlockReading.objects.get_or_create(
                month=month_post,
                defaults={'readings': readings, 'by': by_user, 'date': str(timezone.localdate())}
            )
            if not created:
                current = dict(doc.readings or {})
                current.update(readings)
                doc.readings = current
                doc.by = by_user
                doc.save()

            messages.success(request, f"Saved {len(readings)} block meter readings for {month_post}.")
            return redirect(f"/wtp/blocks/?month={month_post}")

    readings_map = doc.readings if doc else {}

    return render(request, 'wtp_stp/mobile/block_entry.html', {
        'month': month,
        'meters': meters,
        'readings_map': readings_map,
        'is_locked': is_locked,
        'is_supervisor': is_supervisor,
        'is_operator': is_operator,
        'user': request.user,
    })


@login_required(login_url='/portal/login/')
def mobile_history(request):
    today = timezone.localdate()
    today_str = str(today)
    date_filter = request.GET.get('date', '')
    recent_readings = WtpReading.objects.all()
    if date_filter:
        recent_readings = recent_readings.filter(date=date_filter)
    recent_readings = recent_readings.order_by('-date', '-shift')[:50]
    return render(request, 'wtp_stp/mobile/history.html', {
        'readings': recent_readings,
        'user': request.user,
        'today': today_str,
        'date_filter': date_filter,
        'active_nav': 'history',
    })


@login_required(login_url='/portal/login/')
def mobile_operators_view(request):
    """
    Mobile operator management for WTP/STP Supervisors and Plant Engineer.
    Allows viewing, adding, toggling active status, and removing operators.
    """
    from apps.users.models import User, unique_standard_username

    user_role = getattr(request.user, 'role', '')
    is_allowed = (user_role in ['plant_engineer', 'wtp_supervisor', 'admin'] or request.user.is_superuser)
    if not is_allowed:
        messages.error(request, 'Only Supervisors and Plant Engineers can manage field operators.')
        return redirect('/wtp/dashboard/')

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
                        role=User.Role.WTP_OPERATOR,
                        is_active=True,
                    )
                    new_user.set_password(password)
                    new_user.save()
                    messages.success(request, f'Operator {new_user.get_full_name()} added successfully! (Login ID: {new_user.phone})')
            return redirect('/wtp/operators/')

        elif action == 'toggle_status':
            op_id = request.POST.get('operator_id')
            op = get_object_or_404(User, id=op_id, role=User.Role.WTP_OPERATOR)
            op.is_active = not op.is_active
            op.save(update_fields=['is_active'])
            messages.success(request, f'Operator {op.get_full_name()} is now {"Active" if op.is_active else "Inactive"}.')
            return redirect('/wtp/operators/')

        elif action == 'delete':
            op_id = request.POST.get('operator_id')
            op = get_object_or_404(User, id=op_id, role=User.Role.WTP_OPERATOR)
            name = op.get_full_name() or op.username
            op.delete()
            messages.success(request, f'Operator {name} was permanently removed.')
            return redirect('/wtp/operators/')

    operators = User.objects.filter(role=User.Role.WTP_OPERATOR).order_by('-is_active', 'first_name')
    context = {
        'operators': operators,
        'active_count': sum(1 for o in operators if o.is_active),
        'total_count': len(operators),
        'active_nav': 'operators',
        'is_supervisor': True,
        'user': request.user,
    }
    return render(request, 'wtp_stp/mobile/operators.html', context)


@login_required(login_url='/portal/login/')
def mobile_gwssb_view(request):
    user_role = getattr(request.user, 'role', '')
    is_supervisor = user_role in ['plant_engineer', 'wtp_supervisor', 'supervisor', 'admin', 'electrical_supervisor', 'hvac_engineer', 'hvac_supervisor'] or request.user.is_superuser
    if not is_supervisor:
        messages.error(request, 'Permission Denied: GWSSB Water Bill calculations are accessible only to Shift Engineers and Supervisors.')
        return redirect('/wtp/dashboard/')

    now_month = timezone.localdate().strftime('%Y-%m')
    selected_month = request.GET.get('month', now_month)

    bills = list(GwssbBill.objects.all().order_by('-month'))
    current_bill = next((b for b in bills if b.month == selected_month), None)

    if request.method == 'POST':
        action = request.POST.get('action')
        if action == 'delete':
            del_month = request.POST.get('month')
            GwssbBill.objects.filter(month=del_month).delete()
            messages.success(request, f"Deleted GWSSB bill record for {del_month}.")
            return redirect(f"/wtp/gwssb/?month={now_month}")

        month_val = request.POST.get('month', selected_month).strip()
        try:
            init_val = float(request.POST.get('initial_reading', 0.0) or 0.0)
            final_val = float(request.POST.get('final_reading', 0.0) or 0.0)
        except (ValueError, TypeError):
            messages.error(request, 'Please enter valid numerical Initial and Final readings.')
            return redirect(f"/wtp/gwssb/?month={selected_month}")

        if final_val < init_val:
            messages.error(request, 'Final reading cannot be less than Initial reading.')
            return redirect(f"/wtp/gwssb/?month={selected_month}")

        bill_no = request.POST.get('bill_no', '').strip()
        status_val = request.POST.get('status', 'Verified').strip()
        remarks = request.POST.get('remarks', '').strip()
        by_user = request.user.get_full_name() or request.user.username

        bill, created = GwssbBill.objects.update_or_create(
            month=month_val,
            defaults={
                'date': str(timezone.localdate()),
                'initial_reading': init_val,
                'final_reading': final_val,
                'rate_per_unit': 10.0,
                'bill_no': bill_no,
                'status': status_val,
                'remarks': remarks,
                'by': by_user,
            }
        )
        messages.success(request, f"Saved GWSSB bill for {month_val}! Net Water Consumption: {bill.net_consumption:,.1f} CUM | Bill: ₹ {bill.bill_amount:,.2f}")
        return redirect(f"/wtp/gwssb/?month={month_val}")

    suggested_init = ''
    if not current_bill:
        prev_bill = next((b for b in bills if b.month < selected_month), None)
        if prev_bill:
            suggested_init = prev_bill.final_reading

    total_billed = sum(b.bill_amount for b in bills)

    return render(request, 'wtp_stp/mobile/gwssb.html', {
        'bills': bills,
        'selected_month': selected_month,
        'current_bill': current_bill,
        'suggested_init': suggested_init,
        'total_billed': total_billed,
        'is_supervisor': True,
        'active_nav': 'gwssb',
        'user': request.user,
    })



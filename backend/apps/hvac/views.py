import csv
import io
import re
import uuid
from datetime import datetime, date, time as datetime_time, timedelta
from django.utils import timezone
from django.http import HttpResponse
from django.db import transaction
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

from .models import (
    HvacLog,
    HvacSupervisorLog,
    HvacImportBatch,
    CHILLERS,
    derive_values,
    check_alerts,
    PUMP_RATED_LIMITS,
    CUSTOM_PUMP_RATINGS,
    get_active_pump_ratings,
)


TIME_SLOTS = [
    f"{str((450 + 60 * i) // 60 % 24).zfill(2)}:30"
    for i in range(24)
]

OPERATOR_EDIT_WINDOW_MINUTES = 10


def is_hvac_supervisor_or_admin(user):
    if not user or not user.is_authenticated:
        return False
    if getattr(user, 'is_admin', False) or getattr(user, 'is_superuser', False) or getattr(user, 'is_plant_engineer', False):
        return True
    return getattr(user, 'role', '') in ('hvac_engineer', 'hvac_supervisor')


def can_edit_hvac_log(user, log_obj):
    """
    Returns True if user is a supervisor/engineer/admin,
    or if user is an operator and the log was created within 10 minutes.
    """
    if is_hvac_supervisor_or_admin(user):
        return True
    if not log_obj:
        return True
    created_time = log_obj.created_at
    if not created_time and log_obj.ts:
        try:
            created_time = datetime.fromtimestamp(log_obj.ts / 1000.0, tz=timezone.utc)
        except Exception:
            pass
    if not created_time:
        return False
    return (timezone.now() - created_time) <= timedelta(minutes=OPERATOR_EDIT_WINDOW_MINUTES)


class IsHvacStaff(permissions.BasePermission):
    """
    Allows read and log-entry access to HVAC staff (operators, supervisors, engineers)
    and plant engineers / admins.
    Blocks unrelated roles like caretakers, hostel office, etc.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        user = request.user
        if getattr(user, 'is_admin', False) or getattr(user, 'is_superuser', False) or getattr(user, 'is_plant_engineer', False):
            return True
        return getattr(user, 'role', '') in ('hvac_engineer', 'hvac_supervisor', 'hvac_operator')


class IsHvacSupervisorOrAdmin(permissions.BasePermission):
    """
    Restricts update (PUT), delete (DELETE), supervisor logs, and pump ratings configuration
    to HVAC supervisors, HVAC engineers, plant engineers, and admins.
    Operators are strictly forbidden from modifying or deleting records.
    """
    def has_permission(self, request, view):
        return is_hvac_supervisor_or_admin(request.user)


class IsHvacEngineerOnly(permissions.BasePermission):
    """
    Strictly restricts historical CSV template and log importation exclusively
    to the HVAC Engineer portal (and superuser).
    Supervisors, operators, caretakers, and other staff are strictly forbidden.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        user = request.user
        if getattr(user, 'is_superuser', False):
            return True
        return getattr(user, 'role', '') == 'hvac_engineer'


class HvacHealthView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        total_logs = HvacLog.objects.count()
        latest = HvacLog.objects.order_by('-date', '-slot').first()
        return Response({
            'ok': True,
            'module': 'hvac_plant_log',
            'status': 'operational',
            'totalLogs': total_logs,
            'latestDate': latest.date.isoformat() if latest else None,
            'latestSlot': latest.slot if latest else None,
        })


class HvacAuthCheckView(APIView):
    permission_classes = [IsHvacStaff]

    def get(self, request):
        return Response({'ok': True, 'role': getattr(request.user, 'role', '')})


class HvacLogsListView(APIView):
    permission_classes = [IsHvacStaff]

    def get(self, request):

        latest = request.query_params.get('latest')
        if latest in ['1', 'true', 'True']:
            log = HvacLog.objects.order_by('-date', '-slot').first()
            return Response([log.to_dict()] if log else [])

        date_param = request.query_params.get('date')
        month_param = request.query_params.get('month')
        op = request.query_params.get('op', '==')
        shift = request.query_params.get('shift')

        qs = HvacLog.objects.all()

        if date_param:
            # Handle YYYY-MM-DD or YYYY-MM
            if len(date_param) == 10:
                if op == '>=':
                    qs = qs.filter(date__gte=date_param)
                elif op == '<=':
                    qs = qs.filter(date__lte=date_param)
                else:
                    qs = qs.filter(date=date_param)
            elif len(date_param) == 7:
                qs = qs.filter(date__startswith=date_param)

        elif month_param:
            qs = qs.filter(date__startswith=month_param)

        if shift:
            qs = qs.filter(shift=str(shift))

        qs = qs.order_by('date', 'slot')
        return Response([log.to_dict() for log in qs])

    def post(self, request):
        return self.save_log(request)

    def put(self, request):
        b = request.data or {}
        date_val = b.get('date')
        time_val = b.get('time')
        clean_time = (time_val or '').replace(':', '')
        log_id = f"{date_val}_{clean_time}" if (date_val and clean_time) else None
        existing = HvacLog.objects.filter(id=log_id).first() if log_id else None
        if existing and not can_edit_hvac_log(request.user, existing):
            return Response({'error': 'The 10-minute edit window has expired. Only supervisors and engineers can edit logs.'}, status=status.HTTP_403_FORBIDDEN)
        if not existing and not is_hvac_supervisor_or_admin(request.user):
            user_role = getattr(request.user, 'role', '')
            if user_role not in ('hvac_engineer', 'hvac_supervisor', 'hvac_operator'):
                return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        return self.save_log(request)

    def save_log(self, request):
        b = request.data or {}
        date_val = b.get('date')
        time_val = b.get('time')
        slot_val = b.get('slot')
        operator_val = (b.get('operator') or '').strip()
        setpoint_val = b.get('setpoint')
        v_val = b.get('v') or {}

        if not date_val or not time_val:
            return Response({'error': 'Date and time are required'}, status=status.HTTP_400_BAD_REQUEST)

        if not operator_val:
            return Response({'error': 'Operator name is required'}, status=status.HTTP_400_BAD_REQUEST)

        if not isinstance(v_val, dict) or not v_val:
            return Response({'error': 'At least one reading is required in values object'}, status=status.HTTP_400_BAD_REQUEST)

        # Compute slot if not passed
        if slot_val is None:
            try:
                slot_val = TIME_SLOTS.index(time_val)
            except ValueError:
                slot_val = 0

        # Compute shift: 0-7 is Shift 1, 8-15 is Shift 2, 16-23 is Shift 3
        shift_val = str(b.get('shift') or ((slot_val // 8) + 1))

        # ID format: YYYY-MM-DD_HHMM
        clean_time = time_val.replace(':', '')
        log_id = f"{date_val}_{clean_time}"

        # Check 10-minute edit window for operators
        existing = HvacLog.objects.filter(id=log_id).first()
        if existing and not can_edit_hvac_log(request.user, existing):
            return Response({'error': 'The 10-minute edit window has expired. Only supervisors and engineers can edit logs.'}, status=status.HTTP_403_FORBIDDEN)

        # Clean readings values
        cleaned_v = {}
        for k, x in v_val.items():
            k_str = str(k).strip()
            if not re.match(r'^[a-zA-Z0-9_]+$', k_str):
                continue
            if isinstance(x, (int, float)):
                cleaned_v[k_str] = round(float(x), 2)
            elif isinstance(x, str):
                cleaned_v[k_str] = x.strip()[:30]

        try:
            log_obj, _ = HvacLog.objects.update_or_create(
                id=log_id,
                defaults={
                    'date': date_val,
                    'time': time_val,
                    'slot': slot_val,
                    'shift': shift_val,
                    'operator': operator_val,
                    'setpoint': float(setpoint_val) if setpoint_val is not None and setpoint_val != '' else None,
                    'values': cleaned_v,
                    'ts': int(timezone.now().timestamp() * 1000),
                }
            )
            return Response({'ok': True, 'log': log_obj.to_dict()})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class HvacLogDetailView(APIView):
    permission_classes = [IsHvacStaff]

    def get(self, request, log_id):
        try:
            log = HvacLog.objects.get(id=log_id)
            return Response(log.to_dict())
        except HvacLog.DoesNotExist:
            return Response({'error': 'Log not found'}, status=status.HTTP_404_NOT_FOUND)

    def put(self, request, log_id):
        existing = HvacLog.objects.filter(id=log_id).first()
        if existing and not can_edit_hvac_log(request.user, existing):
            return Response({'error': 'The 10-minute edit window has expired. Only supervisors and engineers can edit logs.'}, status=status.HTTP_403_FORBIDDEN)
        if not existing and not is_hvac_supervisor_or_admin(request.user):
            return Response({'error': 'Only supervisors and engineers can edit logs'}, status=status.HTTP_403_FORBIDDEN)
        b = request.data or {}
        # Ensure log_id matches or fallback
        date_val = b.get('date') or log_id.split('_')[0]
        time_val = b.get('time') or (log_id.split('_')[1][:2] + ':' + log_id.split('_')[1][2:])
        slot_val = b.get('slot')
        if slot_val is None:
            try:
                slot_val = TIME_SLOTS.index(time_val)
            except ValueError:
                slot_val = 0
        shift_val = str(b.get('shift') or ((slot_val // 8) + 1))
        operator_val = (b.get('operator') or '').strip()
        setpoint_val = b.get('setpoint')
        v_val = b.get('v') or {}

        cleaned_v = {}
        for k, x in v_val.items():
            k_str = str(k).strip()
            if not re.match(r'^[a-zA-Z0-9_]+$', k_str):
                continue
            if isinstance(x, (int, float)):
                cleaned_v[k_str] = round(float(x), 2)
            elif isinstance(x, str):
                cleaned_v[k_str] = x.strip()[:30]

        log_obj, _ = HvacLog.objects.update_or_create(
            id=log_id,
            defaults={
                'date': date_val,
                'time': time_val,
                'slot': slot_val,
                'shift': shift_val,
                'operator': operator_val,
                'setpoint': float(setpoint_val) if setpoint_val is not None and setpoint_val != '' else None,
                'values': cleaned_v,
                'ts': int(timezone.now().timestamp() * 1000),
            }
        )
        return Response({'ok': True, 'log': log_obj.to_dict()})

    def delete(self, request, log_id):
        user = request.user
        if not (getattr(user, 'is_admin', False) or getattr(user, 'is_superuser', False) or getattr(user, 'is_plant_engineer', False) or getattr(user, 'role', '') in ('hvac_engineer', 'hvac_supervisor')):
            return Response({'error': 'Only supervisors and engineers can delete logs'}, status=status.HTTP_403_FORBIDDEN)
        try:
            log = HvacLog.objects.get(id=log_id)
            log.delete()
            return Response({'ok': True, 'message': 'Log deleted'})
        except HvacLog.DoesNotExist:
            return Response({'error': 'Log not found'}, status=status.HTTP_404_NOT_FOUND)


class HvacOverviewView(APIView):
    permission_classes = [IsHvacStaff]

    def get(self, request):
        date_str = request.query_params.get('date')
        if not date_str:
            date_str = date.today().isoformat()

        day_logs = list(HvacLog.objects.filter(date=date_str).order_by('slot'))
        latest = day_logs[-1] if day_logs else HvacLog.objects.order_by('-date', '-slot').first()

        # Chillers status
        chillers_status = []
        active_chillers_count = 0
        latest_vals = latest.values if latest else {}

        for n, name, tr in CHILLERS:
            prefix = f'c{n}_'
            is_on = latest_vals.get(f'{prefix}st') == 'on' or (
                latest_vals.get(f'{prefix}st') is None and latest_vals.get(f'{prefix}evapOut') is not None
            )
            if is_on:
                active_chillers_count += 1
            chillers_status.append({
                'num': n,
                'name': name,
                'tr': tr,
                'running': is_on,
                'evapIn': latest_vals.get(f'{prefix}evapIn'),
                'evapOut': latest_vals.get(f'{prefix}evapOut'),
                'evapP': latest_vals.get(f'{prefix}evapP'),
                'condIn': latest_vals.get(f'{prefix}condIn'),
                'condOut': latest_vals.get(f'{prefix}condOut'),
                'rla': latest_vals.get(f'{prefix}rla'),
            })

        # Alerts for the day
        all_alerts = []
        for l in day_logs:
            for a in l.alerts:
                all_alerts.append({
                    'time': l.time,
                    'slot': l.slot,
                    'message': a,
                })

        # Operators on duty
        operators = {}
        for s in ['1', '2', '3']:
            s_ops = list(dict.fromkeys([l.operator for l in day_logs if str(l.shift) == s and l.operator]))
            operators[f'shift_{s}'] = s_ops

        # Supervisor Handover for date
        handovers = [h.to_dict() for h in HvacSupervisorLog.objects.filter(date=date_str)]

        return Response({
            'date': date_str,
            'slotsLogged': len(day_logs),
            'totalSlots': 24,
            'activeChillers': active_chillers_count,
            'chillers': chillers_status,
            'alerts': all_alerts,
            'operators': operators,
            'latestLog': latest.to_dict() if latest else None,
            'handovers': handovers,
            'logs': [l.to_dict() for l in day_logs],
        })


class HvacSupervisorLogView(APIView):
    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsHvacSupervisorOrAdmin()]
        return [IsHvacStaff()]

    def get(self, request):
        date_str = request.query_params.get('date') or date.today().isoformat()
        logs = HvacSupervisorLog.objects.filter(date=date_str)
        return Response([l.to_dict() for l in logs])

    def post(self, request):
        data = request.data or {}
        date_str = data.get('date') or date.today().isoformat()
        shift = str(data.get('shift', '1'))

        log_obj, _ = HvacSupervisorLog.objects.update_or_create(
            date=date_str,
            shift=shift,
            defaults={
                'status': data.get('status', 'Normal'),
                'chillers_checked': bool(data.get('chillersChecked', True)),
                'pumps_checked': bool(data.get('pumpsChecked', True)),
                'towers_checked': bool(data.get('towersChecked', True)),
                'panels_checked': bool(data.get('panelsChecked', True)),
                'water_checked': bool(data.get('waterChecked', True)),
                'notes': data.get('notes', ''),
                'supervisor_name': data.get('supervisorName') or getattr(request.user, 'username', 'Supervisor'),
            }
        )
        # On create, `date` is still the raw request string; reload so to_dict() gets a date.
        log_obj.refresh_from_db()
        return Response({'ok': True, 'log': log_obj.to_dict()})


class HvacPumpRatingsView(APIView):
    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsHvacSupervisorOrAdmin()]
        return [IsHvacStaff()]

    def get(self, request):
        return Response({
            'ok': True,
            'ratings': get_active_pump_ratings(),
            'defaults': PUMP_RATED_LIMITS,
            'customOverrides': CUSTOM_PUMP_RATINGS,
        })

    def post(self, request):

        data = request.data or {}
        action = data.get('action', 'save')

        if action == 'reset':
            pump_key = data.get('pump_key')
            if pump_key:
                CUSTOM_PUMP_RATINGS.pop(pump_key, None)
            else:
                CUSTOM_PUMP_RATINGS.clear()
            return Response({
                'ok': True,
                'ratings': get_active_pump_ratings(),
                'message': 'Ratings reset to defaults',
            })

        # Save single or batch ratings
        ratings = data.get('ratings', {})
        # If single rating payload provided: { pump_key: 'pri1', max_a: 22, ... }
        if 'pump_key' in data:
            pk = data['pump_key']
            if pk in PUMP_RATED_LIMITS:
                curr = CUSTOM_PUMP_RATINGS.get(pk, dict(PUMP_RATED_LIMITS[pk]))
                if 'max_a' in data and data['max_a'] is not None:
                    curr['max_a'] = float(data['max_a'])
                if 'max_v' in data and data['max_v'] is not None:
                    curr['max_v'] = float(data['max_v'])
                if 'range_a' in data:
                    curr['range_a'] = str(data['range_a'])
                if 'range_v' in data:
                    curr['range_v'] = str(data['range_v'])
                CUSTOM_PUMP_RATINGS[pk] = curr

        for pk, vals in ratings.items():
            if pk in PUMP_RATED_LIMITS and isinstance(vals, dict):
                curr = CUSTOM_PUMP_RATINGS.get(pk, dict(PUMP_RATED_LIMITS[pk]))
                if 'max_a' in vals and vals['max_a'] is not None:
                    curr['max_a'] = float(vals['max_a'])
                if 'max_v' in vals and vals['max_v'] is not None:
                    curr['max_v'] = float(vals['max_v'])
                if 'range_a' in vals:
                    curr['range_a'] = str(vals['range_a'])
                if 'range_v' in vals:
                    curr['range_v'] = str(vals['range_v'])
                CUSTOM_PUMP_RATINGS[pk] = curr

        return Response({
            'ok': True,
            'ratings': get_active_pump_ratings(),
            'message': 'Pump ratings updated successfully',
        })


def parse_hvac_date(val):
    if val is None or val == '':
        return None
    # 1. Native datetime.date or datetime.datetime
    if isinstance(val, (datetime, date)):
        return val.strftime('%Y-%m-%d')
    # 2. Excel numeric serial date (e.g. 45000)
    if isinstance(val, (int, float)) and not isinstance(val, bool):
        if 30000 <= val <= 65000:
            try:
                base = datetime(1899, 12, 30)
                dt = base + timedelta(days=float(val))
                return dt.strftime('%Y-%m-%d')
            except Exception:
                pass
    # 3. String representations
    val_str = str(val).strip()
    if not val_str:
        return None
    val_clean = val_str.replace('T', ' ').split(' ')[0].strip()
    for fmt in (
        '%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y', '%m/%d/%Y',
        '%Y/%m/%d', '%d.%m.%Y', '%d-%b-%Y', '%d-%B-%Y', '%Y%m%d',
    ):
        try:
            return datetime.strptime(val_clean, fmt).date().isoformat()
        except ValueError:
            pass
    return None


def parse_hvac_time(val):
    if val is None or val == '':
        return None
    # 1. Native datetime.time or datetime.datetime
    if isinstance(val, datetime):
        return f"{val.hour:02d}:{val.minute:02d}"
    if isinstance(val, datetime_time):
        return f"{val.hour:02d}:{val.minute:02d}"
    # 2. Excel fractional day (e.g. 0.3541666666666667 for 08:30)
    if isinstance(val, float) and 0.0 <= val < 1.0:
        total_mins = round(val * 1440)
        h = (total_mins // 60) % 24
        m = total_mins % 60
        return f"{h:02d}:{m:02d}"
    # 3. String representations
    val_str = str(val).strip()
    if not val_str:
        return None
    # Check AM/PM formats
    for fmt in ('%I:%M %p', '%I:%M:%S %p', '%I %p', '%I:%M%p', '%I:%M:%S%p'):
        try:
            dt = datetime.strptime(val_str.upper(), fmt)
            return f"{dt.hour:02d}:{dt.minute:02d}"
        except ValueError:
            pass
    # Standard 24h formats
    val_norm = val_str.replace('.', ':')
    parts = val_norm.split(':')
    if len(parts) >= 2:
        try:
            h = int(parts[0])
            m = int(parts[1])
            if 0 <= h < 24 and 0 <= m < 60:
                return f"{h:02d}:{m:02d}"
        except ValueError:
            pass
    elif len(parts) == 1 and parts[0].isdigit():
        h = int(parts[0])
        if 0 <= h < 24:
            return f"{h:02d}:30"
    return None


# Canonical template header list for HVAC import
HVAC_CSV_TEMPLATE_HEADERS = [
    'date', 'time', 'slot', 'shift', 'operator', 'setpoint',
    # Chiller 1 (Trane 1 - 305 TR)
    'c1_st', 'c1_evapIn', 'c1_evapOut', 'c1_evapP', 'c1_condIn', 'c1_condOut', 'c1_condP', 'c1_drift', 'c1_oilP', 'c1_oilL', 'c1_rla', 'c1_l1', 'c1_l2', 'c1_l3', 'c1_v1', 'c1_v2', 'c1_v3',
    # Chiller 2 (Trane 2 - 305 TR)
    'c2_st', 'c2_evapIn', 'c2_evapOut', 'c2_evapP', 'c2_condIn', 'c2_condOut', 'c2_condP', 'c2_drift', 'c2_oilP', 'c2_oilL', 'c2_rla', 'c2_l1', 'c2_l2', 'c2_l3', 'c2_v1', 'c2_v2', 'c2_v3',
    # Chiller 3 (Trane 3 - 305 TR)
    'c3_st', 'c3_evapIn', 'c3_evapOut', 'c3_evapP', 'c3_condIn', 'c3_condOut', 'c3_condP', 'c3_drift', 'c3_oilP', 'c3_oilL', 'c3_rla', 'c3_l1', 'c3_l2', 'c3_l3', 'c3_v1', 'c3_v2', 'c3_v3',
    # Chiller 4 (Trane 4 - 305 TR)
    'c4_st', 'c4_evapIn', 'c4_evapOut', 'c4_evapP', 'c4_condIn', 'c4_condOut', 'c4_condP', 'c4_drift', 'c4_oilP', 'c4_oilL', 'c4_rla', 'c4_l1', 'c4_l2', 'c4_l3', 'c4_v1', 'c4_v2', 'c4_v3',
    # Chiller 5 (Carrier 5 - 600 TR)
    'c5_st', 'c5_evapIn', 'c5_evapOut', 'c5_evapP', 'c5_condIn', 'c5_condOut', 'c5_condP', 'c5_drift', 'c5_oilP', 'c5_oilL', 'c5_rla', 'c5_l1', 'c5_l2', 'c5_l3', 'c5_v1', 'c5_v2', 'c5_v3',
    # Chiller 6 (Daikin 6 - 605 TR)
    'c6_st', 'c6_evapIn', 'c6_evapOut', 'c6_evapP', 'c6_condIn', 'c6_condOut', 'c6_condP', 'c6_drift', 'c6_oilP', 'c6_oilL', 'c6_rla', 'c6_l1', 'c6_l2', 'c6_l3', 'c6_v1', 'c6_v2', 'c6_v3',
    # Chiller 7 (Daikin 7 - 605 TR)
    'c7_st', 'c7_evapIn', 'c7_evapOut', 'c7_evapP', 'c7_condIn', 'c7_condOut', 'c7_condP', 'c7_drift', 'c7_oilP', 'c7_oilL', 'c7_rla', 'c7_l1', 'c7_l2', 'c7_l3', 'c7_v1', 'c7_v2', 'c7_v3',
    # Primary Pumps
    'pri1_a', 'pri1_v', 'pri2_a', 'pri2_v', 'pri3_a', 'pri3_v', 'pri4_a', 'pri4_v', 'pri5_a', 'pri5_v', 'pri6_a', 'pri6_v',
    'priNA1_a', 'priNA1_v', 'priNA2_a', 'priNA2_v', 'priNA3_a', 'priNA3_v', 'priNA4_a', 'priNA4_v',
    # Secondary Pumps
    'sec1_a', 'sec1_v', 'sec2_a', 'sec2_v', 'sec3_a', 'sec3_v', 'sec4_a', 'sec4_v', 'sec5_a', 'sec5_v', 'sec6_a', 'sec6_v', 'sec7_a', 'sec7_v',
    'secNA1_a', 'secNA1_v', 'secNA2_a', 'secNA2_v', 'secNA3_a', 'secNA3_v', 'secNA4_a', 'secNA4_v',
    # Condenser Pumps
    'con1_a', 'con1_v', 'con2_a', 'con2_v', 'con3_a', 'con3_v', 'con4_a', 'con4_v', 'con5_a', 'con5_v', 'con6_a', 'con6_v',
    'conNA1_a', 'conNA1_v', 'conNA2_a', 'conNA2_v', 'conNA3_a', 'conNA3_v', 'conNA4_a', 'conNA4_v',
    # Cooling Towers
    'ct1_f1', 'ct1_f2', 'ct2_f1', 'ct2_f2', 'ct3_f1', 'ct3_f2', 'ct4_f1', 'ct4_f2',
    'ct5_f1', 'ct5_f2', 'ct5_f3', 'ct5_f4', 'ctn1_f1', 'ctn1_f2', 'ctn2_f1', 'ctn2_f2',
    # Electrical Panels & Flow Meters
    'pn1_mwh', 'pn1_amp', 'pn1_pf',
    'pn2_mwh', 'pn2_amp', 'pn2_pf',
    'pn3_mwh', 'pn3_amp', 'pn3_pf',
    'pn4_mwh', 'pn4_amp', 'pn4_pf',
    'pn5_mwh', 'pn5_amp', 'pn5_pf',
    'wm1_kl', 'wm2_kl', 'wm3_kl', 'wm_chilled_kl'
]

# Canonical lookup dictionaries for resilient header matching
CANONICAL_EXACT = {h.lower(): h for h in HVAC_CSV_TEMPLATE_HEADERS}
CANONICAL_CLEAN = {re.sub(r'[^a-z0-9]', '', h.lower()): h for h in HVAC_CSV_TEMPLATE_HEADERS}

CUSTOM_HEADER_SYNONYMS = {
    'readingdate': 'date',
    'logdate': 'date',
    'entrydate': 'date',
    'readingtime': 'time',
    'logtime': 'time',
    'entrytime': 'time',
    'hour': 'time',
    'operatorname': 'operator',
    'technician': 'operator',
    'tempsetpoint': 'setpoint',
    'temperaturesetpoint': 'setpoint',
    'setpt': 'setpoint',
    'setpointtemp': 'setpoint',
}

CHILLER_METRIC_MAP = {
    'status': 'st',
    'state': 'st',
    'st': 'st',
    'evapin': 'evapIn',
    'evaporatorentering': 'evapIn',
    'evapentering': 'evapIn',
    'evapout': 'evapOut',
    'evaporatorleaving': 'evapOut',
    'evapleaving': 'evapOut',
    'evapp': 'evapP',
    'evapcoolerpressure': 'evapP',
    'evappressure': 'evapP',
    'condin': 'condIn',
    'condenserentering': 'condIn',
    'condentering': 'condIn',
    'condout': 'condOut',
    'condenserleaving': 'condOut',
    'condleaving': 'condOut',
    'condp': 'condP',
    'condenserpressure': 'condP',
    'drift': 'drift',
    'oilp': 'oilP',
    'oilpressure': 'oilP',
    'oill': 'oilL',
    'oillevel': 'oilL',
    'rla': 'rla',
    'rlapercent': 'rla',
    'l1': 'l1',
    'l2': 'l2',
    'l3': 'l3',
    'v1': 'v1',
    'v2': 'v2',
    'v3': 'v3',
}


def normalize_hvac_header(raw_header):
    if raw_header is None:
        return None
    raw_str = str(raw_header).strip()
    if not raw_str:
        return None
    low = raw_str.lower()
    if low in CANONICAL_EXACT:
        return CANONICAL_EXACT[low]

    clean = re.sub(r'[^a-z0-9]', '', low)
    if clean in CUSTOM_HEADER_SYNONYMS:
        return CUSTOM_HEADER_SYNONYMS[clean]
    if clean in CANONICAL_CLEAN:
        return CANONICAL_CLEAN[clean]

    # Handle chiller headers (e.g. 'c1 status', 'chiller 1 status', 'c1 evap in', 'C1 Status')
    m_chiller = re.match(r'^(?:c|chiller)\s*(\d+)\s*(?:_|\s|-)*(.*)$', low)
    if m_chiller:
        ch_num = m_chiller.group(1)
        suffix = re.sub(r'[^a-z0-9]', '', m_chiller.group(2))
        if suffix in CHILLER_METRIC_MAP:
            metric = CHILLER_METRIC_MAP[suffix]
            cand = f"c{ch_num}_{metric}"
            if cand in CANONICAL_EXACT:
                return CANONICAL_EXACT[cand]
        cand = f"c{ch_num}{suffix}"
        if cand in CANONICAL_CLEAN:
            return CANONICAL_CLEAN[cand]

    # Handle pump headers (e.g. 'pri pump 1 a', 'primary pump 1 a', 'sec pump 2 v')
    m_pump = re.match(r'^(pri|sec|con|primary|secondary|condenser)\s*(?:pump)?\s*([a-z0-9]+)\s*(?:_|\s|-)*([av])$', low)
    if m_pump:
        p_type = m_pump.group(1)
        if p_type == 'primary':
            p_type = 'pri'
        elif p_type == 'secondary':
            p_type = 'sec'
        elif p_type == 'condenser':
            p_type = 'con'
        p_num = m_pump.group(2)
        p_metric = m_pump.group(3)
        cand = f"{p_type}{p_num}_{p_metric}"
        if cand in CANONICAL_EXACT:
            return CANONICAL_EXACT[cand]

    # Handle pump headers without 'pump' word (e.g. 'Pri Pump 1 A' -> 'pri1_a')
    clean_no_pump = clean.replace('pump', '')
    if clean_no_pump in CANONICAL_CLEAN:
        return CANONICAL_CLEAN[clean_no_pump]

    return raw_str


def is_iitgn_matrix_sheet(lines_or_rows):
    """
    Detects whether the uploaded file is in the IIT Gandhinagar HVAC Plant Daily Log Sheet
    Matrix format (24 time slots as columns, parameters as rows, stacked daily sheets).
    Supports both CSV and Excel (.xlsx/.xls) representations.
    """
    for l in lines_or_rows[:25]:
        if isinstance(l, (list, tuple)):
            for cell in l:
                if isinstance(cell, (datetime, date)):
                    return True
            row_str = " ".join([str(c) for c in l if c is not None]).lower()
        else:
            row_str = str(l).lower()

        if "daily log sheet for hvac plant" in row_str or "iit gandhinagar" in row_str:
            return True
        if "chiller number :" in row_str:
            return True
        if "date" in row_str and re.search(r'\d{1,4}[-/]\d{1,2}[-/]\d{2,4}', row_str):
            return True
    return False


def parse_iitgn_matrix_sheet(lines_or_rows):
    """
    Parses the IIT Gandhinagar HVAC Plant Daily Log Sheet Matrix format.
    In this format, each daily sheet has 24 hourly time slots (07:30 to 06:30) as columns
    and equipment parameters as rows. Multiple days are stacked vertically.
    Works seamlessly on both CSV and Excel (.xlsx / .xls) files.
    """
    normalized_rows = []
    for item in lines_or_rows:
        if isinstance(item, (list, tuple)):
            normalized_rows.append(list(item))
        else:
            normalized_rows.append([p.strip() for p in str(item).split(",")])

    daily_blocks = []
    current_block = []

    def is_date_row(row):
        for cell in row:
            if isinstance(cell, (datetime, date)):
                return True
        s = " ".join([str(c) for c in row if c is not None]).lower()
        if "date" in s and re.search(r'\d{1,4}[-/]\d{1,2}[-/]\d{2,4}', s):
            return True
        return False

    for row in normalized_rows:
        if is_date_row(row):
            if current_block:
                daily_blocks.append(current_block)
                current_block = []
        current_block.append(row)
    if current_block:
        daily_blocks.append(current_block)

    def clean_matrix_val(v):
        if v is None:
            return None
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            return round(float(v), 2)
        s = str(v).strip()
        if s in ("", "-", "--", "NA", "N/A", "nil", "null"):
            return None
        try:
            return round(float(s), 2)
        except ValueError:
            return s[:30]

    def extract_block_date(row):
        for cell in row:
            if isinstance(cell, (datetime, date)):
                return parse_hvac_date(cell)
        for cell in row:
            if cell is not None and str(cell).strip():
                cs = str(cell).strip()
                d = parse_hvac_date(cs)
                if d:
                    return d
                m = re.search(r'(\d{1,4}[-/]\d{1,2}[-/]\d{2,4})', cs)
                if m:
                    d = parse_hvac_date(m.group(1))
                    if d:
                        return d
        return None

    all_rows = []
    for block in daily_blocks:
        date_str = None
        setpoint_val = None
        for r in block[:8]:
            if not date_str:
                date_str = extract_block_date(r)
            r_str = " ".join([str(c) for c in r if c is not None])
            m_sp = re.search(r'set\s*point\s*:\s*([0-9.]+)', r_str, re.IGNORECASE)
            if m_sp and setpoint_val is None:
                try:
                    setpoint_val = float(m_sp.group(1))
                except Exception:
                    pass

        if not date_str:
            continue

        day_dict = {
            s: {
                'date': date_str,
                'time': TIME_SLOTS[s],
                'slot': s,
                'shift': str((s // 8) + 1),
                'setpoint': setpoint_val,
                'operator': '',
            }
            for s in range(24)
        }

        current_chiller_nums = [None] * 24
        current_parent_label = ""

        for r in block:
            if len(r) < 3:
                continue

            c0 = r[0] if len(r) > 0 and r[0] is not None else ""
            c1 = r[1] if len(r) > 1 and r[1] is not None else ""
            label1 = str(c0).strip()
            label2 = str(c1).strip()
            if label1:
                current_parent_label = label1
            combined = f"{current_parent_label} {label2}".strip().lower()

            if "chiller number" in label1.lower():
                for s in range(24):
                    cv = r[s + 2] if len(r) > s + 2 else ""
                    cv_clean = str(cv).strip() if cv is not None else ""
                    if cv_clean.isdigit():
                        current_chiller_nums[s] = int(cv_clean)
                    elif cv_clean.lower() in ("off", "-", "--"):
                        current_chiller_nums[s] = None
                continue

            if "operator" in combined:
                for s in range(24):
                    cv = r[s + 2] if len(r) > s + 2 else ""
                    if cv is not None and str(cv).strip() not in ("", "-", "--"):
                        day_dict[s]['operator'] = str(cv).strip()[:50]
                continue

            # Chiller metrics
            ch_metric = None
            if "entering water temp" in combined and "evap" in combined:
                ch_metric = "evapIn"
            elif "leaving water temp" in combined and "evap" in combined:
                ch_metric = "evapOut"
            elif ("right pressure" in combined or "evap" in combined) and "kpa" in combined and "cond" not in combined:
                ch_metric = "evapP"
            elif "entering water temp" in combined and "cond" in combined:
                ch_metric = "condIn"
            elif "leaving water temp" in combined and "cond" in combined:
                ch_metric = "condOut"
            elif "cond" in combined and "kpa" in combined:
                ch_metric = "condP"
            elif "dift pressure" in combined or "drift" in combined:
                ch_metric = "drift"
            elif "oil pressure" in combined:
                ch_metric = "oilP"
            elif "oil loss" in combined or "oil level" in combined:
                ch_metric = "oilL"
            elif "rla" in combined:
                ch_metric = "rla"
            elif "current l1" in combined:
                ch_metric = "l1"
            elif "current l2" in combined:
                ch_metric = "l2"
            elif "current l3" in combined:
                ch_metric = "l3"
            elif "voltage ab" in combined:
                ch_metric = "v1"
            elif "voltage bc" in combined:
                ch_metric = "v2"
            elif "voltage ca" in combined:
                ch_metric = "v3"

            if ch_metric:
                for s in range(24):
                    ch_num = current_chiller_nums[s]
                    if ch_num and 1 <= ch_num <= 7:
                        v = clean_matrix_val(r[s + 2] if len(r) > s + 2 else "")
                        if v is not None:
                            day_dict[s][f'c{ch_num}_{ch_metric}'] = v
                            day_dict[s][f'c{ch_num}_st'] = 'on'
                continue

            # Pump metrics
            m_pump = re.search(r'(primary|secondary|condenssor|condenser)\s*pump\s*([0-9a-zA-Z()]+)', combined)
            if m_pump:
                pt = m_pump.group(1).lower()
                pn = m_pump.group(2).upper().replace(" ", "")
                pt_code = "con" if "cond" in pt else ("sec" if "sec" in pt else "pri")
                clean_n = re.sub(r'[^0-9]', '', pn)
                p_key = f"{pt_code}NA{clean_n}" if "NA" in pn else f"{pt_code}{clean_n}"
                is_a = "amp" in combined
                is_v = "votage" in combined or "voltage" in combined
                if is_a or is_v:
                    metric = "a" if is_a else "v"
                    for s in range(24):
                        v = clean_matrix_val(r[s + 2] if len(r) > s + 2 else "")
                        if v is not None:
                            day_dict[s][f'{p_key}_{metric}'] = v
                continue

            # Cooling tower metrics
            m_ct = re.search(r'cooling\s*tower\s*([0-9a-zA-Z() ]+)', combined)
            if m_ct:
                ct_desc = m_ct.group(1).upper()
                is_new = "NEW" in ct_desc
                ct_num = re.search(r'\d+', ct_desc)
                if ct_num:
                    n = ct_num.group(0)
                    fan_m = re.search(r'fan\s*(\d+)', combined)
                    f_num = fan_m.group(1) if fan_m else "1"
                    ct_key = f"ctn{n}_f{f_num}" if is_new else f"ct{n}_f{f_num}"
                    for s in range(24):
                        v = clean_matrix_val(r[s + 2] if len(r) > s + 2 else "")
                        if v is not None:
                            day_dict[s][ct_key] = v
                continue

            # Panels
            if "hvac panel" in combined and "mwh" in combined:
                m_pn = re.search(r'panel\s*(\d+)', combined)
                if m_pn:
                    pnn = m_pn.group(1)
                    for s in range(24):
                        v = clean_matrix_val(r[s + 2] if len(r) > s + 2 else "")
                        if v is not None:
                            day_dict[s][f'pn{pnn}_mwh'] = v
                continue

            # Water Meters
            if "water meter" in combined:
                wm_k = "wm_chilled_kl" if ("chiled" in combined or "chilled" in combined) else ("wm1_kl" if ("1" in combined or "old" in combined) else ("wm2_kl" if ("2" in combined or "new" in combined) else "wm3_kl"))
                for s in range(24):
                    v = clean_matrix_val(r[s + 2] if len(r) > s + 2 else "")
                    if v is not None:
                        day_dict[s][wm_k] = v
                continue

        # Keep all 24 hourly slots for the day (matched fields populated, unmatched left blank)
        for s in range(24):
            all_rows.append(day_dict[s])

    return all_rows


def extract_rows_from_upload(uploaded_file):
    """
    Extracts row dictionaries from uploaded CSV or Excel (.xlsx / .xls) files.
    Automatically detects and parses both:
    1. Standard columnar tables (one row per reading).
    2. Official IITGN Campus HVAC Daily Log Sheet Matrix exports (24 hourly columns across, multi-day stacked sheets).
    """
    filename = (uploaded_file.name or '').lower()
    raw_bytes = uploaded_file.read()

    if filename.endswith('.xlsx') or filename.endswith('.xls'):
        # 1. Try reading with openpyxl (.xlsx, .xlsm, or modern Excel files)
        try:
            wb = openpyxl.load_workbook(io.BytesIO(raw_bytes), data_only=True)
            parsed_rows = []
            for sheet in wb.worksheets:
                sheet_rows = list(sheet.iter_rows(values_only=True))
                if not sheet_rows:
                    continue
                while sheet_rows and not any(c is not None and str(c).strip() != '' for c in sheet_rows[-1]):
                    sheet_rows.pop()
                if not sheet_rows:
                    continue

                if is_iitgn_matrix_sheet(sheet_rows):
                    parsed_rows.extend(parse_iitgn_matrix_sheet(sheet_rows))
                else:
                    header_row_idx = 0
                    while header_row_idx < len(sheet_rows) and not any(h is not None and str(h).strip() for h in sheet_rows[header_row_idx]):
                        header_row_idx += 1
                    if header_row_idx >= len(sheet_rows):
                        continue
                    headers = [str(h).strip() if h is not None else f"col_{i}" for i, h in enumerate(sheet_rows[header_row_idx])]
                    for row in sheet_rows[header_row_idx + 1:]:
                        if not any(v is not None and str(v).strip() != '' for v in row):
                            continue
                        row_dict = {headers[col_idx]: val for col_idx, val in enumerate(row) if col_idx < len(headers)}
                        parsed_rows.append(row_dict)
            return parsed_rows
        except Exception as openpyxl_err:
            # 2. Fallback to xlrd for legacy binary .xls files
            try:
                import xlrd
                wb_xls = xlrd.open_workbook(file_contents=raw_bytes)
                parsed_rows = []
                for s_idx in range(wb_xls.nsheets):
                    sheet = wb_xls.sheet_by_index(s_idx)
                    sheet_rows = []
                    for r_idx in range(sheet.nrows):
                        row_vals = []
                        for c_idx in range(sheet.ncols):
                            cell = sheet.cell(r_idx, c_idx)
                            if cell.ctype == xlrd.XL_CELL_DATE:
                                try:
                                    row_vals.append(xlrd.xldate_as_datetime(cell.value, wb_xls.datemode))
                                except Exception:
                                    row_vals.append(cell.value)
                            elif cell.ctype == xlrd.XL_CELL_EMPTY:
                                row_vals.append(None)
                            else:
                                row_vals.append(cell.value)
                        sheet_rows.append(row_vals)
                    if not sheet_rows:
                        continue
                    if is_iitgn_matrix_sheet(sheet_rows):
                        parsed_rows.extend(parse_iitgn_matrix_sheet(sheet_rows))
                    else:
                        header_row_idx = 0
                        while header_row_idx < len(sheet_rows) and not any(h is not None and str(h).strip() for h in sheet_rows[header_row_idx]):
                            header_row_idx += 1
                        if header_row_idx >= len(sheet_rows):
                            continue
                        headers = [str(h).strip() if h is not None else f"col_{i}" for i, h in enumerate(sheet_rows[header_row_idx])]
                        for row in sheet_rows[header_row_idx + 1:]:
                            if not any(v is not None and str(v).strip() != '' for v in row):
                                continue
                            row_dict = {headers[col_idx]: val for col_idx, val in enumerate(row) if col_idx < len(headers)}
                            parsed_rows.append(row_dict)
                return parsed_rows
            except Exception as xls_err:
                raise ValueError(f"Failed to parse Excel file: {openpyxl_err}; xlrd fallback failed: {xls_err}")
    else:
        # Standard CSV or CSV Matrix log sheet
        try:
            text_content = raw_bytes.decode('utf-8-sig')
        except UnicodeDecodeError:
            text_content = raw_bytes.decode('latin-1')

        lines = [line.strip() for line in text_content.splitlines() if line.strip()]
        if not lines:
            return []

        # Check if this CSV is an IITGN Matrix Log Sheet
        if is_iitgn_matrix_sheet(lines):
            return parse_iitgn_matrix_sheet(lines)

        reader = csv.DictReader(io.StringIO(text_content))
        rows = []
        for row in reader:
            if any(str(v or '').strip() for v in row.values()):
                rows.append(row)
        return rows


class HvacImportCsvView(APIView):
    """
    Allows HVAC Engineers exclusively to bulk import historical hourly telemetry
    data from CSV or Excel (.xlsx/.xls) files.
    Supports dry-run validation (preview=true), batch tracking with atomic database ingestion,
    and snapshotting for complete 1-click Undo/Rollback capability.
    """
    permission_classes = [IsHvacEngineerOnly]

    def post(self, request):
        preview = str(request.data.get('preview', '')).lower() in ('1', 'true', 'yes')

        # 1. Obtain row dictionaries from file upload or JSON payload
        rows = []
        uploaded_file = request.FILES.get('file')
        filename = uploaded_file.name if uploaded_file else 'manual_json_upload'

        if uploaded_file:
            try:
                rows = extract_rows_from_upload(uploaded_file)
            except Exception as e:
                return Response({'error': f'Failed to parse uploaded file: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)
        elif isinstance(request.data.get('rows'), list):
            rows = request.data.get('rows')
        else:
            return Response({'error': 'No CSV/Excel file or data rows provided for import.'}, status=status.HTTP_400_BAD_REQUEST)

        if not rows:
            return Response({'error': 'The uploaded file contains no data rows.'}, status=status.HTTP_400_BAD_REQUEST)

        # 2. Validate and process each row
        valid_logs = []
        dates_seen = set()
        errors = []
        log_ids_seen = set()

        for idx, row in enumerate(rows, start=1):
            if not isinstance(row, dict):
                errors.append(f"Row {idx}: Invalid row structure (expected key-value mapping)")
                continue

            # Header-normalized dictionary
            clean_row = {}
            raw_field_map = {}
            for k, v in row.items():
                if k is not None:
                    norm_k = normalize_hvac_header(k)
                    clean_row[norm_k] = v
                    raw_field_map[norm_k] = k

            # Extract date
            date_raw = clean_row.get('date') or clean_row.get('reading_date')
            parsed_date = parse_hvac_date(date_raw)
            if not parsed_date:
                errors.append(f"Row {idx}: Missing or invalid date '{date_raw}'. Supported formats: YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, or native Excel date.")
                continue

            # Extract time
            time_raw = clean_row.get('time') or clean_row.get('reading_time')
            parsed_time = parse_hvac_time(time_raw)
            if not parsed_time:
                # If slot is provided, try deducing time from slot
                slot_raw = clean_row.get('slot')
                if slot_raw is not None and str(slot_raw).isdigit() and 0 <= int(slot_raw) <= 23:
                    parsed_time = TIME_SLOTS[int(slot_raw)]
                else:
                    errors.append(f"Row {idx} ({parsed_date}): Missing or invalid time '{time_raw}'. Supported formats: HH:MM (e.g. 08:30, 8:30 AM), or native Excel time.")
                    continue

            # Compute slot
            slot_raw = clean_row.get('slot')
            if slot_raw is not None and str(slot_raw).isdigit() and 0 <= int(slot_raw) <= 23:
                slot_num = int(slot_raw)
            else:
                try:
                    slot_num = TIME_SLOTS.index(parsed_time)
                except ValueError:
                    try:
                        h, m = map(int, parsed_time.split(':'))
                        slot_num = round(((h * 60 + m) - 450) / 60) % 24
                    except Exception:
                        slot_num = 0

            # Compute shift: 0-7 is Shift 1, 8-15 is Shift 2, 16-23 is Shift 3
            shift_raw = str(clean_row.get('shift', '')).strip()
            if shift_raw in ('1', '2', '3'):
                shift_val = shift_raw
            else:
                shift_val = str((slot_num // 8) + 1)

            # Operator & Setpoint
            operator_val = clean_row.get('operator') or getattr(request.user, 'username', 'Historical Import')
            if operator_val is not None:
                operator_val = str(operator_val).strip()[:100]

            setpoint_raw = clean_row.get('setpoint')
            setpoint_val = None
            if setpoint_raw not in (None, ''):
                try:
                    setpoint_val = round(float(setpoint_raw), 2)
                except (ValueError, TypeError):
                    pass

            # Extract telemetry readings into values JSON dictionary
            cleaned_v = {}
            reserved_keys = {
                'date', 'reading_date', 'time', 'reading_time', 'slot', 'shift',
                'operator', 'operator_name', 'setpoint', 'id', '_id', 'ts',
                'createdat', 'updatedat', 'alerts', 'v'
            }

            for norm_k, raw_val in clean_row.items():
                if norm_k in reserved_keys:
                    continue
                if not re.match(r'^[a-zA-Z0-9_]+$', norm_k):
                    continue
                if raw_val is None or str(raw_val).strip() == '':
                    continue

                if isinstance(raw_val, bool):
                    cleaned_v[norm_k] = 'on' if raw_val else 'off'
                elif isinstance(raw_val, (int, float)):
                    cleaned_v[norm_k] = round(float(raw_val), 2)
                else:
                    val_str = str(raw_val).strip()
                    try:
                        num_val = float(val_str)
                        cleaned_v[norm_k] = round(num_val, 2)
                    except ValueError:
                        cleaned_v[norm_k] = val_str[:30]

            # Unmatched or empty parameters remain blank (not present in cleaned_v)

            # Build unique log ID: YYYY-MM-DD_HHMM
            clean_time = parsed_time.replace(':', '')
            log_id = f"{parsed_date}_{clean_time}"

            log_obj = HvacLog(
                id=log_id,
                date=parsed_date,
                time=parsed_time,
                slot=slot_num,
                shift=shift_val,
                operator=operator_val,
                setpoint=setpoint_val,
                values=cleaned_v,
                ts=int(timezone.now().timestamp() * 1000)
            )

            # Avoid duplicates within the same import payload
            if log_id not in log_ids_seen:
                valid_logs.append(log_obj)
                log_ids_seen.add(log_id)
                dates_seen.add(parsed_date)

        # 3. Handle preview dry-run response
        sorted_dates = sorted(list(dates_seen))
        if preview:
            return Response({
                'ok': True,
                'preview': True,
                'total_rows': len(rows),
                'valid_rows': len(valid_logs),
                'invalid_rows': len(errors),
                'date_min': sorted_dates[0] if sorted_dates else None,
                'date_max': sorted_dates[-1] if sorted_dates else None,
                'unique_dates': len(sorted_dates),
                'sample_logs': [l.to_dict() for l in valid_logs[:3]],
                'errors': errors[:50],
                'has_more_errors': len(errors) > 50,
            })

        # 4. Handle actual import execution with batch tracking and snapshotting for Undo
        if not valid_logs:
            return Response({
                'error': 'No valid HVAC records could be imported from the file.',
                'errors': errors[:30]
            }, status=status.HTTP_400_BAD_REQUEST)

        batch_id = f"batch_{timezone.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
        target_ids = [l.id for l in valid_logs]

        try:
            with transaction.atomic():
                # Snapshot existing logs before they get overwritten
                existing_logs = {log.id: log for log in HvacLog.objects.filter(id__in=target_ids)}
                created_ids = [lid for lid in target_ids if lid not in existing_logs]
                previous_states = {}
                for lid, el in existing_logs.items():
                    previous_states[lid] = {
                        'date': el.date.isoformat() if hasattr(el.date, 'isoformat') else str(el.date),
                        'time': el.time,
                        'slot': el.slot,
                        'shift': el.shift,
                        'operator': el.operator,
                        'setpoint': el.setpoint,
                        'values': el.values,
                        'ts': el.ts,
                    }

                # Bulk upsert records
                HvacLog.objects.bulk_create(
                    valid_logs,
                    batch_size=500,
                    update_conflicts=True,
                    update_fields=['date', 'time', 'slot', 'shift', 'operator', 'setpoint', 'values', 'ts'],
                    unique_fields=['id']
                )

                # Record import batch for Undo capability
                import_batch = HvacImportBatch.objects.create(
                    batch_id=batch_id,
                    filename=filename,
                    imported_by=getattr(request.user, 'username', 'hvac_engineer'),
                    total_records=len(valid_logs),
                    created_count=len(created_ids),
                    updated_count=len(previous_states),
                    date_min=sorted_dates[0] if sorted_dates else None,
                    date_max=sorted_dates[-1] if sorted_dates else None,
                    created_ids=created_ids,
                    previous_states=previous_states,
                    status='active',
                )

            return Response({
                'ok': True,
                'preview': False,
                'batch_id': batch_id,
                'filename': filename,
                'imported_count': len(valid_logs),
                'created_count': len(created_ids),
                'updated_count': len(previous_states),
                'date_min': sorted_dates[0] if sorted_dates else None,
                'date_max': sorted_dates[-1] if sorted_dates else None,
                'unique_dates': len(sorted_dates),
                'errors_skipped': len(errors),
                'can_undo': True,
                'message': f"Successfully imported {len(valid_logs)} HVAC plant hourly logs ({len(created_ids)} new, {len(previous_states)} updated) from {sorted_dates[0]} to {sorted_dates[-1]}."
            })
        except Exception as e:
            return Response({'error': f'Failed to write imported logs to database: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class HvacImportUndoView(APIView):
    """
    Rolls back an HVAC data import batch:
    - Permanently deletes all records that were newly created in the batch.
    - Restores any pre-existing records that were overwritten back to their exact previous state.
    - Marks the batch as 'reverted'.
    Accessible exclusively to the HVAC Engineer.
    """
    permission_classes = [IsHvacEngineerOnly]

    def post(self, request):
        batch_id = request.data.get('batch_id')
        if batch_id:
            try:
                batch = HvacImportBatch.objects.get(batch_id=batch_id)
            except HvacImportBatch.DoesNotExist:
                return Response({'error': f"Import batch '{batch_id}' was not found."}, status=status.HTTP_404_NOT_FOUND)
        else:
            # Default to most recent active batch
            batch = HvacImportBatch.objects.filter(status='active').order_by('-created_at').first()
            if not batch:
                return Response({'error': 'No active import batch found to undo.'}, status=status.HTTP_404_NOT_FOUND)

        if batch.status == 'reverted':
            return Response({'error': f"Import batch '{batch.batch_id}' has already been undone/reverted."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                deleted_count = 0
                if batch.created_ids:
                    deleted_count, _ = HvacLog.objects.filter(id__in=batch.created_ids).delete()

                restored_count = 0
                if batch.previous_states:
                    for lid, prev in batch.previous_states.items():
                        HvacLog.objects.update_or_create(
                            id=lid,
                            defaults={
                                'date': prev.get('date'),
                                'time': prev.get('time'),
                                'slot': prev.get('slot', 0),
                                'shift': prev.get('shift', '1'),
                                'operator': prev.get('operator', ''),
                                'setpoint': prev.get('setpoint'),
                                'values': prev.get('values', {}),
                                'ts': prev.get('ts', int(timezone.now().timestamp() * 1000)),
                            }
                        )
                        restored_count += 1

                batch.status = 'reverted'
                batch.reverted_at = timezone.now()
                batch.reverted_by = getattr(request.user, 'username', 'hvac_engineer')
                batch.save(update_fields=['status', 'reverted_at', 'reverted_by'])

            return Response({
                'ok': True,
                'batch_id': batch.batch_id,
                'filename': batch.filename,
                'deleted_created_records': deleted_count,
                'restored_previous_records': restored_count,
                'message': f"Successfully reverted import batch '{batch.batch_id}'. Deleted {deleted_count} created records and restored {restored_count} previously overwritten records."
            })
        except Exception as e:
            return Response({'error': f"Failed to undo import batch: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class HvacImportHistoryView(APIView):
    """
    Returns recent import batches and their rollback status.
    Accessible exclusively to the HVAC Engineer.
    """
    permission_classes = [IsHvacEngineerOnly]

    def get(self, request):
        batches = HvacImportBatch.objects.order_by('-created_at')[:30]
        return Response({
            'ok': True,
            'batches': [b.to_dict() for b in batches]
        })


class HvacImportTemplateView(APIView):
    """
    Downloads a standardized, ready-to-fill CSV or Excel (.xlsx) template for HVAC telemetry data
    with chiller, pump, cooling tower, and panel meter column headers.
    Accessible exclusively to the HVAC Engineer.
    """
    permission_classes = [IsHvacEngineerOnly]

    def perform_content_negotiation(self, request, force=False):
        # Prevent DRF from failing content negotiation on ?format=xlsx or ?format=csv
        return (None, None)

    def get(self, request):
        fmt = str(request.query_params.get('format', 'xlsx')).lower()

        # 2 realistic sample rows
        sample_row_1 = [
            '2026-08-01', '07:30', 0, 1, 'Ramesh Varma', 7.0,
            # c1
            'on', 11.5, 7.2, 340, 29.5, 33.0, 720, 25, 180, 'wet', 68.5, 19.2, 19.1, 19.3, 410, 412, 410,
            # c2..c4 (off)
            'off', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
            'off', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
            'off', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
            # c5 (Carrier 5 - on)
            'on', 11.8, 7.1, 355, 30.2, 33.8, 740, 28, 195, 'wet', 72.0, 24.1, 23.9, 24.2, 415, 415, 414,
            # c6..c7 (off)
            'off', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
            'off', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
            # primary pumps (pri1 on)
            20.5, 405, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
            # secondary pumps (sec1 on)
            48.5, 408, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
            # condenser pumps (con1 on)
            31.2, 412, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
            # cooling towers (ct1 active)
            1, 1, '', '', '', '', '', '', '', '', '', '', '', '', '', '',
            # panel MWh & water meters
            8450.2, 6980.5, 18200.0, 11100.0, 6100.0, 6100.0
        ]

        sample_row_2 = [
            '2026-08-01', '08:30', 1, 1, 'Ramesh Varma', 7.0,
            # c1
            'on', 11.8, 7.1, 342, 29.8, 33.2, 725, 26, 182, 'wet', 70.0, 19.5, 19.3, 19.4, 410, 411, 410,
            # c2..c4
            'off', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
            'off', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
            'off', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
            # c5
            'on', 12.0, 7.2, 358, 30.4, 34.0, 745, 29, 198, 'wet', 74.5, 24.4, 24.2, 24.5, 414, 415, 414,
            # c6..c7
            'off', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
            'off', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
            # primary pumps
            20.6, 406, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
            # secondary pumps
            48.8, 409, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
            # condenser pumps
            31.5, 412, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
            # cooling towers
            1, 1, '', '', '', '', '', '', '', '', '', '', '', '', '', '',
            # panel MWh & water meters
            8454.1, 6985.4, 18208.8, 11103.4, 6101.9, 6101.9
        ]

        if fmt == 'csv':
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(HVAC_CSV_TEMPLATE_HEADERS)
            writer.writerow(sample_row_1)
            writer.writerow(sample_row_2)

            csv_text = output.getvalue()
            response = HttpResponse(csv_text, content_type='text/csv; charset=utf-8')
            response['Content-Disposition'] = 'attachment; filename="hvac_plant_log_template.csv"'
            return response

        # Default to Excel .xlsx template
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "HVAC Telemetry Log"

        # Styling
        header_fill = PatternFill(start_color="0F766E", end_color="0F766E", fill_type="solid")
        header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
        header_align = Alignment(horizontal="center", vertical="center", wrap_text=False)
        data_align = Alignment(horizontal="center", vertical="center")
        thin_border = Border(
            left=Side(style='thin', color="CBD5E1"),
            right=Side(style='thin', color="CBD5E1"),
            top=Side(style='thin', color="CBD5E1"),
            bottom=Side(style='thin', color="CBD5E1"),
        )

        # Write header row
        ws.append(HVAC_CSV_TEMPLATE_HEADERS)
        for col_idx in range(1, len(HVAC_CSV_TEMPLATE_HEADERS) + 1):
            cell = ws.cell(row=1, column=col_idx)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = header_align
            cell.border = thin_border

        # Write sample rows
        ws.append(sample_row_1)
        ws.append(sample_row_2)

        for row_idx in (2, 3):
            for col_idx in range(1, len(HVAC_CSV_TEMPLATE_HEADERS) + 1):
                cell = ws.cell(row=row_idx, column=col_idx)
                cell.alignment = data_align
                cell.border = thin_border

        # Auto-fit column widths
        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 3, 10)

        # Freeze header row
        ws.freeze_panes = "A2"

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)

        response = HttpResponse(
            buf.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = 'attachment; filename="hvac_plant_telemetry_template.xlsx"'
        return response



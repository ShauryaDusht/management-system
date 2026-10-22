import re
from datetime import datetime, date
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import HvacLog, HvacSupervisorLog, CHILLERS, derive_values, check_alerts


TIME_SLOTS = [
    f"{str((450 + 60 * i) // 60 % 24).zfill(2)}:30"
    for i in range(24)
]


def is_hvac_authorized(request):
    # Allow if standard authenticated user (JWT or session)
    if request.user and request.user.is_authenticated:
        return True
    if hasattr(request, 'session') and request.session.get('_auth_user_id'):
        return True
    # Or allow if x-admin-key matches admin key or 'admin123'
    key = request.headers.get('x-admin-key') or request.META.get('HTTP_X_ADMIN_KEY') or request.GET.get('key')
    if key in ['admin123', 'IITGN@2025', 'engineer123']:
        return True
    return False


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
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        if is_hvac_authorized(request):
            return Response({'ok': True})
        return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)


class HvacLogsListView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        if not is_hvac_authorized(request):
            return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

        latest = request.query_params.get('latest')
        if latest in ['1', 'true', 'True']:
            log = HvacLog.objects.order_by('-date', '-slot').first()
            return Response([log.to_dict()] if log else [])

        date_param = request.query_params.get('date')
        month_param = request.query_params.get('month')
        op = request.query_params.get('op', '==')
        shift = request.query_params.get('shift')

        qs = HvacLog.objects.all()

        from .demo_data import ensure_hvac_demo_data

        if date_param:
            # Handle YYYY-MM-DD or YYYY-MM
            if len(date_param) == 10:
                if op == '==':
                    ensure_hvac_demo_data(date_param)
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
        return self.save_log(request)

    def save_log(self, request):
        if not is_hvac_authorized(request):
            return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

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
    permission_classes = [permissions.AllowAny]

    def get(self, request, log_id):
        if not is_hvac_authorized(request):
            return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            log = HvacLog.objects.get(id=log_id)
            return Response(log.to_dict())
        except HvacLog.DoesNotExist:
            return Response({'error': 'Log not found'}, status=status.HTTP_404_NOT_FOUND)

    def put(self, request, log_id):
        if not is_hvac_authorized(request):
            return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)
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
        if not is_hvac_authorized(request):
            return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            log = HvacLog.objects.get(id=log_id)
            log.delete()
            return Response({'ok': True, 'message': 'Log deleted'})
        except HvacLog.DoesNotExist:
            return Response({'error': 'Log not found'}, status=status.HTTP_404_NOT_FOUND)


class HvacOverviewView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        if not is_hvac_authorized(request):
            return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

        date_str = request.query_params.get('date')
        if not date_str:
            date_str = date.today().isoformat()

        from .demo_data import ensure_hvac_demo_data
        ensure_hvac_demo_data(date_str)

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
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        if not is_hvac_authorized(request):
            return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)
        date_str = request.query_params.get('date') or date.today().isoformat()
        logs = HvacSupervisorLog.objects.filter(date=date_str)
        return Response([l.to_dict() for l in logs])

    def post(self, request):
        if not is_hvac_authorized(request):
            return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)
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
        return Response({'ok': True, 'log': log_obj.to_dict()})

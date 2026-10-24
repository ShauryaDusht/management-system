import hashlib
import json
from datetime import datetime, date

from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import SubstationSheet, SubstationReading, SubstationConfigDoc


class IsSubstationStaff(permissions.BasePermission):
    """
    Allows read and reading entry to Electrical Operators, Supervisors,
    Plant Engineers, and Admins.
    Blocks unrelated roles like caretakers, hostel office, etc.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        user = request.user
        if getattr(user, 'is_admin', False) or getattr(user, 'is_superuser', False) or getattr(user, 'is_plant_engineer', False):
            return True
        return getattr(user, 'role', '') in ('electrical_supervisor', 'electrical_operator')


class IsSubstationSupervisorOrAdmin(permissions.BasePermission):
    """
    Restricts sensitive configurations and administrative operations to
    Electrical Supervisors, Plant Engineers, and Admins.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        user = request.user
        if getattr(user, 'is_admin', False) or getattr(user, 'is_superuser', False) or getattr(user, 'is_plant_engineer', False):
            return True
        return getattr(user, 'role', '') == 'electrical_supervisor'


class SubstationHealthView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({'ok': True, 'module': 'substation_log', 'status': 'operational'})


class SubstationSheetsView(APIView):
    permission_classes = [IsSubstationStaff]

    def get(self, request):
        sheets = SubstationSheet.objects.filter(is_active=True).values(
            'id', 'name', 'section', 'full_title', 'mode', 'slots', 'tables', 'display_order'
        )
        return Response(list(sheets))


class SubstationQueryView(APIView):
    permission_classes = [IsSubstationStaff]

    def post(self, request):
        data = request.data or {}
        collection = data.get('collection', 'readings')
        where = data.get('where', [])
        order_by = data.get('orderBy')
        limit = max(1, min(1000, int(data.get('limit', 1000))))
        client_sig = data.get('sig')

        if collection in ('readings', 'readings_ht', 'readings_lt'):
            qs = SubstationReading.objects.all()
            if collection == 'readings_ht':
                qs = qs.filter(panel_type='HT')
            elif collection == 'readings_lt':
                qs = qs.filter(panel_type='LT')

            field_map = {
                'sheet': 'sheet',
                'date': 'date',
                'slot': 'slot',
                'panelType': 'panel_type',
                'section': 'section',
                'substation': 'substation',
            }

            for condition in where:
                if not isinstance(condition, (list, tuple)) or len(condition) != 3:
                    continue
                fld, op, val = condition
                db_field = field_map.get(fld)
                if not db_field:
                    continue

                if op == '==':
                    qs = qs.filter(**{db_field: val})
                elif op == '>=':
                    qs = qs.filter(**{f"{db_field}__gte": val})
                elif op == '<=':
                    qs = qs.filter(**{f"{db_field}__lte": val})
                elif op == '>':
                    qs = qs.filter(**{f"{db_field}__gt": val})
                elif op == '<':
                    qs = qs.filter(**{f"{db_field}__lt": val})

            if order_by and isinstance(order_by, (list, tuple)) and len(order_by) == 2:
                sort_fld, sort_dir = order_by
                sort_db = 'date' if sort_fld == 'date' else ('updated_at' if sort_fld == 'updatedAt' else 'date')
                prefix = '-' if sort_dir == 'desc' else ''
                qs = qs.order_by(f"{prefix}{sort_db}", 'doc_id')
            else:
                qs = qs.order_by('-date', 'sheet', 'slot')

            readings = list(qs[:limit])
            docs = []
            for r in readings:
                doc_data = r.to_doc()
                # Document id is extracted separately to match substation-log format: { id: _id, data: {...} }
                doc_id = doc_data.pop('_id', r.doc_id)
                docs.append({'id': doc_id, 'data': doc_data})

        elif collection == 'config':
            docs = []
            for cfg in SubstationConfigDoc.objects.all():
                docs.append({'id': cfg.key, 'data': cfg.data})
        else:
            return Response({'error': f"Unknown collection '{collection}'"}, status=status.HTTP_400_BAD_REQUEST)

        # Compute hash signature
        sig_str = json.dumps(docs, sort_keys=True, default=str)
        signature = hashlib.md5(sig_str.encode('utf-8')).hexdigest()

        if client_sig and client_sig == signature:
            return Response({'unchanged': True, 'sig': signature})

        return Response({'docs': docs, 'sig': signature})


class SubstationDocView(APIView):
    permission_classes = [IsSubstationStaff]

    def get(self, request, coll, doc_id):
        if coll in ('readings', 'readings_ht', 'readings_lt'):
            try:
                reading = SubstationReading.objects.get(doc_id=doc_id)
                data = reading.to_doc()
                data.pop('_id', None)
                return Response({'exists': True, 'data': data})
            except SubstationReading.DoesNotExist:
                return Response({'exists': False, 'data': None})

        elif coll == 'config':
            try:
                cfg = SubstationConfigDoc.objects.get(key=doc_id)
                return Response({'exists': True, 'data': cfg.data})
            except SubstationConfigDoc.DoesNotExist:
                return Response({'exists': False, 'data': None})

        return Response({'error': 'Unknown collection'}, status=status.HTTP_400_BAD_REQUEST)

    def put(self, request, coll, doc_id):
        body = request.data or {}
        if not isinstance(body, dict):
            return Response({'error': 'Invalid payload'}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        # Role check: Operators, Supervisors, and Admins can save readings
        # Only Supervisors and Admins can change configs
        if coll in ('readings', 'readings_ht', 'readings_lt'):
            sheet = body.get('sheet', '')
            date_val = body.get('date', '')
            slot = body.get('slot', '')
            panel_type = body.get('panelType') or ('HT' if ('_ht' in sheet or 'oldht' in sheet or 'newht' in sheet) else 'LT')
            section = body.get('section') or panel_type
            substation = body.get('substation', '')
            panel_name = body.get('panelName', '')
            time_val = body.get('time', '')
            operator_name = body.get('operator') or getattr(user, 'get_full_name', lambda: '')() or user.username
            rows = body.get('rows', {})
            filled = int(body.get('filled', 0))
            total = int(body.get('total', 0))

            try:
                parsed_date = datetime.strptime(date_val, '%Y-%m-%d').date() if isinstance(date_val, str) else date_val
            except (ValueError, TypeError):
                parsed_date = timezone.now().date()

            reading, _ = SubstationReading.objects.update_or_create(
                doc_id=doc_id,
                defaults={
                    'sheet': sheet,
                    'panel_type': panel_type,
                    'section': section,
                    'substation': substation,
                    'panel_name': panel_name,
                    'date': parsed_date,
                    'slot': slot,
                    'time': time_val,
                    'operator': operator_name,
                    'rows': rows,
                    'filled': filled,
                    'total': total,
                    'raw_data': body,
                    'updated_at': timezone.now(),
                }
            )
            return Response({'ok': True, 'id': reading.doc_id})

        elif coll == 'config':
            if not (getattr(user, 'is_admin', False) or getattr(user, 'is_superuser', False) or getattr(user, 'is_plant_engineer', False) or getattr(user, 'role', '') == 'electrical_supervisor'):
                return Response({'error': 'Only electrical supervisors and admins can edit configurations'}, status=status.HTTP_403_FORBIDDEN)
            cfg, _ = SubstationConfigDoc.objects.update_or_create(
                key=doc_id,
                defaults={
                    'data': body,
                    'updated_at': timezone.now(),
                }
            )
            return Response({'ok': True, 'key': cfg.key})

        return Response({'error': 'Unknown collection'}, status=status.HTTP_400_BAD_REQUEST)


class SubstationSummaryView(APIView):
    permission_classes = [IsSubstationStaff]

    def get(self, request):
        today = timezone.now().date()
        today_readings = SubstationReading.objects.filter(date=today)
        total_sheets = SubstationSheet.objects.filter(is_active=True).count() or 11

        slots = ['R1', 'R2', 'R3']
        slot_status = {}
        for s in slots:
            count = today_readings.filter(slot=s).count()
            slot_status[s] = {
                'submitted': count,
                'total_expected': total_sheets,
                'pct': round((count / total_sheets) * 100) if total_sheets else 0,
            }

        latest_reading = SubstationReading.objects.order_by('-updated_at').first()

        return Response({
            'today': str(today),
            'total_sheets': total_sheets,
            'today_total_logs': today_readings.count(),
            'slot_status': slot_status,
            'latest_entry': {
                'sheet': latest_reading.sheet if latest_reading else None,
                'substation': latest_reading.substation if latest_reading else None,
                'slot': latest_reading.slot if latest_reading else None,
                'operator': latest_reading.operator if latest_reading else None,
                'time': latest_reading.time if latest_reading else None,
                'updated_at': latest_reading.updated_at.isoformat() if latest_reading else None,
            } if latest_reading else None,
        })

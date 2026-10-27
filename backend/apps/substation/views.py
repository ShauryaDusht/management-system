import hashlib
import json
import re
from datetime import datetime, date, timedelta

from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import SubstationSheet, SubstationReading, SubstationConfigDoc, TorrentBill


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
            # Check 10-minute edit window for electrical operators updating an existing reading
            is_sup = (getattr(user, 'is_admin', False) or getattr(user, 'is_superuser', False) or getattr(user, 'is_plant_engineer', False) or getattr(user, 'role', '') == 'electrical_supervisor')
            existing = SubstationReading.objects.filter(doc_id=doc_id).first()
            if existing and existing.filled > 0 and not is_sup:
                if existing.created_at and (timezone.now() - existing.created_at) > timedelta(minutes=10):
                    return Response({'error': 'The 10-minute edit window has expired. Contact Shift Engineer for any revisions.'}, status=status.HTTP_403_FORBIDDEN)

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


class TorrentBillsView(APIView):
    """
    CRUD View for Torrent Power Monthly Bills and Substation Telemetry Reconciliation.
    Supervisors & Admins have full read/write/delete access.
    Staff members have read access.
    """
    def get_permissions(self):
        if self.request.method in ('PUT', 'POST', 'DELETE'):
            return [IsSubstationSupervisorOrAdmin()]
        return [IsSubstationStaff()]

    def get(self, request, month=None):
        if month:
            try:
                bill = TorrentBill.objects.get(month=month)
                return Response(bill.to_dict())
            except TorrentBill.DoesNotExist:
                return Response({'error': f"Torrent bill for month '{month}' not found"}, status=status.HTTP_404_NOT_FOUND)

        bills = TorrentBill.objects.all().order_by('-month')
        return Response([b.to_dict() for b in bills])

    def put(self, request, month=None):
        data = request.data or {}
        m = month or data.get('month')
        if not m or not re.match(r'^\d{4}-\d{2}$', str(m)):
            return Response({'error': 'Month must be in YYYY-MM format (e.g. 2026-09)'}, status=status.HTTP_400_BAD_REQUEST)

        # Helper to parse float safely
        def safe_float(v, default=0.0):
            if v is None or v == '':
                return default
            try:
                return float(v)
            except (ValueError, TypeError):
                return default

        kw_present = safe_float(data.get('kwPresent'))
        kw_past = safe_float(data.get('kwPast'))
        kwh_present = safe_float(data.get('kwhPresent'))
        kwh_past = safe_float(data.get('kwhPast'))
        tou_kwh_present = safe_float(data.get('touKwhPresent'))
        tou_kwh_past = safe_float(data.get('touKwhPast'))
        kvah_present = safe_float(data.get('kvahPresent'))
        kvah_past = safe_float(data.get('kvahPast'))
        slrt_present = safe_float(data.get('slrtPresent'))
        slrt_past = safe_float(data.get('slrtPast'))
        multiplier = safe_float(data.get('multiplier'), 2500.0)

        total_bill_amount = safe_float(data.get('totalBillAmount'))
        net_energy_charges = safe_float(data.get('netEnergyCharges'))
        fppas_charges = safe_float(data.get('fppasCharges'))
        demand_charges = safe_float(data.get('demandCharges'))
        electricity_duty = safe_float(data.get('electricityDuty'))
        other_charges = safe_float(data.get('otherCharges'))

        security_deposit_held = safe_float(data.get('securityDepositHeld'), 15106279.0)
        additional_security_required = safe_float(data.get('additionalSecurityRequired'), 3172600.0)
        previous_payment_amount = safe_float(data.get('previousPaymentAmount'))
        previous_payment_date = str(data.get('previousPaymentDate', '')).strip()

        contract_demand_kw = safe_float(data.get('contractDemandKw'), 3200.0)
        billing_demand_kw = safe_float(data.get('billingDemandKw'), 0.0)
        avg_power_factor = safe_float(data.get('avgPowerFactor'), 100.0)
        internal_logged_kwh = safe_float(data.get('internalLoggedKwh'), 0.0)

        meter_no = str(data.get('meterNo', '6877522')).strip()
        bill_no = str(data.get('billNo', '')).strip()
        bill_date = str(data.get('billDate', '')).strip()
        reading_date = str(data.get('readingDate', '')).strip()
        due_date = str(data.get('dueDate', '')).strip()
        distribution_date = str(data.get('distributionDate', '')).strip()
        customer_id = str(data.get('customerId', '100164311')).strip()
        tariff = str(data.get('tariff', 'HTMD1')).strip()
        status_val = str(data.get('status', 'Pending')).strip()
        remarks = str(data.get('remarks', '')).strip()

        by_user = data.get('by') or (
            request.user.get_full_name() if hasattr(request.user, 'get_full_name') and request.user.get_full_name()
            else request.user.username
        )

        bill, _ = TorrentBill.objects.get_or_create(
            month=m,
            defaults={
                'bill_date': bill_date,
                'reading_date': reading_date,
                'due_date': due_date,
                'distribution_date': distribution_date,
                'bill_no': bill_no,
                'customer_id': customer_id,
                'tariff': tariff,
                'contract_demand_kw': contract_demand_kw,
                'billing_demand_kw': billing_demand_kw,
                'avg_power_factor': avg_power_factor,
                'meter_no': meter_no,
                'multiplier': multiplier,
                'kw_present': kw_present,
                'kw_past': kw_past,
                'kwh_present': kwh_present,
                'kwh_past': kwh_past,
                'tou_kwh_present': tou_kwh_present,
                'tou_kwh_past': tou_kwh_past,
                'kvah_present': kvah_present,
                'kvah_past': kvah_past,
                'slrt_present': slrt_present,
                'slrt_past': slrt_past,
                'total_bill_amount': total_bill_amount,
                'net_energy_charges': net_energy_charges,
                'fppas_charges': fppas_charges,
                'demand_charges': demand_charges,
                'electricity_duty': electricity_duty,
                'other_charges': other_charges,
                'security_deposit_held': security_deposit_held,
                'additional_security_required': additional_security_required,
                'previous_payment_amount': previous_payment_amount,
                'previous_payment_date': previous_payment_date,
                'internal_logged_kwh': internal_logged_kwh,
                'status': status_val,
                'remarks': remarks,
                'by': by_user,
            }
        )

        bill.bill_date = bill_date
        bill.reading_date = reading_date
        bill.due_date = due_date
        bill.distribution_date = distribution_date
        bill.bill_no = bill_no
        bill.customer_id = customer_id
        bill.tariff = tariff
        bill.contract_demand_kw = contract_demand_kw
        bill.meter_no = meter_no
        bill.multiplier = multiplier

        bill.kw_present = kw_present
        bill.kw_past = kw_past
        bill.kwh_present = kwh_present
        bill.kwh_past = kwh_past
        bill.tou_kwh_present = tou_kwh_present
        bill.tou_kwh_past = tou_kwh_past
        bill.kvah_present = kvah_present
        bill.kvah_past = kvah_past
        bill.slrt_present = slrt_present
        bill.slrt_past = slrt_past

        bill.total_bill_amount = total_bill_amount
        bill.net_energy_charges = net_energy_charges
        bill.fppas_charges = fppas_charges
        bill.demand_charges = demand_charges
        bill.electricity_duty = electricity_duty
        bill.other_charges = other_charges

        bill.security_deposit_held = security_deposit_held
        bill.additional_security_required = additional_security_required
        bill.previous_payment_amount = previous_payment_amount
        bill.previous_payment_date = previous_payment_date
        bill.internal_logged_kwh = internal_logged_kwh
        bill.status = status_val
        bill.remarks = remarks
        bill.by = by_user

        bill.save()
        return Response(bill.to_dict())

    def delete(self, request, month=None):
        if not month:
            return Response({'error': 'Month parameter is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            bill = TorrentBill.objects.get(month=month)
            bill.delete()
            return Response({'ok': True, 'message': f"Torrent bill for {month} deleted successfully"})
        except TorrentBill.DoesNotExist:
            return Response({'error': f"Torrent bill for {month} not found"}, status=status.HTTP_404_NOT_FOUND)

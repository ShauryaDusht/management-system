import re
from datetime import datetime, timedelta
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import StationMeter, WtpReading, BlockMeter, BlockReading, SupervisorLog, GwssbBill

STATION_IDS = ['wtp', 'stp', 'wsc3', 'jm']


def clean_reading_values(values):
    clean = {}
    if not isinstance(values, dict):
        return clean
    for k, val in values.items():
        if not re.match(r'^[a-z0-9_]+$', str(k), re.I):
            continue
        try:
            num = float(val)
            if not (num != num):  # not NaN
                clean[str(k)] = num
        except (ValueError, TypeError):
            continue
    return clean


class IsWtpStaff(permissions.BasePermission):
    """
    Allows read and reading entry access to WTP/STP operators, supervisors,
    plant engineers, and admins.
    Blocks unrelated roles like caretakers, hostel office, etc.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        user = request.user
        if getattr(user, 'is_admin', False) or getattr(user, 'is_superuser', False) or getattr(user, 'is_plant_engineer', False):
            return True
        return getattr(user, 'role', '') in ('wtp_supervisor', 'wtp_operator')


class IsWtpSupervisorOrAdmin(permissions.BasePermission):
    """
    Restricts destructive actions (DELETE), meter configurations, supervisor logs,
    reading verifications, and GWSSB utility billing to WTP Supervisors,
    Plant Engineers, and Admins.
    Operators and non-plant users are forbidden.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        user = request.user
        if getattr(user, 'is_admin', False) or getattr(user, 'is_superuser', False) or getattr(user, 'is_plant_engineer', False):
            return True
        return getattr(user, 'role', '') == 'wtp_supervisor'


class WtpHealthView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({'ok': True, 'module': 'wtp_stp_meter_app', 'status': 'operational'})


class StationReadingsView(APIView):
    permission_classes = [IsWtpStaff]

    def get(self, request):
        station = request.query_params.get('station')
        from_date = request.query_params.get('from')
        to_date = request.query_params.get('to')

        qs = WtpReading.objects.all()
        if station and station in STATION_IDS:
            qs = qs.filter(station=station)
        if from_date:
            qs = qs.filter(date__gte=from_date)
        if to_date:
            qs = qs.filter(date__lte=to_date)

        qs = qs.order_by('date', 'shift')
        docs = [r.to_dict() for r in qs]
        return Response(docs)

    def put(self, request):
        data = request.data or {}
        date_str = data.get('date')
        shift_val = data.get('shift')
        station = data.get('station')
        raw_values = data.get('values') or {}
        by_user = data.get('by') or (
            request.user.get_full_name() if hasattr(request.user, 'get_full_name') and request.user.get_full_name()
            else request.user.username
        )

        if not date_str or not re.match(r'^\d{4}-\d{2}-\d{2}$', str(date_str)):
            return Response({'error': 'A valid date (YYYY-MM-DD) is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            shift = int(shift_val)
            if shift not in [1, 2, 3]:
                raise ValueError()
        except (ValueError, TypeError):
            return Response({'error': 'Shift must be 1, 2 or 3'}, status=status.HTTP_400_BAD_REQUEST)

        if station not in STATION_IDS:
            return Response({'error': f"Unknown station '{station}'"}, status=status.HTTP_400_BAD_REQUEST)

        values = clean_reading_values(raw_values)
        if not values:
            return Response({'error': 'Enter at least one reading'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            parsed_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return Response({'error': 'Invalid date format'}, status=status.HTTP_400_BAD_REQUEST)

        # Upsert reading
        reading, created = WtpReading.objects.get_or_create(
            date=parsed_date,
            shift=shift,
            station=station,
            defaults={
                'values': values,
                'by': by_user,
                'status': 'pending',
            }
        )
        if not created:
            user = request.user
            is_sup = (getattr(user, 'is_admin', False) or getattr(user, 'is_superuser', False) or getattr(user, 'is_plant_engineer', False) or getattr(user, 'role', '') in ('wtp_supervisor', 'electrical_supervisor'))
            if not is_sup:
                if reading.created_at and (timezone.now() - reading.created_at) > timedelta(minutes=10):
                    return Response({'error': 'The 10-minute edit window has expired. Contact Shift Engineer for any revisions.'}, status=status.HTTP_403_FORBIDDEN)
            current_values = dict(reading.values or {})
            current_values.update(values)
            reading.values = current_values
            reading.by = by_user
            reading.save()

        return Response(reading.to_dict())


class StationReadingDetailView(APIView):
    permission_classes = [IsWtpSupervisorOrAdmin]

    def delete(self, request, pk):
        try:
            reading = WtpReading.objects.get(pk=pk)
            reading.delete()
            return Response({'ok': True})
        except WtpReading.DoesNotExist:
            return Response({'error': 'Reading not found'}, status=status.HTTP_404_NOT_FOUND)


class BlockMetersView(APIView):
    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsWtpSupervisorOrAdmin()]
        return [IsWtpStaff()]

    def get(self, request):
        meters = BlockMeter.objects.all().order_by('sr')
        return Response([m.to_dict() for m in meters])

    def post(self, request):
        data = request.data or {}
        block = (data.get('block') or '').strip()
        meter_no = (data.get('meterNo') or '').strip()
        sr = data.get('sr')

        if not block or not meter_no:
            return Response({'error': 'Block name and Meter number are required'}, status=status.HTTP_400_BAD_REQUEST)

        if not sr:
            max_meter = BlockMeter.objects.order_by('-sr').first()
            sr = (max_meter.sr + 1) if max_meter else 1
        else:
            try:
                sr = int(sr)
                if BlockMeter.objects.filter(sr=sr).exists():
                    return Response({'error': f"Meter with Sr #{sr} already exists"}, status=status.HTTP_400_BAD_REQUEST)
            except ValueError:
                return Response({'error': 'Sr must be an integer'}, status=status.HTTP_400_BAD_REQUEST)

        created = BlockMeter.objects.create(sr=sr, block=block, meter_no=meter_no)
        return Response(created.to_dict())


class BlockMeterDetailView(APIView):
    permission_classes = [IsWtpSupervisorOrAdmin]

    def delete(self, request, sr):
        try:
            meter = BlockMeter.objects.get(sr=int(sr))
            meter.delete()
            return Response({'ok': True})
        except (BlockMeter.DoesNotExist, ValueError):
            return Response({'error': 'Meter not found'}, status=status.HTTP_404_NOT_FOUND)


class BlockReadingsView(APIView):
    def get_permissions(self):
        if self.request.method == 'DELETE':
            return [IsWtpSupervisorOrAdmin()]
        return [IsWtpStaff()]

    def get(self, request):
        docs = BlockReading.objects.all().order_by('month')
        return Response([b.to_dict() for b in docs])

    def put(self, request, month):
        if not re.match(r'^\d{4}-\d{2}$', str(month)):
            return Response({'error': 'Month must look like YYYY-MM (e.g. 2026-10)'}, status=status.HTTP_400_BAD_REQUEST)

        data = request.data or {}
        date_val = data.get('date', '')
        by_user = data.get('by') or request.user.username
        raw_readings = data.get('readings') or {}

        clean_readings = {}
        for k, v in raw_readings.items():
            if re.match(r'^m\d+$', str(k)):
                try:
                    num = float(v)
                    if not (num != num):
                        clean_readings[str(k)] = num
                except (ValueError, TypeError):
                    continue

        if not clean_readings:
            return Response({'error': 'Enter at least one reading'}, status=status.HTTP_400_BAD_REQUEST)

        doc, created = BlockReading.objects.get_or_create(
            month=month,
            defaults={
                'date': str(date_val),
                'by': by_user,
                'readings': clean_readings,
            }
        )
        if not created:
            user = request.user
            is_sup = (getattr(user, 'is_admin', False) or getattr(user, 'is_superuser', False) or getattr(user, 'is_plant_engineer', False) or getattr(user, 'role', '') in ('wtp_supervisor', 'electrical_supervisor'))
            if not is_sup:
                if doc.created_at and (timezone.now() - doc.created_at) > timedelta(minutes=10):
                    return Response({'error': 'The 10-minute edit window has expired. Contact Shift Engineer for any revisions.'}, status=status.HTTP_403_FORBIDDEN)
            current = dict(doc.readings or {})
            current.update(clean_readings)
            doc.readings = current
            if date_val:
                doc.date = str(date_val)
            doc.by = by_user
            doc.save()

        return Response(doc.to_dict())

    def delete(self, request, month):
        try:
            doc = BlockReading.objects.get(month=month)
            doc.delete()
            return Response({'ok': True})
        except BlockReading.DoesNotExist:
            return Response({'error': 'Month not found'}, status=status.HTTP_404_NOT_FOUND)


class StationMetersView(APIView):
    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsWtpSupervisorOrAdmin()]
        return [IsWtpStaff()]

    def get(self, request):
        meters = StationMeter.objects.all().order_by('created_at')
        return Response([m.to_dict() for m in meters])

    def post(self, request):
        data = request.data or {}
        label = (data.get('label') or '').strip()
        station = data.get('station')
        group_name = (data.get('groupName') or 'General').strip()
        unit = (data.get('unit') or 'CUM').strip()
        cum = data.get('cum') is not False
        coef = float(data.get('coef') or 1.0)

        if not label:
            return Response({'error': 'Meter name / label is required'}, status=status.HTTP_400_BAD_REQUEST)
        if station not in STATION_IDS:
            return Response({'error': 'Invalid station'}, status=status.HTTP_400_BAD_REQUEST)

        base_k = re.sub(r'[^a-z0-9]+', '_', label.lower()).strip('_')
        candidate_k = f"c_{station}_{base_k}"[:32]
        count = 1
        while StationMeter.objects.filter(k=candidate_k).exists():
            candidate_k = f"c_{station}_{base_k}_{count}"[:32]
            count += 1

        meter = StationMeter.objects.create(
            k=candidate_k,
            label=label,
            station=station,
            group_name=group_name,
            unit=unit,
            cum=cum,
            coef=coef,
        )
        return Response(meter.to_dict())


class StationMeterDetailView(APIView):
    permission_classes = [IsWtpSupervisorOrAdmin]

    def delete(self, request, pk):
        try:
            meter = StationMeter.objects.get(k=pk)
            meter.delete()
            return Response({'ok': True})
        except StationMeter.DoesNotExist:
            return Response({'error': 'Meter not found'}, status=status.HTTP_404_NOT_FOUND)


class SupervisorLogsView(APIView):
    def get_permissions(self):
        if self.request.method in ('PUT', 'POST'):
            return [IsWtpSupervisorOrAdmin()]
        return [IsWtpStaff()]

    def get(self, request):
        date_param = request.query_params.get('date')
        qs = SupervisorLog.objects.all()
        if date_param:
            qs = qs.filter(date=date_param)
        logs = qs.order_by('-date', '-shift')[:30]
        return Response([l.to_dict() for l in logs])

    def put(self, request):
        data = request.data or {}
        date_str = data.get('date')
        shift_val = data.get('shift')
        supervisor_name = data.get('supervisorName') or (
            request.user.get_full_name() if hasattr(request.user, 'get_full_name') and request.user.get_full_name()
            else request.user.username
        )
        status_val = data.get('status') or 'Normal'
        notes = data.get('notes') or ''
        handover_notes = data.get('handoverNotes') or ''
        checklist = data.get('checklist') or {}

        if not date_str or not re.match(r'^\d{4}-\d{2}-\d{2}$', str(date_str)):
            return Response({'error': 'Valid date required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            shift = int(shift_val)
            if shift not in [1, 2, 3]:
                raise ValueError()
            parsed_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except (ValueError, TypeError):
            return Response({'error': 'Shift must be 1, 2 or 3'}, status=status.HTTP_400_BAD_REQUEST)

        log, _ = SupervisorLog.objects.update_or_create(
            date=parsed_date,
            shift=shift,
            defaults={
                'supervisor_name': supervisor_name,
                'status': status_val,
                'notes': notes,
                'handover_notes': handover_notes,
                'checklist': checklist,
            }
        )
        return Response(log.to_dict())


class SupervisorVerifyView(APIView):
    permission_classes = [IsWtpSupervisorOrAdmin]

    def put(self, request):
        data = request.data or {}
        date_str = data.get('date')
        shift_val = data.get('shift')
        station = data.get('station')
        status_val = data.get('status') or 'verified'
        supervisor_note = data.get('supervisorNote') or ''
        supervisor_name = data.get('supervisorName') or (
            request.user.get_full_name() if hasattr(request.user, 'get_full_name') and request.user.get_full_name()
            else request.user.username
        )

        if not date_str or not re.match(r'^\d{4}-\d{2}-\d{2}$', str(date_str)):
            return Response({'error': 'Valid date required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            shift = int(shift_val)
            if shift not in [1, 2, 3]:
                raise ValueError()
            parsed_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except (ValueError, TypeError):
            return Response({'error': 'Shift must be 1, 2 or 3'}, status=status.HTTP_400_BAD_REQUEST)

        qs = WtpReading.objects.filter(date=parsed_date, shift=shift)
        if station and station in STATION_IDS:
            qs = qs.filter(station=station)

        updated_count = qs.update(
            status=status_val,
            supervisor_note=supervisor_note,
            verified_by=supervisor_name,
            verified_at=timezone.now(),
        )

        updated_readings = [r.to_dict() for r in qs]
        return Response({
            'ok': True,
            'updatedCount': updated_count,
            'readings': updated_readings,
        })


class SupervisorOverviewView(APIView):
    permission_classes = [IsWtpStaff]

    def get(self, request):
        date_param = request.query_params.get('date') or str(timezone.localdate())
        try:
            parsed_date = datetime.strptime(date_param, '%Y-%m-%d').date()
        except ValueError:
            parsed_date = timezone.localdate()
            date_param = str(parsed_date)

        readings_qs = WtpReading.objects.filter(date=parsed_date).order_by('shift', 'station')
        logs_qs = SupervisorLog.objects.filter(date=parsed_date).order_by('shift')

        readings = [r.to_dict() for r in readings_qs]
        logs = [l.to_dict() for l in logs_qs]

        anomalies = []
        for r in readings:
            vals = r.get('values') or {}
            st = (r.get('station') or '').upper()
            sh = r.get('shift')

            # pH anomaly
            ph = vals.get('d')
            if ph is not None:
                if ph < 6.5 or ph > 8.5:
                    anomalies.append({
                        'type': 'warning',
                        'text': f"pH outside standard potable range ({ph}) on {st} Shift {sh}",
                    })

            # Turbidity anomaly
            turb = vals.get('e')
            if turb is not None and turb > 2.0:
                anomalies.append({
                    'type': 'danger',
                    'text': f"High turbidity ({turb} NTU > 2.0 NTU limit) on {st} Shift {sh}",
                })

            # Jalmandapam tank level anomalies
            if r.get('station') == 'jm':
                shift_label = 'Initial' if sh == 1 else 'Final' if sh == 2 else f"Shift {sh}"
                for i in range(1, 6):
                    lvl = vals.get(f"jm{i}")
                    if lvl is not None:
                        if lvl > 4.0:
                            anomalies.append({
                                'type': 'danger',
                                'text': f"Jalmandap-{i} water level exceeded 4.0 m capacity ({lvl} m) on {shift_label} reading",
                            })
                        elif lvl >= 3.8:
                            anomalies.append({
                                'type': 'warning',
                                'text': f"Jalmandap-{i} near full capacity ({lvl} m / 4.0 m) on {shift_label} reading",
                            })
                        elif lvl < 1.0:
                            anomalies.append({
                                'type': 'warning',
                                'text': f"Jalmandap-{i} water level low ({lvl} m) on {shift_label} reading",
                            })

        return Response({
            'date': date_param,
            'totalReadings': len(readings),
            'readings': readings,
            'logs': logs,
            'anomalies': anomalies,
        })


class WtpSummaryView(APIView):
    permission_classes = [IsWtpStaff]

    def get(self, request):
        today = timezone.localdate()
        today_readings = WtpReading.objects.filter(date=today)
        latest_reading = WtpReading.objects.order_by('-updated_at').first()

        # Compute key today metrics
        treated_water = 0
        latest_ph = None
        latest_turb = None

        jm_reading = today_readings.filter(station='jm').order_by('-shift').first()
        tank_vol = 0
        if jm_reading and jm_reading.values:
            caps = {'jm1': 1400, 'jm2': 1400, 'jm3': 1400, 'jm4': 700, 'jm5': 1400}
            for k, cap in caps.items():
                lvl = jm_reading.values.get(k)
                if lvl is not None:
                    tank_vol += (lvl / 4.0) * cap

        for r in today_readings.filter(station='wtp'):
            if r.values:
                c = r.values.get('c')
                if c is not None and c > treated_water:
                    treated_water = c
                if r.values.get('d') is not None:
                    latest_ph = r.values.get('d')
                if r.values.get('e') is not None:
                    latest_turb = r.values.get('e')

        return Response({
            'today': str(today),
            'today_total_logs': today_readings.count(),
            'total_block_meters': BlockMeter.objects.count(),
            'tank_volume_cum': round(tank_vol, 1),
            'tank_capacity_cum': 6300,
            'tank_fill_pct': round((tank_vol / 6300) * 100) if tank_vol else 0,
            'latest_ph': latest_ph,
            'latest_turbidity': latest_turb,
            'latest_entry': {
                'station': latest_reading.station if latest_reading else None,
                'shift': latest_reading.shift if latest_reading else None,
                'by': latest_reading.by if latest_reading else None,
                'updated_at': latest_reading.updated_at.isoformat() if latest_reading else None,
            } if latest_reading else None,
        })


class GwssbBillsView(APIView):
    def get_permissions(self):
        if self.request.method in ('PUT', 'POST', 'DELETE'):
            return [IsWtpSupervisorOrAdmin()]
        return [IsWtpStaff()]

    def get(self, request, month=None):
        if month:
            try:
                bill = GwssbBill.objects.get(month=month)
                return Response(bill.to_dict())
            except GwssbBill.DoesNotExist:
                return Response({'error': f"GWSSB bill for month '{month}' not found"}, status=status.HTTP_404_NOT_FOUND)

        bills = GwssbBill.objects.all().order_by('-month')
        return Response([b.to_dict() for b in bills])

    def put(self, request, month=None):
        data = request.data or {}
        m = month or data.get('month')
        if not m or not re.match(r'^\d{4}-\d{2}$', str(m)):
            return Response({'error': 'Month must be in YYYY-MM format (e.g. 2026-10)'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            init_val = float(data.get('initialReading', 0.0) or 0.0)
            final_val = float(data.get('finalReading', 0.0) or 0.0)
        except (ValueError, TypeError):
            return Response({'error': 'Initial and Final readings must be valid numbers'}, status=status.HTTP_400_BAD_REQUEST)

        rate_val = float(data.get('ratePerUnit', 10.0) if data.get('ratePerUnit') is not None else 10.0)
        bill_no = str(data.get('billNo', '')).strip()
        status_val = str(data.get('status', 'Pending')).strip()
        remarks = str(data.get('remarks', '')).strip()
        date_str = str(data.get('date', ''))
        by_user = data.get('by') or (
            request.user.get_full_name() if hasattr(request.user, 'get_full_name') and request.user.get_full_name()
            else request.user.username
        )

        actual_val = None
        raw_actual = data.get('actualBill') if 'actualBill' in data else data.get('actual_bill')
        if raw_actual is not None and str(raw_actual).strip() != '':
            try:
                actual_val = float(raw_actual)
            except (ValueError, TypeError):
                actual_val = None

        bill, created = GwssbBill.objects.get_or_create(
            month=m,
            defaults={
                'date': date_str,
                'initial_reading': init_val,
                'final_reading': final_val,
                'rate_per_unit': rate_val,
                'actual_bill': actual_val,
                'bill_no': bill_no,
                'status': status_val,
                'remarks': remarks,
                'by': by_user,
            }
        )
        if not created:
            bill.initial_reading = init_val
            bill.final_reading = final_val
            bill.rate_per_unit = rate_val
            if 'actualBill' in data or 'actual_bill' in data:
                bill.actual_bill = actual_val
            if bill_no:
                bill.bill_no = bill_no
            if status_val:
                bill.status = status_val
            if remarks:
                bill.remarks = remarks
            if date_str:
                bill.date = date_str
            bill.by = by_user
            bill.save()

        return Response(bill.to_dict())

    def post(self, request):
        return self.put(request)

    def delete(self, request, month):
        try:
            bill = GwssbBill.objects.get(month=month)
            bill.delete()
            return Response({'ok': True})
        except GwssbBill.DoesNotExist:
            return Response({'error': f"GWSSB bill for month '{month}' not found"}, status=status.HTTP_404_NOT_FOUND)


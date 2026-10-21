import csv
from datetime import date
from django.http import HttpResponse
from django.db.models import Q
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

import threading
from .models import LiftLicense, LiftComplianceSetting
from .serializers import LiftLicenseSerializer
from .email_service import send_lift_expiry_alert


class LiftLicenseListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = LiftLicense.objects.all()

        search = request.query_params.get('search', '').strip()
        if search:
            queryset = queryset.filter(
                Q(lift__icontains=search) |
                Q(no__icontains=search) |
                Q(loc__icontains=search) |
                Q(prov__icontains=search) |
                Q(eng__icontains=search) |
                Q(rem__icontains=search)
            )

        loc = request.query_params.get('loc', '').strip()
        if loc:
            queryset = queryset.filter(loc=loc)

        prov = request.query_params.get('prov', '').strip()
        if prov:
            queryset = queryset.filter(prov=prov)

        try:
            threshold = int(request.query_params.get('win', 30))
        except (ValueError, TypeError):
            threshold = 30

        today = date.today()
        status_filter = request.query_params.get('status', '').strip().lower()

        # In-memory filter or queryset filter for status
        serializer_context = {'threshold_days': threshold}
        serializer = LiftLicenseSerializer(queryset, many=True, context=serializer_context)
        data = serializer.data

        if status_filter:
            data = [item for item in data if item['status'] == status_filter]

        # Sorting
        sort_key = request.query_params.get('ordering', 'order')
        reverse = False
        if sort_key.startswith('-'):
            reverse = True
            sort_key = sort_key[1:]

        if sort_key in ('days_remaining', 'days'):
            # Put None / missing dates at the end
            data.sort(
                key=lambda x: (
                    x['days_remaining'] is None,
                    x['days_remaining'] if x['days_remaining'] is not None else 99999
                ),
                reverse=reverse
            )
        elif sort_key in ('lift', 'loc', 'no', 'prov', 'status'):
            data.sort(key=lambda x: str(x.get(sort_key) or '').lower(), reverse=reverse)
        elif sort_key in ('order', 'id'):
            data.sort(key=lambda x: x.get(sort_key) or 0, reverse=reverse)

        return Response(data)

    def post(self, request):
        serializer = LiftLicenseSerializer(data=request.data)
        if serializer.is_valid():
            # Automatically assign next order
            last = LiftLicense.objects.order_by('-order').first()
            next_order = (last.order if last else 0) + 1
            serializer.save(order=next_order)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LiftLicenseDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, pk):
        try:
            return LiftLicense.objects.get(pk=pk)
        except LiftLicense.DoesNotExist:
            return None

    def get(self, request, pk):
        lift = self.get_object(pk)
        if not lift:
            return Response({'error': 'Lift license not found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = LiftLicenseSerializer(lift)
        return Response(serializer.data)

    def put(self, request, pk):
        lift = self.get_object(pk)
        if not lift:
            return Response({'error': 'Lift license not found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = LiftLicenseSerializer(lift, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request, pk):
        lift = self.get_object(pk)
        if not lift:
            return Response({'error': 'Lift license not found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = LiftLicenseSerializer(lift, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        lift = self.get_object(pk)
        if not lift:
            return Response({'error': 'Lift license not found'}, status=status.HTTP_404_NOT_FOUND)
        lift.delete()
        return Response({'ok': True, 'message': 'Lift license deleted successfully'}, status=status.HTTP_200_OK)


class LiftLicenseStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        setting = LiftComplianceSetting.get_active()

        try:
            param_win = request.query_params.get('win')
            threshold = int(param_win) if param_win is not None else 90
        except (ValueError, TypeError):
            threshold = 90

        # Background automated check: dispatch today's alert if not yet sent
        import threading
        try:
            from .email_service import check_and_send_daily_alerts
            threading.Thread(target=check_and_send_daily_alerts, kwargs={'force': False}, daemon=True).start()
        except Exception:
            pass

        lifts = LiftLicense.objects.all()
        counts = {'total': 0, 'expired': 0, 'due': 0, 'soon': 0, 'ok': 0, 'missing': 0}
        locations = set()
        providers = set()
        alerts = []

        for lift in lifts:
            counts['total'] += 1
            if lift.loc:
                locations.add(lift.loc)
            if lift.prov:
                providers.add(lift.prov)

            days = lift.days_remaining()
            st = lift.compute_status(threshold_days=30)
            counts[st] = counts.get(st, 0) + 1

            # Include in alerts if expired or expiring within 90 days (or within custom threshold)
            if days is not None and days <= threshold:
                if days < 0:
                    tier = 'expired'
                    tier_label = 'Expired'
                    urgency = 'critical'
                elif days <= 30:
                    tier = '30'
                    tier_label = '≤30 Days'
                    urgency = 'critical'
                elif days <= 60:
                    tier = '60'
                    tier_label = '31–60 Days'
                    urgency = 'warning'
                else:
                    tier = '90'
                    tier_label = '61–90 Days'
                    urgency = 'info'

                alerts.append({
                    'id': lift.id,
                    'lift': lift.lift,
                    'loc': lift.loc,
                    'no': lift.no,
                    'prov': lift.prov,
                    'till': lift.till.strftime('%d.%m.%Y') if lift.till else None,
                    'iso_till': lift.till.isoformat() if lift.till else None,
                    'days_remaining': days,
                    'status': st,
                    'tier': tier,
                    'tier_label': tier_label,
                    'urgency': urgency,
                    'eng': lift.eng,
                })

        # Sort alerts by urgency (days remaining ascending, expired first)
        alerts.sort(key=lambda a: (a['days_remaining'] is None, a['days_remaining'] if a['days_remaining'] is not None else 99999))

        tier_counts = {
            'expired': len([a for a in alerts if a['tier'] == 'expired']),
            'tier_30': len([a for a in alerts if a['tier'] == '30']),
            'tier_60': len([a for a in alerts if a['tier'] == '60']),
            'tier_90': len([a for a in alerts if a['tier'] == '90']),
            'total': len(alerts),
        }

        return Response({
            'counts': counts,
            'tier_counts': tier_counts,
            'threshold': threshold,
            'notice_window': threshold,
            'auto_schedule': [30, 60, 90],
            'auto_schedule_active': True,
            'alert_email': setting.alert_email,
            'last_alert_sent_at': setting.last_alert_sent_at,
            'last_alert_date': setting.last_alert_date,
            'alerts': alerts,
            'locations': sorted(list(locations)),
            'providers': sorted(list(providers)),
        })


class LiftLicenseConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        setting = LiftComplianceSetting.get_active()
        return Response({
            'notice_window_days': setting.notice_window_days,
            'alert_email': setting.alert_email,
            'last_alert_sent_at': setting.last_alert_sent_at,
            'last_alert_date': setting.last_alert_date,
            'auto_schedule': [30, 60, 90],
            'auto_schedule_active': True,
        })

    def post(self, request):
        setting = LiftComplianceSetting.get_active()
        new_window = request.data.get('notice_window_days') or request.data.get('window')
        if new_window:
            try:
                setting.notice_window_days = int(new_window)
            except (ValueError, TypeError):
                pass
        new_email = request.data.get('alert_email') or request.data.get('to')
        if new_email:
            setting.alert_email = str(new_email).strip()
        setting.save()

        # Trigger multi-tier alert email across 30, 60, 90 days schedule
        result = send_lift_expiry_alert(window_days=90, recipient=setting.alert_email, force=True)
        return Response({
            'ok': True,
            'notice_window_days': setting.notice_window_days,
            'auto_schedule': [30, 60, 90],
            'alert_email': setting.alert_email,
            'alert_result': result,
        })


class LiftLicenseTriggerAlertView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        setting = LiftComplianceSetting.get_active()
        window_raw = request.data.get('window')
        try:
            window = int(window_raw) if window_raw is not None else 90
        except (ValueError, TypeError):
            window = 90
        recipient = request.data.get('to') or setting.alert_email
        force = bool(request.data.get('force', True))
        result = send_lift_expiry_alert(window_days=window, recipient=recipient, force=force)
        return Response(result)


class LiftLicenseExportCSVView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="lift_licenses_{date.today().isoformat()}.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'Location',
            'Lift Name',
            'License Number',
            'Provider / OEM',
            'Valid From',
            'Valid Till',
            'Days Left',
            'Status',
            'Engineer',
            'Remarks',
        ])

        lifts = LiftLicense.objects.all().order_by('order', 'id')
        for l in lifts:
            days = l.days_remaining()
            writer.writerow([
                l.loc,
                l.lift,
                l.no,
                l.prov or '',
                l.frm.strftime('%d.%m.%Y') if l.frm else '',
                l.till.strftime('%d.%m.%Y') if l.till else '',
                days if days is not None else 'No Date',
                l.compute_status(),
                l.eng or '',
                l.rem or '',
            ])

        return response

import csv
from datetime import date
from django.http import HttpResponse
from django.db.models import Q
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

import threading
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from .models import LiftLicense, LiftComplianceSetting, LiftLicenseDocument
from .serializers import LiftLicenseSerializer, LiftLicenseDocumentSerializer, parse_date_flexibly
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
                Q(equipment_no__icontains=search) |
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

        if status_filter == 'applied':
            data = [item for item in data if item.get('is_applied')]
        elif status_filter:
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
        elif sort_key in ('lift', 'loc', 'no', 'equipment_no', 'prov', 'status'):
            data.sort(key=lambda x: str(x.get(sort_key) or '').lower(), reverse=reverse)
        elif sort_key in ('order', 'id'):
            data.sort(key=lambda x: x.get(sort_key) or 0, reverse=reverse)

        return Response(data)

    def post(self, request):
        if getattr(request.user, 'role', '') == 'engineer':
            return Response({'error': 'Engineers are not permitted to add lifts.'}, status=status.HTTP_403_FORBIDDEN)
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
        if getattr(request.user, 'role', '') == 'engineer':
            return Response({'error': 'Engineers are not permitted to delete lift records.'}, status=status.HTTP_403_FORBIDDEN)
        lift = self.get_object(pk)
        if not lift:
            return Response({'error': 'Lift license not found'}, status=status.HTTP_404_NOT_FOUND)
        lift.delete()
        return Response({'ok': True, 'message': 'Lift license deleted successfully'}, status=status.HTTP_200_OK)


class LiftLicenseDocumentsListView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request, lift_id):
        try:
            lift = LiftLicense.objects.get(pk=lift_id)
        except LiftLicense.DoesNotExist:
            return Response({'error': 'Lift not found'}, status=status.HTTP_404_NOT_FOUND)
        docs = lift.documents.all().order_by('-is_current', '-valid_till', '-created_at')
        serializer = LiftLicenseDocumentSerializer(docs, many=True, context={'request': request})
        return Response(serializer.data)

    def post(self, request, lift_id):
        try:
            lift = LiftLicense.objects.get(pk=lift_id)
        except LiftLicense.DoesNotExist:
            return Response({'error': 'Lift not found'}, status=status.HTTP_404_NOT_FOUND)

        pdf_file = request.FILES.get('pdf_file')
        if not pdf_file:
            return Response({'error': 'PDF certificate file is required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Parse form data
        title = request.data.get('title', '').strip()
        license_no = request.data.get('license_no', '').strip() or lift.no
        raw_frm = request.data.get('valid_from') or request.data.get('frm')
        raw_till = request.data.get('valid_till') or request.data.get('till')
        notes = request.data.get('notes', '').strip()
        raw_is_current = request.data.get('is_current', 'true')
        is_current = str(raw_is_current).lower() in ('true', '1', 'yes')

        valid_from = None
        valid_till = None
        try:
            if raw_frm:
                valid_from = parse_date_flexibly(raw_frm)
            if raw_till:
                valid_till = parse_date_flexibly(raw_till)
        except Exception as e:
            return Response({'error': f'Invalid date format: {e}'}, status=status.HTTP_400_BAD_REQUEST)

        if not title:
            if valid_till:
                title = f"License Certificate (Valid till {valid_till.strftime('%d.%m.%Y')})"
            else:
                title = f"License Certificate - {license_no}"

        uploader = (
            getattr(request.user, 'get_full_name', lambda: '')()
            or getattr(request.user, 'username', 'User')
        )

        if is_current:
            # Mark previous documents for this lift as archived
            lift.documents.filter(is_current=True).update(is_current=False)

        doc = LiftLicenseDocument.objects.create(
            lift=lift,
            pdf_file=pdf_file,
            title=title,
            license_no=license_no,
            valid_from=valid_from,
            valid_till=valid_till,
            is_current=is_current,
            uploaded_by=uploader,
            notes=notes,
        )

        update_parent = str(request.data.get('update_lift_dates', 'true')).lower() in ('true', '1', 'yes')
        if is_current and update_parent:
            if valid_till:
                lift.till = valid_till
            if valid_from:
                lift.frm = valid_from
            if license_no:
                lift.no = license_no
            # Reset renewal application when new certificate is active
            lift.is_applied = False
            lift.applied_date = None
            lift.application_no = ''
            lift.applied_notes = ''
            lift.save()

        serializer = LiftLicenseDocumentSerializer(doc, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class LiftLicenseDocumentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, pk):
        try:
            return LiftLicenseDocument.objects.get(pk=pk)
        except LiftLicenseDocument.DoesNotExist:
            return None

    def get(self, request, pk):
        doc = self.get_object(pk)
        if not doc:
            return Response({'error': 'Document not found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = LiftLicenseDocumentSerializer(doc, context={'request': request})
        return Response(serializer.data)

    def patch(self, request, pk):
        doc = self.get_object(pk)
        if not doc:
            return Response({'error': 'Document not found'}, status=status.HTTP_404_NOT_FOUND)

        if 'is_current' in request.data:
            new_is_current = bool(request.data.get('is_current'))
            if new_is_current:
                doc.lift.documents.filter(is_current=True).exclude(pk=doc.pk).update(is_current=False)
                doc.is_current = True
                if doc.valid_till:
                    doc.lift.till = doc.valid_till
                if doc.valid_from:
                    doc.lift.frm = doc.valid_from
                if doc.license_no:
                    doc.lift.no = doc.license_no
                doc.lift.save()
            else:
                doc.is_current = False

        if 'title' in request.data:
            doc.title = str(request.data['title']).strip()
        if 'notes' in request.data:
            doc.notes = str(request.data['notes']).strip()

        doc.save()
        serializer = LiftLicenseDocumentSerializer(doc, context={'request': request})
        return Response(serializer.data)

    def delete(self, request, pk):
        if getattr(request.user, 'role', '') == 'engineer':
            return Response({'error': 'Engineers are not permitted to delete certificate records. Contact administrator.'}, status=status.HTTP_403_FORBIDDEN)
        doc = self.get_object(pk)
        if not doc:
            return Response({'error': 'Document not found'}, status=status.HTTP_404_NOT_FOUND)
        doc.delete()
        return Response({'ok': True, 'message': 'Document deleted successfully'}, status=status.HTTP_200_OK)


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
                    'is_applied': lift.is_applied,
                    'applied_date': lift.applied_date.strftime('%d.%m.%Y') if lift.applied_date else None,
                    'iso_applied_date': lift.applied_date.isoformat() if lift.applied_date else None,
                    'application_no': lift.application_no or '',
                    'applied_notes': lift.applied_notes or '',
                })

        # Sort alerts: not-applied first by days remaining ascending, then applied
        alerts.sort(key=lambda a: (
            bool(a.get('is_applied')),
            a['days_remaining'] is None,
            a['days_remaining'] if a['days_remaining'] is not None else 99999
        ))

        counts['applied'] = LiftLicense.objects.filter(is_applied=True).count()

        tier_counts = {
            'expired': len([a for a in alerts if a['tier'] == 'expired']),
            'tier_30': len([a for a in alerts if a['tier'] == '30']),
            'tier_60': len([a for a in alerts if a['tier'] == '60']),
            'tier_90': len([a for a in alerts if a['tier'] == '90']),
            'applied': len([a for a in alerts if a.get('is_applied')]),
            'not_applied': len([a for a in alerts if not a.get('is_applied')]),
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
            'Equipment Number',
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
                l.equipment_no or '',
                l.prov or '',
                l.frm.strftime('%d.%m.%Y') if l.frm else '',
                l.till.strftime('%d.%m.%Y') if l.till else '',
                days if days is not None else 'No Date',
                l.compute_status(),
                l.eng or '',
                l.rem or '',
            ])

        return response


class LiftLicenseExportPDFView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        import io
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=landscape(A4),
            leftMargin=1 * cm,
            rightMargin=1 * cm,
            topMargin=1 * cm,
            bottomMargin=1 * cm,
            title='IITGN Lift Licenses & Compliance Report'
        )
        styles = getSampleStyleSheet()

        header_style = ParagraphStyle(
            'TableHeader',
            parent=styles['Normal'],
            fontSize=8,
            fontName='Helvetica-Bold',
            textColor=colors.white,
            alignment=1
        )

        cell_style = ParagraphStyle(
            'TableCell',
            parent=styles['Normal'],
            fontSize=7.5,
            fontName='Helvetica',
            leading=9
        )

        status_styles = {
            'expired': ParagraphStyle('StExp', parent=cell_style, fontName='Helvetica-Bold', textColor=colors.HexColor('#b91c1c'), alignment=1),
            'due': ParagraphStyle('StDue', parent=cell_style, fontName='Helvetica-Bold', textColor=colors.HexColor('#b45309'), alignment=1),
            'soon': ParagraphStyle('StSoon', parent=cell_style, fontName='Helvetica-Bold', textColor=colors.HexColor('#1d4ed8'), alignment=1),
            'ok': ParagraphStyle('StOk', parent=cell_style, fontName='Helvetica-Bold', textColor=colors.HexColor('#15803d'), alignment=1),
            'missing': ParagraphStyle('StMiss', parent=cell_style, fontName='Helvetica-Bold', textColor=colors.HexColor('#64748b'), alignment=1),
        }

        col_widths = [1.0 * cm, 3.8 * cm, 3.5 * cm, 3.8 * cm, 2.8 * cm, 3.4 * cm, 2.2 * cm, 2.0 * cm, 2.2 * cm, 3.0 * cm]

        table_data = [[
            Paragraph('#', header_style),
            Paragraph('Location / Zone', header_style),
            Paragraph('Lift Identifier', header_style),
            Paragraph('License Number', header_style),
            Paragraph('Equipment No.', header_style),
            Paragraph('OEM / Provider', header_style),
            Paragraph('Valid Till', header_style),
            Paragraph('Days Left', header_style),
            Paragraph('Status', header_style),
            Paragraph('In-Charge', header_style),
        ]]

        lifts = LiftLicense.objects.all().order_by('order', 'id')
        total = lifts.count()
        counts = {'ok': 0, 'due': 0, 'expired': 0, 'soon': 0, 'missing': 0}

        for idx, l in enumerate(lifts, 1):
            days = l.days_remaining()
            st = l.compute_status(threshold_days=30)
            counts[st] = counts.get(st, 0) + 1
            st_label = {'expired': 'EXPIRED', 'due': 'DUE SOON', 'soon': 'SOON', 'ok': 'VALID', 'missing': 'MISSING'}.get(st, st.upper())
            st_style = status_styles.get(st, cell_style)

            days_str = str(days) if days is not None else '-'
            till_str = l.till.strftime('%d.%m.%Y') if l.till else 'Missing'

            table_data.append([
                Paragraph(str(idx), cell_style),
                Paragraph(l.loc or '', cell_style),
                Paragraph(l.lift or '', cell_style),
                Paragraph(l.no or '', cell_style),
                Paragraph(l.equipment_no or '-', cell_style),
                Paragraph(l.prov or '', cell_style),
                Paragraph(till_str, cell_style),
                Paragraph(days_str, cell_style),
                Paragraph(st_label, st_style),
                Paragraph(l.eng or '', cell_style),
            ])

        t = Table(table_data, colWidths=col_widths, repeatRows=1)
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#064e3b')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
        ]))

        title_style = ParagraphStyle(
            'DocTitle',
            parent=styles['Heading1'],
            fontSize=13,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#064e3b'),
            spaceAfter=2
        )
        meta_style = ParagraphStyle(
            'DocMeta',
            parent=styles['Normal'],
            fontSize=8,
            textColor=colors.HexColor('#475569'),
            spaceAfter=6
        )

        today_str = date.today().strftime('%d %B %Y')
        meta_text = (
            f"<b>Generated:</b> {today_str} &nbsp;|&nbsp; "
            f"<b>Total Elevators:</b> {total} &nbsp;|&nbsp; "
            f"<b>Valid:</b> {counts.get('ok', 0)} &nbsp;|&nbsp; "
            f"<b>Due Soon (&le;30d):</b> {counts.get('due', 0)} &nbsp;|&nbsp; "
            f"<b>Expired:</b> {counts.get('expired', 0)} &nbsp;|&nbsp; "
            f"<b>Lead Engineer:</b> Mr. Naveen Rai"
        )

        story = [
            Paragraph('INDIAN INSTITUTE OF TECHNOLOGY GANDHINAGAR', title_style),
            Paragraph('Statutory Lift License Register & Safety Inspection Compliance', ParagraphStyle('Sub', parent=styles['Normal'], fontSize=9.5, fontName='Helvetica-Bold', textColor=colors.HexColor('#1e293b'), spaceAfter=2)),
            Paragraph(meta_text, meta_style),
            HRFlowable(width='100%', thickness=1, color=colors.HexColor('#064e3b'), spaceAfter=6),
            t,
            Spacer(1, 0.4 * cm),
            Paragraph('Official Record — Indian Institute of Technology Gandhinagar (Estate & Electrical Division)', ParagraphStyle('Footer', parent=styles['Normal'], fontSize=7, textColor=colors.HexColor('#94a3b8'), alignment=1))
        ]

        doc.build(story)

        response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="lift_licenses_{date.today().isoformat()}.pdf"'
        return response

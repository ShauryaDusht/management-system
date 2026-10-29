from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.users.models import User
from .models import HvacLog, HvacSupervisorLog


def make_user(role):
    return User.objects.create_user(username=f'u_{role}', password='Str0ng#Pass-xyz', role=role)


class HvacApiPermissionTests(APITestCase):
    def auth(self, user):
        token = str(RefreshToken.for_user(user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def setUp(self):
        self.log = HvacLog.objects.create(
            id='2026-10-24_0830', date='2026-10-24', time='08:30', slot=1, shift='1',
            operator='real', values={},
        )

    def test_anonymous_is_rejected(self):
        self.assertEqual(self.client.get('/api/hvac/logs/').status_code, 401)

    def test_hardcoded_admin_keys_no_longer_grant_access(self):
        for key in ('IITGN@2025', 'admin123', 'engineer123'):
            self.assertEqual(self.client.get(f'/api/hvac/logs/?key={key}').status_code, 401)
            self.assertEqual(self.client.get('/api/hvac/logs/', HTTP_X_ADMIN_KEY=key).status_code, 401)
            self.assertEqual(self.client.delete(f'/api/hvac/logs/{self.log.id}/?key={key}').status_code, 401)
        self.assertTrue(HvacLog.objects.filter(id=self.log.id).exists())

    def test_unrelated_role_cannot_read_or_delete(self):
        self.auth(make_user('caretaker'))
        self.assertEqual(self.client.get('/api/hvac/logs/').status_code, 403)
        self.assertEqual(self.client.delete(f'/api/hvac/logs/{self.log.id}/').status_code, 403)
        self.assertTrue(HvacLog.objects.filter(id=self.log.id).exists())

    def test_operator_can_read_but_not_delete(self):
        self.auth(make_user('hvac_operator'))
        self.assertEqual(self.client.get('/api/hvac/logs/').status_code, 200)
        self.assertEqual(self.client.delete(f'/api/hvac/logs/{self.log.id}/').status_code, 403)
        self.assertTrue(HvacLog.objects.filter(id=self.log.id).exists())

    def test_supervisor_can_delete(self):
        self.auth(make_user('hvac_supervisor'))
        self.assertEqual(self.client.delete(f'/api/hvac/logs/{self.log.id}/').status_code, 200)
        self.assertFalse(HvacLog.objects.filter(id=self.log.id).exists())

    def test_first_handover_save_for_new_shift_succeeds(self):
        self.auth(make_user('hvac_supervisor'))
        body = {'date': '2031-01-15', 'shift': '2', 'status': 'Normal'}
        first = self.client.post('/api/hvac/supervisor/', body, format='json')
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data['log']['date'], '2031-01-15')
        second = self.client.post('/api/hvac/supervisor/', body, format='json')
        self.assertEqual(second.status_code, 200)
        self.assertEqual(HvacSupervisorLog.objects.filter(shift='2').count(), 1)

    def test_default_passwords_do_not_bypass_real_password(self):
        from django.contrib.auth import authenticate
        user = make_user('plant_engineer')
        for pw in ('IITGN@2025', 'supervisor123', 'operator123', 'engineer123'):
            self.assertIsNone(authenticate(username=user.username, password=pw))
        self.assertIsNotNone(authenticate(username=user.username, password='Str0ng#Pass-xyz'))


class HvacImportAndUndoTests(APITestCase):
    def auth(self, user):
        token = str(RefreshToken.for_user(user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def setUp(self):
        self.engineer = make_user('hvac_engineer')
        self.operator = make_user('hvac_operator')
        self.supervisor = make_user('hvac_supervisor')

    def test_permission_only_engineer_and_superuser_can_import(self):
        # Operator forbidden
        self.auth(self.operator)
        res = self.client.post('/api/hvac/import-csv/', {'rows': []}, format='json')
        self.assertEqual(res.status_code, 403)

        # Supervisor forbidden
        self.auth(self.supervisor)
        res = self.client.post('/api/hvac/import-csv/', {'rows': []}, format='json')
        self.assertEqual(res.status_code, 403)

        # Engineer allowed
        self.auth(self.engineer)
        res = self.client.post('/api/hvac/import-csv/', {'rows': []}, format='json')
        self.assertEqual(res.status_code, 400)  # Bad request due to empty rows, but passed auth (not 403)

    def test_excel_import_and_undo_rollback(self):
        import io
        import openpyxl
        from django.core.files.uploadedfile import SimpleUploadedFile
        from .models import HvacImportBatch

        self.auth(self.engineer)

        # Create an Excel workbook in memory
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Telemetry"
        ws.append(["Date", "Time", "Slot", "Shift", "Operator", "C1 Evap In", "C1 Evap Out", "C1 Status"])
        ws.append(["2026-08-10", "07:30", 0, 1, "Ramesh Varma", 11.5, 7.2, "on"])
        ws.append(["2026-08-10", "08:30", 1, 1, "Ramesh Varma", 11.8, 7.1, "on"])

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)

        uploaded = SimpleUploadedFile(
            "august_hvac.xlsx",
            buf.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )

        # 1. Test preview dry-run
        res_preview = self.client.post('/api/hvac/import-csv/', {'file': uploaded, 'preview': 'true'}, format='multipart')
        self.assertEqual(res_preview.status_code, 200)
        self.assertTrue(res_preview.data['ok'])
        self.assertTrue(res_preview.data['preview'])
        self.assertEqual(res_preview.data['valid_rows'], 2)
        self.assertEqual(HvacLog.objects.filter(date='2026-08-10').count(), 0)

        # 2. Test actual ingestion
        uploaded.seek(0)
        res_import = self.client.post('/api/hvac/import-csv/', {'file': uploaded, 'preview': 'false'}, format='multipart')
        self.assertEqual(res_import.status_code, 200)
        self.assertTrue(res_import.data['ok'])
        self.assertFalse(res_import.data['preview'])
        self.assertEqual(res_import.data['imported_count'], 2)
        batch_id = res_import.data['batch_id']

        # Verify logs were inserted
        self.assertEqual(HvacLog.objects.filter(date='2026-08-10').count(), 2)
        log1 = HvacLog.objects.get(id='2026-08-10_0730')
        self.assertEqual(log1.values.get('c1_evapIn'), 11.5)
        self.assertEqual(log1.values.get('c1_st'), 'on')

        # Verify batch was saved
        batch = HvacImportBatch.objects.get(batch_id=batch_id)
        self.assertEqual(batch.status, 'active')
        self.assertEqual(batch.total_records, 2)

        # 3. Test Undo
        res_undo = self.client.post('/api/hvac/import-undo/', {'batch_id': batch_id}, format='json')
        self.assertEqual(res_undo.status_code, 200)
        self.assertTrue(res_undo.data['ok'])

        # Verify logs were deleted/rolled back
        self.assertEqual(HvacLog.objects.filter(date='2026-08-10').count(), 0)

        # Verify batch status updated to reverted
        batch.refresh_from_db()
        self.assertEqual(batch.status, 'reverted')
        self.assertIsNotNone(batch.reverted_at)

        # 4. Attempting to undo again should return 400
        res_undo_again = self.client.post('/api/hvac/import-undo/', {'batch_id': batch_id}, format='json')
        self.assertEqual(res_undo_again.status_code, 400)

    def test_excel_matrix_import_and_undo(self):
        import datetime
        import io
        import openpyxl
        from django.core.files.uploadedfile import SimpleUploadedFile
        from .models import HvacImportBatch

        self.auth(self.engineer)

        # Build an Excel (.xlsx) file mimicking the IITGN Campus Log Sheet Matrix
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Jan 2025"
        ws.append(["Daily Log Sheet For HVAC Plant", "", ""])
        ws.append(["IIT Gandhinagar", "", ""])
        ws.append(["Date :", datetime.date(2025, 1, 15), "Active Chiller Water Set Point :", 8.5])
        ws.append(["Chiller Number :", "", "6", "off"] + ["off"] * 22)
        times = [
            datetime.time(7, 30), datetime.time(8, 30), datetime.time(9, 30), datetime.time(10, 30),
            datetime.time(11, 30), datetime.time(12, 30), datetime.time(13, 30), datetime.time(14, 30),
            datetime.time(15, 30), datetime.time(16, 30), datetime.time(17, 30), datetime.time(18, 30),
            datetime.time(19, 30), datetime.time(20, 30), datetime.time(21, 30), datetime.time(22, 30),
            datetime.time(23, 30), datetime.time(0, 30), datetime.time(1, 30), datetime.time(2, 30),
            datetime.time(3, 30), datetime.time(4, 30), datetime.time(5, 30), datetime.time(6, 30)
        ]
        ws.append(["Time :", ""] + times)
        ws.append(["EVAPORATOR", "Entering Water Temp C", 11.2, "-"] + ["-"] * 22)
        ws.append(["", "Leaving Water Temp C", 8.6, "-"] + ["-"] * 22)
        ws.append(["Primary Pump 1", "Amp", 20.4, "-"] + ["-"] * 22)

        bio = io.BytesIO()
        wb.save(bio)
        bio.seek(0)

        uploaded = SimpleUploadedFile(
            'Jan_2025_HVAC_Log.xlsx',
            bio.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )

        # 1. Preview dry-run
        res_prev = self.client.post('/api/hvac/import-csv/', {'file': uploaded, 'preview': 'true'}, format='multipart')
        self.assertEqual(res_prev.status_code, 200)
        self.assertTrue(res_prev.data['ok'])
        self.assertTrue(res_prev.data['preview'])
        self.assertEqual(res_prev.data['valid_rows'], 24)
        self.assertEqual(res_prev.data['date_min'], '2025-01-15')

        # 2. Actual import
        uploaded.seek(0)
        res_import = self.client.post('/api/hvac/import-csv/', {'file': uploaded, 'preview': 'false'}, format='multipart')
        self.assertEqual(res_import.status_code, 200)
        self.assertTrue(res_import.data['ok'])
        self.assertEqual(res_import.data['imported_count'], 24)
        batch_id = res_import.data['batch_id']

        # Verify logs were inserted correctly with matched values and unmatched blank
        self.assertEqual(HvacLog.objects.filter(date='2025-01-15').count(), 24)
        log_0730 = HvacLog.objects.get(id='2025-01-15_0730')
        self.assertEqual(log_0730.values.get('c6_evapIn'), 11.2)
        self.assertEqual(log_0730.values.get('c6_evapOut'), 8.6)
        self.assertEqual(log_0730.values.get('c6_st'), 'on')
        self.assertEqual(log_0730.values.get('pri1_a'), 20.4)
        # Unmatched fields should be blank/absent
        self.assertIsNone(log_0730.values.get('c1_evapIn'))

        # 3. Test Undo
        res_undo = self.client.post('/api/hvac/import-undo/', {'batch_id': batch_id}, format='json')
        self.assertEqual(res_undo.status_code, 200)
        self.assertTrue(res_undo.data['ok'])

        # Verify records rolled back
        self.assertEqual(HvacLog.objects.filter(date='2025-01-15').count(), 0)
        batch = HvacImportBatch.objects.get(batch_id=batch_id)
        self.assertEqual(batch.status, 'reverted')



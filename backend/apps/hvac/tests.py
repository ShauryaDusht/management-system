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

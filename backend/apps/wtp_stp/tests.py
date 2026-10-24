from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.users.models import User
from .models import BlockMeter


def make_user(role):
    return User.objects.create_user(username=f'u_{role}', password='Str0ng#Pass-xyz', role=role)


class WtpApiPermissionTests(APITestCase):
    def auth(self, user):
        token = str(RefreshToken.for_user(user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def setUp(self):
        BlockMeter.objects.create(sr=1, block='Block A', meter_no='M-1')

    def test_anonymous_is_rejected(self):
        self.assertEqual(self.client.get('/api/wtp/summary/').status_code, 401)

    def test_unrelated_role_cannot_delete_block_meter(self):
        self.auth(make_user('caretaker'))
        self.assertEqual(self.client.get('/api/wtp/summary/').status_code, 403)
        self.assertEqual(self.client.delete('/api/wtp/blocks/meters/1/').status_code, 403)
        self.assertTrue(BlockMeter.objects.filter(sr=1).exists())

    def test_operator_can_read_but_not_delete(self):
        self.auth(make_user('wtp_operator'))
        self.assertEqual(self.client.get('/api/wtp/summary/').status_code, 200)
        self.assertEqual(self.client.delete('/api/wtp/blocks/meters/1/').status_code, 403)
        self.assertTrue(BlockMeter.objects.filter(sr=1).exists())

    def test_supervisor_can_delete_block_meter(self):
        self.auth(make_user('wtp_supervisor'))
        self.assertEqual(self.client.delete('/api/wtp/blocks/meters/1/').status_code, 200)
        self.assertFalse(BlockMeter.objects.filter(sr=1).exists())

    def test_other_module_staff_cannot_access_wtp(self):
        for role in ('hvac_supervisor', 'electrical_supervisor'):
            self.auth(make_user(role))
            self.assertEqual(self.client.delete('/api/wtp/blocks/meters/1/').status_code, 403)
        self.assertTrue(BlockMeter.objects.filter(sr=1).exists())

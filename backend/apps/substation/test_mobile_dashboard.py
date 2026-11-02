from django.test import TestCase

from apps.users.models import User

ENERGRID_HOST = 'energrid.gettruepower.net'


class MobileDashboardEnerGridCardTests(TestCase):
    def dashboard(self, role):
        user = User.objects.create_user(username=f'dash_{role}', password='Str0ng#Pass-xyz', role=role)
        self.client.force_login(user)
        return self.client.get('/substation/dashboard/', secure=True)

    def test_engineer_and_admin_see_the_live_monitoring_links(self):
        for role in ('plant_engineer', 'admin'):
            response = self.dashboard(role)
            self.assertEqual(response.status_code, 200, role)
            self.assertContains(response, f'https://operator.{ENERGRID_HOST}/', msg_prefix=role)
            self.assertContains(response, f'https://monitor.{ENERGRID_HOST}/dashboards', msg_prefix=role)

    def test_supervisor_and_operator_do_not(self):
        for role in ('electrical_supervisor', 'electrical_operator'):
            response = self.dashboard(role)
            self.assertEqual(response.status_code, 200, role)
            self.assertNotContains(response, ENERGRID_HOST, msg_prefix=role)

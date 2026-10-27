from datetime import timedelta

from django.test import Client, TestCase
from django.utils import timezone

from apps.horticulture.models import HorticultureZone
from apps.housekeeping.models import HKArea, HKUserArea
from apps.hvac.models import HvacLog
from apps.substation.models import SubstationSheet
from apps.users.models import User

PASSWORD = 'Str0ng#Pass-xyz'


def make_user(username, role, **extra):
    return User.objects.create_user(username=username, password=PASSWORD, role=role, **extra)


class PortalAccessBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        SubstationSheet.objects.create(
            id='s1', name='S1', section='HT', full_title='x', mode='snapshot',
            slots=['R1', 'R2', 'R3'], tables=[], display_order=0, is_active=True,
        )
        cls.horti_sup = make_user('horti.sup', 'supervisor')
        HorticultureZone.objects.create(name='Zone Red', color_code='red', supervisor=cls.horti_sup)
        cls.hk_sup = make_user('hk.sup', 'supervisor')
        HKUserArea.objects.create(user=cls.hk_sup, area=HKArea.objects.create(name='AB1', area_type='academic', is_active=True))
        cls.caretaker = make_user('care', 'caretaker')
        cls.horti_mgr = make_user('horti.mgr', 'horticulture_manager')
        cls.hvac_op = make_user('hvac.op', 'hvac_operator')
        cls.hvac_sup = make_user('hvac.sup', 'hvac_supervisor')
        cls.wtp_op = make_user('wtp.op', 'wtp_operator')
        cls.elec_op = make_user('elec.op', 'electrical_operator')
        cls.plant = make_user('plant', 'plant_engineer')
        cls.admin = make_user('adm', 'admin')

    def client_for(self, user):
        client = Client()
        client.force_login(user)
        return client


class LoginLandingTests(PortalAccessBase):
    """After login everyone goes to their own home, not to a page full of other departments' modules."""

    def landing(self, user):
        response = Client().post('/portal/login/', data={'username': user.username, 'password': PASSWORD}, secure=True)
        self.assertEqual(response.status_code, 302)
        return response['Location']

    def test_each_role_lands_on_its_own_home(self):
        self.assertEqual(self.landing(self.horti_sup), '/horticulture/dashboard/')
        self.assertEqual(self.landing(self.horti_mgr), '/horticulture/dashboard/')
        self.assertEqual(self.landing(self.hk_sup), '/housekeeping/dashboard/')
        self.assertEqual(self.landing(self.caretaker), '/housekeeping/dashboard/')
        self.assertEqual(self.landing(self.hvac_op), '/hvac/dashboard/')
        self.assertEqual(self.landing(self.wtp_op), '/wtp/dashboard/')
        self.assertEqual(self.landing(self.elec_op), '/substation/dashboard/')

    def test_plant_engineer_lands_on_the_unified_portal(self):
        self.assertEqual(self.landing(self.plant), '/portal/dashboard/')

    def test_already_signed_in_person_is_sent_home_too(self):
        response = self.client_for(self.horti_sup).get('/portal/login/', secure=True)
        self.assertEqual(response['Location'], '/horticulture/dashboard/')


class PlantModuleAccessTests(PortalAccessBase):
    # pages every staff member of the module uses
    PAGES = {
        'hvac': ['/hvac/dashboard/', '/hvac/entry/', '/hvac/history/'],
        'substation': ['/substation/dashboard/', '/substation/entry/', '/substation/history/'],
        'wtp': ['/wtp/dashboard/', '/wtp/blocks/', '/wtp/history/'],
    }
    # supervisor-only pages inside a module: operators are refused there on purpose, outsiders always
    SUPERVISOR_PAGES = {
        'hvac': ['/hvac/operators/'],
        'substation': ['/substation/operators/'],
        'wtp': ['/wtp/operators/', '/wtp/gwssb/'],
    }
    ALLOWED = {
        'hvac': {'hvac_op', 'hvac_sup', 'plant', 'admin'},
        'substation': {'elec_op', 'plant', 'admin'},
        'wtp': {'wtp_op', 'plant', 'admin'},
    }

    def test_only_the_right_roles_open_each_plant_module(self):
        everyone = ['horti_sup', 'hk_sup', 'caretaker', 'horti_mgr', 'hvac_op', 'hvac_sup', 'wtp_op', 'elec_op', 'plant', 'admin']
        for module, pages in self.PAGES.items():
            for attr in everyone:
                client = self.client_for(getattr(self, attr))
                for page in pages:
                    response = client.get(page, secure=True)
                    if attr in self.ALLOWED[module]:
                        self.assertNotEqual(response.status_code, 302, f'{attr} should open {page}')
                    else:
                        self.assertEqual(response.status_code, 302, f'{attr} must NOT open {page}')
                        self.assertNotIn(f'/{page.strip("/").split("/")[0]}/', response['Location'], f'{attr} bounced back into {page}')

    def test_outsiders_cannot_open_supervisor_pages_either(self):
        outsiders = ['horti_sup', 'hk_sup', 'caretaker', 'horti_mgr']
        for module, pages in self.SUPERVISOR_PAGES.items():
            for attr in outsiders:
                client = self.client_for(getattr(self, attr))
                for page in pages:
                    self.assertEqual(client.get(page, secure=True).status_code, 302, f'{attr} must NOT open {page}')

    def test_non_plant_staff_cannot_save_hvac_readings(self):
        url = '/hvac/entry/?date=2031-02-03&slot=5'
        data = {'operator': 'Someone Else', 'c1_evapIn': '99'}
        for user in (self.caretaker, self.hk_sup, self.horti_sup, self.horti_mgr):
            self.client_for(user).post(url, data=data, secure=True)
            self.assertEqual(HvacLog.objects.count(), 0, f'{user.username} must not be able to write HVAC logs')
        self.client_for(self.hvac_op).post(url, data=data, secure=True)
        self.assertEqual(HvacLog.objects.count(), 1)


class UnifiedPortalCardsTests(PortalAccessBase):
    LINKS = {
        'substation': 'href="/substation/dashboard/" class="sub-btn',
        'wtp': 'href="/wtp/dashboard/" class="sub-btn',
        'hvac': 'href="/hvac/dashboard/" class="sub-btn',
        'housekeeping': 'href="/housekeeping/dashboard/" class="sub-btn',
        'horticulture': 'href="/horticulture/dashboard/" class="sub-btn',
    }

    def shown(self, user):
        response = self.client_for(user).get('/portal/dashboard/', secure=True)
        self.assertEqual(response.status_code, 200)
        content = response.content.decode()
        return {name for name, marker in self.LINKS.items() if marker in content}

    def test_cards_match_the_role(self):
        self.assertEqual(self.shown(self.horti_sup), {'horticulture'})
        self.assertEqual(self.shown(self.hk_sup), {'housekeeping'})
        self.assertEqual(self.shown(self.caretaker), {'housekeeping'})
        self.assertEqual(self.shown(self.hvac_op), {'hvac'})
        self.assertEqual(self.shown(self.wtp_op), {'wtp'})
        self.assertEqual(self.shown(self.elec_op), {'substation'})
        self.assertEqual(self.shown(self.plant), {'substation', 'wtp', 'hvac'})
        self.assertEqual(self.shown(self.admin), set(self.LINKS))


class TenMinuteEditWindowVisibilityTests(PortalAccessBase):
    """The 10-minute banner only exists for an operator, for a reading that is already saved and still recent."""

    URL = '/hvac/entry/?date=2031-02-03&slot=5'

    def save_as_operator(self):
        self.client_for(self.hvac_op).post(self.URL, data={'operator': 'Op One', 'c1_evapIn': '10'}, secure=True)
        self.assertEqual(HvacLog.objects.count(), 1)

    def test_operator_sees_the_countdown_after_saving(self):
        response = self.client_for(self.hvac_op).get(self.URL, secure=True)
        self.assertNotIn('window-timer', response.content.decode())  # nothing saved yet, nothing to count down

        self.save_as_operator()
        response = self.client_for(self.hvac_op).get(self.URL, secure=True)
        self.assertTrue(response.context['edit_window_active'])
        self.assertIn('window-timer', response.content.decode())

    def test_supervisor_never_sees_the_banner(self):
        self.save_as_operator()
        response = self.client_for(self.hvac_sup).get(self.URL, secure=True)
        self.assertNotIn('window-timer', response.content.decode())

    def test_operator_is_locked_after_ten_minutes(self):
        self.save_as_operator()
        HvacLog.objects.update(created_at=timezone.now() - timedelta(minutes=15))
        response = self.client_for(self.hvac_op).get(self.URL, secure=True)
        self.assertTrue(response.context['is_locked'])
        self.assertFalse(response.context['edit_window_active'])
        self.client_for(self.hvac_op).post(self.URL, data={'operator': 'Op One', 'c1_evapIn': '55'}, secure=True)
        self.assertEqual(HvacLog.objects.get().values.get('c1_evapIn'), 10.0)  # the late edit was refused

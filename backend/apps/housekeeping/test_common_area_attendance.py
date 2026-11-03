import datetime
from io import StringIO
from unittest import mock
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from apps.housekeeping import htmx_views as hv
from apps.housekeeping.models import HKArea, HKAttendanceRecord, HKUserArea, HKWorker

IST = ZoneInfo('Asia/Kolkata')


def at(hour, minute=0):
    """Freeze 'now' at the given IST wall-clock time today."""
    moment = datetime.datetime.combine(timezone.localdate(), datetime.time(hour, minute), tzinfo=IST)
    return mock.patch('django.utils.timezone.now', return_value=moment)


class CommonAreaAttendanceTests(TestCase):
    """Vishwajeet Mishra (Hostel Common Area): first shift 8AM-5PM, second shift 1PM-10PM, every staff member
    listed in both, marked as they come, anyone not marked by 10PM is Absent, and no reliever option."""

    def setUp(self):
        User = get_user_model()
        self.today = timezone.localdate()
        self.caretaker = User.objects.create_user(
            username='vishwajeet.mishra', password='x', role='caretaker', first_name='Vishwajeet', last_name='Mishra')
        self.area = HKArea.objects.create(name='Hostel Common Area', area_type='hostel', is_active=True)
        HKUserArea.objects.create(user=self.caretaker, area=self.area)
        jrha = HKArea.objects.create(name='Block-D JRHA', area_type='hostel', is_active=True)
        pool = HKArea.objects.create(name='Hostels Reliever', area_type='hostel', is_active=True)

        def worker(name, code, area, **extra):
            return HKWorker.objects.create(name=name, pay_code=code, area=area, shift=extra.pop('shift', 'day'),
                                           is_active=True, **extra)

        self.day = worker('Yogesh Vaghela', '80', self.area)
        self.night = worker('Vinayak Solanki', '240', self.area, shift='night')
        self.evening = worker('Suresh Solanki', '472', self.area, shift='evening')
        self.jrha_one = worker('Bhavika', '457', jrha)
        self.jrha_two = worker('Urvashi', '459', jrha)
        # the same person registered a second time as a pool reliever: must not give a second card
        worker('Urvashi Ben Vaghela', '459', pool, is_reliever=True, worker_type='reliever')
        self.stranger = worker('Not his staff', '999', jrha)

        self.client.force_login(self.caretaker)

    def attendance_page(self):
        return self.client.get(f'/housekeeping/attendance/?area={self.area.id}&date={self.today}')

    def mark(self, worker, half, status='present'):
        return self.client.post(
            f'/housekeeping/attendance/?area={self.area.id}&date={self.today}',
            {'action': 'mark', 'half': half, 'worker_id': worker.id, 'status': status},
            HTTP_HX_REQUEST='true',
        )

    # ── timing ────────────────────────────────────────────────────────────────────────────────
    def test_the_two_shifts_overlap_and_close_at_5pm_and_10pm(self):
        expected = {  # (hour, minute): (first open, second open)
            (7, 59): (False, False),
            (9, 0): (True, False),
            (13, 0): (True, True),
            (16, 59): (True, True),
            (17, 0): (False, True),
            (21, 59): (False, True),
            (22, 0): (False, False),
        }
        for (hour, minute), (first, second) in expected.items():
            with at(hour, minute):
                self.assertEqual(hv.attendance_half_is_open(self.today, 'first', user=self.caretaker, area=self.area), first, (hour, minute))
                self.assertEqual(hv.attendance_half_is_open(self.today, 'second', user=self.caretaker, area=self.area), second, (hour, minute))

    def test_other_areas_keep_the_normal_windows(self):
        other_area = HKArea.objects.create(name='Aibaan', area_type='hostel', is_active=True)
        other_user = get_user_model().objects.create_user(username='someone.else', password='x', role='caretaker')
        with at(18, 0):
            self.assertFalse(hv.attendance_half_is_open(self.today, 'first', user=other_user, area=other_area))
            self.assertFalse(hv.attendance_half_is_open(self.today, 'second', user=other_user, area=other_area))
        with at(14, 0):
            self.assertFalse(hv.attendance_half_is_open(self.today, 'first', user=other_user, area=other_area))
            self.assertTrue(hv.attendance_half_is_open(self.today, 'second', user=other_user, area=other_area))

    def test_page_shows_the_two_shift_labels(self):
        with at(18, 0):
            content = self.attendance_page().content.decode()
        self.assertIn('First Half (8AM–5PM)', content)
        self.assertIn('Second Half (1PM–10PM)', content)
        self.assertIn('1PM–10PM', content)

    # ── who is listed, relievers ───────────────────────────────────────────────────────────────
    def test_all_six_staff_are_listed_once_and_nobody_else(self):
        with at(18, 0):
            content = self.attendance_page().content.decode()
        for name in ('Yogesh Vaghela', 'Vinayak Solanki', 'Suresh Solanki', 'Bhavika', 'Urvashi'):
            self.assertEqual(content.count(f'<div style="font-weight:700;font-size:14px">{name}</div>'), 1, name)
        self.assertNotIn('Not his staff', content)

    def test_other_viewers_of_the_area_do_not_get_the_extra_staff(self):
        admin = get_user_model().objects.create_user(username='an_admin', password='x', role='admin')
        self.client.force_login(admin)
        with at(15, 0):
            content = self.attendance_page().content.decode()
        card = '<div style="font-weight:700;font-size:14px">{}</div>'
        self.assertEqual(content.count(card.format('Yogesh Vaghela')), 1)
        self.assertEqual(content.count(card.format('Bhavika')), 0)
        self.assertEqual(content.count(card.format('Urvashi')), 0)

    def test_no_reliever_option_for_him(self):
        with at(15, 0):
            content = self.attendance_page().content.decode()
            self.assertNotIn('Choose reliever', content)
            self.assertNotIn('relbtn-', content)
            self.assertEqual(list(hv._attendance_relievers_for_area(self.area, user=self.caretaker)), [])
            response = self.client.post('/housekeeping/attendance/assign-reliever/', {
                'original_worker_id': self.day.id, 'reliever_id': self.night.id, 'area_id': self.area.id,
            })
        self.assertEqual(response.status_code, 400)

    # ── marking in the evening ─────────────────────────────────────────────────────────────────
    def test_staff_who_come_in_the_evening_are_marked_present_in_the_second_shift(self):
        with at(18, 30):
            response = self.mark(self.evening, 'second', 'present')
        self.assertEqual(response.status_code, 200)
        record = HKAttendanceRecord.objects.get(worker=self.evening, date=self.today, half='second')
        self.assertEqual(record.status, 'present')
        self.assertFalse(HKAttendanceRecord.objects.filter(worker=self.evening, date=self.today, half='first').exists())

    def test_second_shift_is_not_copied_from_the_first(self):
        with at(10, 0):
            self.mark(self.day, 'first', 'present')
        with at(18, 0):
            self.attendance_page()
        self.assertFalse(HKAttendanceRecord.objects.filter(worker=self.day, date=self.today, half='second').exists())

    def test_marking_is_refused_once_the_shift_is_over(self):
        with at(22, 30):
            response = self.mark(self.evening, 'second', 'present')
        self.assertEqual(response.status_code, 400)

    def test_other_areas_still_only_take_second_half_exceptions(self):
        other_area = HKArea.objects.create(name='Aibaan', area_type='hostel', is_active=True)
        other_user = get_user_model().objects.create_user(username='someone.else', password='x', role='caretaker')
        HKUserArea.objects.create(user=other_user, area=other_area)
        member = HKWorker.objects.create(name='Aibaan worker', pay_code='311', area=other_area, shift='day', is_active=True)
        self.client.force_login(other_user)
        with at(14, 0):
            response = self.client.post(
                f'/housekeeping/attendance/?area={other_area.id}&date={self.today}',
                {'action': 'mark', 'half': 'second', 'worker_id': member.id, 'status': 'present'},
                HTTP_HX_REQUEST='true')
        self.assertEqual(response.status_code, 400)

    # ── 10 PM: not marked means absent ─────────────────────────────────────────────────────────
    def test_unmarked_staff_become_absent_at_10pm_and_marked_ones_are_untouched(self):
        with at(10, 0):
            self.mark(self.day, 'first', 'present')
        with at(19, 0):
            self.mark(self.evening, 'second', 'present')

        with at(21, 59):
            self.attendance_page()
        self.assertEqual(HKAttendanceRecord.objects.filter(status='absent', date=self.today).count(), 0)

        with at(22, 1):
            self.attendance_page()

        status = {(r.worker_id, r.half): r.status for r in HKAttendanceRecord.objects.filter(date=self.today)}
        self.assertEqual(status[(self.day.id, 'first')], 'present')
        self.assertEqual(status[(self.day.id, 'second')], 'absent')
        self.assertEqual(status[(self.evening.id, 'second')], 'present')
        self.assertEqual(status[(self.evening.id, 'first')], 'absent')
        self.assertEqual(status[(self.night.id, 'first')], 'absent')
        self.assertEqual(status[(self.night.id, 'second')], 'absent')
        self.assertNotIn((self.stranger.id, 'first'), status)
        record = HKAttendanceRecord.objects.get(worker=self.night, date=self.today, half='second')
        # left editable, so a shared staff member's other caretaker can still correct it
        self.assertFalse(record.is_submitted)
        self.assertEqual(record.note, hv.AUTO_ABSENT_NOTE)

        # doing it again changes nothing
        with at(22, 5):
            self.assertEqual(hv.auto_absent_unmarked_workers(self.area, self.today), 0)

    def test_management_command_only_acts_after_10pm(self):
        def run():
            out = StringIO()
            call_command('auto_absent_common_area', stdout=out)
            return out.getvalue()

        with at(21, 0):
            self.assertIn('has not passed', run())
        self.assertEqual(HKAttendanceRecord.objects.count(), 0)

        with at(22, 5):
            self.assertIn('recorded 10 absent entries', run())   # 5 staff x 2 halves
            self.assertIn('recorded 0 absent entries', run())
        self.assertEqual(HKAttendanceRecord.objects.filter(status='absent').count(), 10)

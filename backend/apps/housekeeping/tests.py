import datetime
import importlib
from unittest.mock import patch

from django.apps import apps
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from .management.commands.seed_housekeeping import Command as SeedHousekeepingCommand
from .htmx_views import (
    dashboard_group_tag,
    effective_workers_for_area,
    get_today_records,
    progress_records,
    task_completion_sort_key,
)

add_ashok_canteen_gate_area = importlib.import_module(
    'apps.housekeeping.migrations.0024_add_ashok_canteen_gate_area'
).add_ashok_canteen_gate_area
from .models import (
    HKArea,
    HKAttendanceRecord,
    HKDailyRecord,
    HKRelieverSubstitution,
    HKScheduleTemplate,
    HKStaffAttendanceRecord,
    HKUserArea,
    HKWorker,
)


class HostelOfficeScopeAPITests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.client = APIClient()
        self.hostel_office = User.objects.create_user(
            username='hostel.office',
            password='pass',
            role='hostel_office',
        )
        self.hostel_area = HKArea.objects.create(name='Hostel A', area_type='hostel', is_active=True)
        self.academic_area = HKArea.objects.create(name='Academic Block 1', area_type='academic', is_active=True)
        self.hostel_staff = User.objects.create_user(
            username='hostel.supervisor',
            password='pass',
            role='supervisor',
            first_name='Hostel',
            last_name='Supervisor',
            phone='111',
            pay_code='H001',
        )
        self.hostel_reliever = User.objects.create_user(
            username='hostel.reliever',
            password='pass',
            role='caretaker',
            first_name='Hostel',
            last_name='Reliever',
        )
        self.academic_staff = User.objects.create_user(
            username='academic.supervisor',
            password='pass',
            role='supervisor',
            first_name='Academic',
            last_name='Supervisor',
        )
        HKUserArea.objects.create(user=self.hostel_staff, area=self.hostel_area)
        HKUserArea.objects.create(user=self.hostel_reliever, area=self.hostel_area)
        HKUserArea.objects.create(user=self.academic_staff, area=self.academic_area)
        self.client.force_authenticate(self.hostel_office)

    def test_hostel_office_cannot_switch_non_hostel_staff(self):
        url = reverse('hk-api-supervisor-switch', args=[self.academic_staff.id])

        response = self.client.post(url, {
            'target_staff': self.hostel_reliever.id,
            'mode': 'temporary',
            'date': '2026-06-03',
            'duration_days': 1,
        }, format='json')

        self.assertEqual(response.status_code, 403)

    def test_hostel_office_absent_csv_contains_only_hostel_rows(self):
        target_date = datetime.date(2026, 6, 3)
        hostel_worker = HKWorker.objects.create(
            name='Hostel Worker',
            area=self.hostel_area,
            worker_type='general',
            phone='222',
            pay_code='HW1',
        )
        academic_worker = HKWorker.objects.create(
            name='Academic Worker',
            area=self.academic_area,
            worker_type='general',
        )
        HKAttendanceRecord.objects.create(worker=hostel_worker, date=target_date, half='first', status='absent')
        HKAttendanceRecord.objects.create(worker=academic_worker, date=target_date, half='first', status='absent')
        HKStaffAttendanceRecord.objects.create(staff=self.hostel_staff, date=target_date, status='absent')
        HKStaffAttendanceRecord.objects.create(staff=self.academic_staff, date=target_date, status='absent')

        response = self.client.get(reverse('hk-api-absent-attendance-csv'), {'date': target_date.isoformat()})
        body = response.content.decode()

        self.assertEqual(response.status_code, 200)
        self.assertIn('Hostel Worker', body)
        self.assertIn('Hostel Supervisor', body)
        self.assertNotIn('Academic Worker', body)
        self.assertNotIn('Academic Supervisor', body)


class AcademicWeekendScheduleTests(TestCase):
    def setUp(self):
        self.area = HKArea.objects.create(
            name='Academic Block 1',
            area_type='academic',
            is_active=True,
        )
        self.worker = HKWorker.objects.create(
            name='Test Worker',
            area=self.area,
            worker_type='general',
            shift='day',
            is_active=True,
        )
        self.daily_templates = [
            self.template('Daily Floor Cleaning', 1, '08:00', '09:00', frequency='daily'),
            self.template('Daily Washroom Cleaning', 2, '09:00', '10:00', frequency='daily'),
        ]
        self.saturday_required = self.template(
            'Cobweb Cleaning',
            101,
            '10:00',
            '11:00',
            frequency='saturday_special',
        )
        self.sunday_required = self.template(
            'Washroom Deep Cleaning',
            101,
            '10:00',
            '11:00',
            frequency='sunday_extra',
        )
        self.saturday_optional = [
            self.template(name, 200 + idx, '11:00', '12:00', frequency='saturday_special', optional=True)
            for idx, name in enumerate(self.optional_task_names(), start=1)
        ]
        self.sunday_optional = [
            self.template(name, 200 + idx, '11:00', '12:00', frequency='sunday_extra', optional=True)
            for idx, name in enumerate(self.optional_task_names(), start=1)
        ]

    def template(self, name, order, start, end, frequency='daily', optional=False):
        return HKScheduleTemplate.objects.create(
            area=self.area,
            order=order,
            start_time=datetime.time.fromisoformat(start),
            end_time=datetime.time.fromisoformat(end),
            task_name=name,
            task_description='',
            worker_tag='all',
            requires_photo=True,
            frequency=frequency,
            is_optional_weekend_task=optional,
            is_active=True,
        )

    def optional_task_names(self):
        return [
            'Terrace Cleaning',
            'Dustbin Cleaning',
            'Dug Area Cleaning',
            'Shaft Area Cleaning',
            'Sofa & Chair Cleaning',
            'Fan & Light Cleaning',
            'Window Glass Cleaning',
        ]

    def names(self, records):
        return {record.schedule.task_name for record in records}

    def test_academic_weekday_schedule_ignores_weekend_templates(self):
        monday = datetime.date(2026, 5, 18)

        records = get_today_records(self.area, monday)

        self.assertEqual(len(records), len(self.daily_templates))
        self.assertEqual(self.names(records), {'Daily Floor Cleaning', 'Daily Washroom Cleaning'})

    def test_saturday_includes_required_cobweb_and_optional_pool(self):
        saturday = datetime.date(2026, 5, 23)

        records = get_today_records(self.area, saturday)

        self.assertIn('Cobweb Cleaning', self.names(records))
        for name in self.optional_task_names():
            self.assertIn(name, self.names(records))
        optional_records = [record for record in records if record.schedule.is_optional_weekend_task]
        self.assertEqual(len(optional_records), 7)
        self.assertEqual(len(progress_records(records)), len(self.daily_templates) + 1)

    def test_sunday_includes_required_washroom_deep_cleaning_and_optional_pool(self):
        sunday = datetime.date(2026, 5, 24)

        records = get_today_records(self.area, sunday)

        self.assertIn('Washroom Deep Cleaning', self.names(records))
        for name in self.optional_task_names():
            self.assertIn(name, self.names(records))
        optional_records = [record for record in records if record.schedule.is_optional_weekend_task]
        self.assertEqual(len(optional_records), 7)
        self.assertEqual(len(progress_records(records)), len(self.daily_templates) + 1)

    def test_optional_temporary_task_counts_after_selection_or_completion(self):
        saturday = datetime.date(2026, 5, 23)
        records = get_today_records(self.area, saturday)
        optional_record = next(record for record in records if record.schedule.task_name == 'Terrace Cleaning')

        self.assertEqual(len(progress_records(records)), len(self.daily_templates) + 1)

        optional_record.assigned_worker = self.worker
        optional_record.assigned_at = timezone.now()
        optional_record.save(update_fields=['assigned_worker', 'assigned_at'])
        records = get_today_records(self.area, saturday)
        self.assertEqual(len(progress_records(records)), len(self.daily_templates) + 2)

        optional_record = next(record for record in records if record.schedule.task_name == 'Terrace Cleaning')
        optional_record.status = 'done'
        optional_record.completed_at = timezone.now()
        optional_record.save(update_fields=['status', 'completed_at'])
        records = get_today_records(self.area, saturday)
        countable = progress_records(records)
        self.assertEqual(len(countable), len(self.daily_templates) + 2)
        self.assertEqual(sum(1 for record in countable if record.status == 'done'), 1)

    def test_optional_last_executed_metadata_and_sorting(self):
        sunday = datetime.date(2026, 5, 24)
        terrace_template = next(t for t in self.sunday_optional if t.task_name == 'Terrace Cleaning')
        dustbin_template = next(t for t in self.sunday_optional if t.task_name == 'Dustbin Cleaning')
        HKDailyRecord.objects.create(
            schedule=terrace_template,
            originating_template=terrace_template,
            area=self.area,
            date=datetime.date(2026, 5, 3),
            status='done',
        )
        HKDailyRecord.objects.create(
            schedule=dustbin_template,
            originating_template=dustbin_template,
            area=self.area,
            date=datetime.date(2026, 5, 17),
            status='done',
        )

        records = get_today_records(self.area, sunday)
        optional_records = [record for record in records if record.schedule.is_optional_weekend_task]
        by_name = {record.schedule.task_name: record for record in optional_records}

        self.assertEqual(by_name['Terrace Cleaning'].last_executed_date, datetime.date(2026, 5, 3))
        self.assertEqual(by_name['Dustbin Cleaning'].last_executed_date, datetime.date(2026, 5, 17))

        sorted_optional = sorted(optional_records, key=task_completion_sort_key)
        self.assertLess(
            sorted_optional.index(by_name['Terrace Cleaning']),
            sorted_optional.index(by_name['Dustbin Cleaning']),
        )


class HousekeepingAbsentAssignmentTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username='assign.supervisor',
            password='testpass',
            role='supervisor',
        )
        self.area = HKArea.objects.create(
            name='Hostel Test Area',
            area_type='hostel',
            is_active=True,
        )
        HKUserArea.objects.create(user=self.user, area=self.area)
        self.worker = HKWorker.objects.create(
            name='Absent Worker',
            area=self.area,
            worker_type='general',
            shift='day',
            is_active=True,
        )
        self.present_worker = HKWorker.objects.create(
            name='Present Worker',
            area=self.area,
            worker_type='general',
            shift='day',
            is_active=True,
        )
        self.schedule = HKScheduleTemplate.objects.create(
            area=self.area,
            order=1,
            start_time=datetime.time(9, 0),
            end_time=datetime.time(10, 0),
            task_name='Morning Cleaning',
            task_description='',
            worker_tag='all',
            requires_photo=False,
            frequency='daily',
            is_active=True,
        )
        self.record = HKDailyRecord.objects.create(
            schedule=self.schedule,
            originating_template=self.schedule,
            area=self.area,
            date=timezone.localdate(),
            status='pending',
        )
        self.client.force_login(self.user)

    def test_absent_worker_manual_assignment_is_rejected(self):
        HKAttendanceRecord.objects.create(
            worker=self.worker,
            date=self.record.date,
            half='first',
            status='absent',
            marked_by=self.user,
            is_submitted=True,
        )

        response = self.client.post(
            f'/housekeeping/task/{self.record.id}/mark/',
            {'action': 'assign', 'worker_id': str(self.worker.id)},
        )

        self.record.refresh_from_db()
        self.assertIsNone(self.record.assigned_worker_id)
        self.assertContains(response, 'This worker is absent or on leave for this task session.')

    def test_present_worker_assignment_is_allowed(self):
        HKAttendanceRecord.objects.create(
            worker=self.present_worker,
            date=self.record.date,
            half='first',
            status='present',
            marked_by=self.user,
            is_submitted=True,
        )

        response = self.client.post(
            f'/housekeeping/task/{self.record.id}/mark/',
            {'action': 'assign', 'worker_id': str(self.present_worker.id)},
        )

        self.record.refresh_from_db()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.record.assigned_worker_id, self.present_worker.id)

    def test_reliever_replaces_absent_worker_in_assignment_options(self):
        reliever_area = HKArea.objects.create(
            name='Hostels Reliever',
            area_type='hostel',
            is_active=True,
        )
        reliever = HKWorker.objects.create(
            name='Reliever Worker',
            area=reliever_area,
            worker_type='reliever',
            shift='day',
            is_active=True,
            is_reliever=True,
        )
        HKRelieverSubstitution.objects.create(
            original_worker=self.worker,
            reliever=reliever,
            date=self.record.date,
            area=self.area,
            assigned_by=self.user,
        )

        worker_ids = {worker.id for worker in effective_workers_for_area(self.area, self.record.date)}

        self.assertIn(reliever.id, worker_ids)
        self.assertNotIn(self.worker.id, worker_ids)


class HousekeepingAttendanceMarkingTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username='attendance.supervisor',
            password='pass',
            role='supervisor',
        )
        self.area = HKArea.objects.create(name='Aibaan', area_type='hostel', is_active=True)
        HKUserArea.objects.create(user=self.user, area=self.area)
        self.worker = HKWorker.objects.create(
            name='Attendance Worker',
            area=self.area,
            worker_type='general',
            is_active=True,
        )
        self.client.force_login(self.user)
        self.url = f'/housekeeping/attendance/?area={self.area.id}'

    def post_mark(self, status='present', half='first', htmx=True):
        headers = {'HTTP_HX_REQUEST': 'true'} if htmx else {}
        return self.client.post(self.url, {
            'action': 'mark',
            'half': half,
            'worker_id': self.worker.id,
            'status': status,
        }, **headers)

    @patch('apps.housekeeping.htmx_views.attendance_half_is_open', return_value=True)
    def test_tapping_same_unsubmitted_status_clears_record(self, _open):
        today = timezone.localdate()

        first = self.post_mark('present')
        second = self.post_mark('present')

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertFalse(HKAttendanceRecord.objects.filter(
            worker=self.worker,
            date=today,
            half='first',
        ).exists())
        self.assertContains(second, 'Not Marked')

    @patch('apps.housekeeping.htmx_views.attendance_half_is_open', return_value=True)
    def test_clear_action_removes_unsubmitted_record(self, _open):
        today = timezone.localdate()
        HKAttendanceRecord.objects.create(
            worker=self.worker,
            date=today,
            half='first',
            status='late',
            marked_by=self.user,
        )

        response = self.post_mark('clear')

        self.assertEqual(response.status_code, 200)
        self.assertFalse(HKAttendanceRecord.objects.filter(
            worker=self.worker,
            date=today,
            half='first',
        ).exists())
        self.assertContains(response, 'Not Marked')

    @patch('apps.housekeeping.htmx_views.attendance_half_is_open', return_value=True)
    def test_submitted_record_remains_locked(self, _open):
        today = timezone.localdate()
        record = HKAttendanceRecord.objects.create(
            worker=self.worker,
            date=today,
            half='first',
            status='absent',
            marked_by=self.user,
            is_submitted=True,
            submitted_at=timezone.now(),
        )

        response = self.post_mark('clear')

        record.refresh_from_db()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(record.status, 'absent')
        self.assertTrue(record.is_submitted)
        self.assertContains(response, 'Submitted')

    @patch('apps.housekeeping.htmx_views.attendance_half_is_open', return_value=True)
    def test_clear_does_not_remove_auto_created_second_half_present(self, _open):
        today = timezone.localdate()
        record = HKAttendanceRecord.objects.create(
            worker=self.worker,
            date=today,
            half='second',
            status='present',
            marked_by=self.user,
            note='Auto from first half',
        )

        response = self.post_mark('clear', half='second')

        record.refresh_from_db()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(record.status, 'present')
        self.assertEqual(record.note, 'Auto from first half')

    @patch('apps.housekeeping.htmx_views.attendance_half_is_open', return_value=False)
    def test_closed_half_rejects_mark_without_changing_record(self, _closed):
        today = timezone.localdate()
        record = HKAttendanceRecord.objects.create(
            worker=self.worker,
            date=today,
            half='first',
            status='present',
            marked_by=self.user,
        )

        response = self.post_mark('clear')

        record.refresh_from_db()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(record.status, 'present')


class HostelScheduleSeedTests(TestCase):
    hostel_names = [
        'Aibaan', 'Beauki', 'Chimair', 'Duven', 'Emiet', 'Firpeal',
        'Griwiksh', 'Hiqom', 'Ijokha', 'Jurqia', 'Kyzeel', 'Lekhaag',
    ]

    def setUp(self):
        self.areas = {
            name: HKArea.objects.create(name=name, area_type='hostel', is_active=True)
            for name in self.hostel_names
        }
        SeedHousekeepingCommand().seed_schedules()

    def active_templates(self):
        return HKScheduleTemplate.objects.filter(area__name__in=self.hostel_names, is_active=True)

    def test_seed_has_washroom_dusting_only_as_sunday_extra(self):
        daily_washroom_dusting = self.active_templates().filter(
            frequency='daily',
            task_name__iregex=r'(^|\s)Washroom Dusting$',
        )
        sunday_washroom_dusting = self.active_templates().filter(
            frequency='sunday_extra',
            task_name='Washroom Dusting',
        )

        self.assertFalse(daily_washroom_dusting.exists())
        self.assertEqual(sunday_washroom_dusting.count(), len(self.hostel_names))

    def test_seed_has_no_numbered_room_cleaning_for_regular_hostels(self):
        numbered_room_cleaning = self.active_templates().filter(
            frequency='daily',
            task_name__iregex=r'^\d+\s+Room Cleaning$',
        )

        self.assertFalse(numbered_room_cleaning.exists())

    def test_mobile_schedule_day_selection_matches_hostel_requirements(self):
        area = self.areas['Aibaan']

        monday_names = {record.schedule.task_name for record in get_today_records(area, datetime.date(2026, 6, 1))}
        sunday_names = {record.schedule.task_name for record in get_today_records(area, datetime.date(2026, 6, 7))}

        self.assertNotIn('Washroom Dusting', monday_names)
        self.assertIn('Washroom Dusting', sunday_names)
        self.assertIn('Room Cleaning', monday_names)

    def test_seed_rerun_preserves_completed_daily_records(self):
        area = self.areas['Aibaan']
        record = next(
            record
            for record in get_today_records(area, datetime.date(2026, 6, 1))
            if record.schedule.task_name == 'Room Cleaning'
        )
        record.status = 'done'
        record.save(update_fields=['status'])

        SeedHousekeepingCommand().seed_schedules()

        record.refresh_from_db()
        self.assertEqual(record.status, 'done')
        self.assertEqual(record.schedule.task_name, 'Room Cleaning')


class HostelScheduleCleanupCommandTests(TestCase):
    def setUp(self):
        self.area = HKArea.objects.create(name='Aibaan', area_type='hostel', is_active=True)

    def template(self, name, frequency='daily', order=1):
        return HKScheduleTemplate.objects.create(
            area=self.area,
            order=order,
            start_time=datetime.time(8, 0),
            end_time=datetime.time(8, 30),
            task_name=name,
            task_description='',
            worker_tag='all',
            requires_photo=True,
            frequency=frequency,
            is_active=True,
        )

    def test_cleanup_archives_daily_washroom_dusting_and_keeps_sunday_clean(self):
        daily = self.template('8 Washroom Dusting', order=1)
        self.template('8 Washroom Dusting', frequency='sunday_extra', order=2)

        call_command('apply_hostel_schedule_fixes')

        daily.refresh_from_db()
        self.assertFalse(daily.is_active)
        self.assertEqual(daily.worker_tag, 'archived')
        self.assertFalse(HKScheduleTemplate.objects.filter(
            area=self.area,
            is_active=True,
            frequency='daily',
            task_name__iregex=r'(^|\s)Washroom Dusting$',
        ).exists())
        self.assertEqual(HKScheduleTemplate.objects.filter(
            area=self.area,
            is_active=True,
            frequency='sunday_extra',
            task_name='Washroom Dusting',
        ).count(), 1)

    def test_cleanup_renames_numbered_room_cleaning_without_deleting_records(self):
        numbered = self.template('30 Room Cleaning', order=1)
        record = HKDailyRecord.objects.create(
            schedule=numbered,
            originating_template=numbered,
            area=self.area,
            date=datetime.date(2026, 6, 1),
            status='done',
        )

        call_command('apply_hostel_schedule_fixes')

        numbered.refresh_from_db()
        record.refresh_from_db()
        self.assertTrue(numbered.is_active)
        self.assertEqual(numbered.task_name, 'Room Cleaning')
        self.assertEqual(record.status, 'done')
        self.assertEqual(record.schedule.task_name, 'Room Cleaning')


class ResearchParkScheduleSeedTests(TestCase):
    def setUp(self):
        self.area = HKArea.objects.create(
            name='Research Park',
            area_type='research_park',
            is_active=True,
        )
        SeedHousekeepingCommand().seed_schedules()

    def records_for(self, year, month, day):
        return get_today_records(self.area, datetime.date(year, month, day))

    def test_weekday_research_park_has_only_permanent_floor_tasks(self):
        records = self.records_for(2026, 6, 1)

        self.assertEqual(len(records), 34)
        self.assertEqual(len(progress_records(records)), 32)
        self.assertEqual({record.schedule.frequency for record in records}, {'daily'})
        self.assertFalse(any(record.schedule.is_optional_weekend_task for record in records))
        self.assertEqual(
            {record.schedule.worker_tag for record in records},
            {'all', 'floor', 'room', 'washroom'},
        )
        self.assertEqual(
            sum(1 for record in records if record.schedule.task_name == 'Tea Break'),
            1,
        )
        self.assertEqual(
            sum(1 for record in records if record.schedule.task_name == 'Lunch Break'),
            1,
        )

    def test_saturday_research_park_has_permanent_and_optional_tasks(self):
        records = self.records_for(2026, 6, 6)
        optional_records = [record for record in records if record.schedule.is_optional_weekend_task]

        self.assertEqual(len(records), 13)
        self.assertEqual(len(optional_records), 4)
        self.assertEqual(len(progress_records(records)), 7)

        optional_records[0].status = 'in_progress'
        optional_records[0].save(update_fields=['status'])
        records = self.records_for(2026, 6, 6)

        self.assertEqual(len(progress_records(records)), 8)

    def test_sunday_research_park_has_exactly_nine_tasks(self):
        records = self.records_for(2026, 6, 7)

        self.assertEqual(len(records), 9)
        self.assertEqual({record.schedule.frequency for record in records}, {'sunday_extra'})

    def test_research_park_seed_has_no_worker_names_in_tasks(self):
        forbidden_names = [
            'dhaval',
            'mahesh',
            'shailesh',
            'sailesh',
            'dharmishta',
            'dharmishtaben',
        ]
        text = ' '.join(
            f'{template.task_name} {template.task_description}'
            for template in HKScheduleTemplate.objects.filter(area=self.area)
        ).lower()

        for name in forbidden_names:
            self.assertNotIn(name, text)

    def test_research_park_seed_can_rerun_without_duplicates(self):
        first_count = HKScheduleTemplate.objects.filter(area=self.area).count()

        SeedHousekeepingCommand().seed_schedules()

        self.assertEqual(HKScheduleTemplate.objects.filter(area=self.area).count(), first_count)


class HousekeepingDashboardGroupingTests(TestCase):
    def create_record(self, area, task_name, worker_tag='general', description=''):
        schedule = HKScheduleTemplate.objects.create(
            area=area,
            order=1,
            start_time=datetime.time(8, 0),
            end_time=datetime.time(9, 0),
            task_name=task_name,
            task_description=description,
            worker_tag=worker_tag,
            requires_photo=True,
            frequency='daily',
            is_active=True,
        )
        return HKDailyRecord.objects.create(
            schedule=schedule,
            area=area,
            date=datetime.date(2026, 6, 1),
        )

    def test_admin_created_general_canteen_gate_tasks_show_under_floor(self):
        area = HKArea.objects.create(
            name='Canteen, Gate-01 and Gate-02',
            area_type='guesthouse',
            is_active=True,
        )
        record = self.create_record(area, 'Gate No. 01 Cleaning', worker_tag='general')

        self.assertEqual(dashboard_group_tag(record, area), 'floor')

    def test_canteen_gate_migration_moves_general_templates_to_floor(self):
        User = get_user_model()
        User.objects.create_user(
            username='ashok.rathod',
            password='pass',
            role='supervisor',
        )
        area, _ = HKArea.objects.get_or_create(
            name='Canteen, Gate-01 and Gate-02',
            defaults={
                'area_type': 'guesthouse',
                'is_active': True,
            },
        )
        template = HKScheduleTemplate.objects.create(
            area=area,
            order=1,
            start_time=datetime.time(9, 30),
            end_time=datetime.time(11, 30),
            task_name='Gautam :Gate 01 and Gate 02 (Dusting, Sweeping, Mopping)',
            worker_tag='general',
            requires_photo=True,
            frequency='daily',
            is_active=True,
        )

        add_ashok_canteen_gate_area(apps, None)

        template.refresh_from_db()
        self.assertEqual(template.worker_tag, 'floor')
        self.assertTrue(HKUserArea.objects.filter(user__username='ashok.rathod', area=area).exists())

    def test_research_park_second_and_third_floor_tags_show_in_expected_tabs(self):
        area = HKArea.objects.create(
            name='Research Park',
            area_type='research_park',
            is_active=True,
        )
        second_floor = self.create_record(area, 'Second Floor Office Cleaning', worker_tag='general')
        third_floor = self.create_record(area, 'Third Floor Washroom Cleaning', worker_tag='3rd_floor')

        self.assertEqual(dashboard_group_tag(second_floor, area), 'room')
        self.assertEqual(dashboard_group_tag(third_floor, area), 'washroom')


class SupervisorRelieverIntegrationTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.eligible_supervisor = User.objects.create_user(
            username='bharat.solanki',
            password='pass',
            role='supervisor',
            first_name='Bharat Kumar',
            last_name='Solanki',
        )
        self.eligible_area = HKArea.objects.create(
            name='Sports Complex',
            area_type='sports',
            is_active=True,
        )
        HKUserArea.objects.create(user=self.eligible_supervisor, area=self.eligible_area)

        # Permanent workers in Sports Complex
        self.assigned_worker_1 = HKWorker.objects.create(
            name='Sports Worker One',
            pay_code='101',
            area=self.eligible_area,
            worker_type='general',
            shift='day',
            is_active=True,
        )
        self.assigned_worker_2 = HKWorker.objects.create(
            name='Sports Worker Two',
            pay_code='102',
            area=self.eligible_area,
            worker_type='general',
            shift='day',
            is_active=True,
        )

        # Ganesh Jayesh supervisor and his Deep Cleaning area
        self.ganesh_jayesh = User.objects.create_user(
            username='ganesh.jayesh',
            password='pass',
            role='supervisor',
            first_name='Ganesh',
            last_name='Jayesh',
        )
        self.deep_cleaning_area = HKArea.objects.create(
            name='Deep Cleaning',
            area_type='other',
            is_active=True,
        )
        HKUserArea.objects.create(user=self.ganesh_jayesh, area=self.deep_cleaning_area)

        # 5 relievers under Deep Cleaning / Ganesh Jayesh
        self.reliever_303, _ = HKWorker.objects.get_or_create(
            pay_code='303',
            defaults={
                'name': 'Vaghela Chirag M',
                'area': self.deep_cleaning_area,
                'supervisor': self.ganesh_jayesh,
                'worker_type': 'general',
                'shift': 'day',
                'is_active': True,
                'is_reliever': False,
            },
        )
        self.reliever_329, _ = HKWorker.objects.get_or_create(
            pay_code='329',
            defaults={
                'name': 'Parmar Vijay Kumar Chhaganbhai',
                'area': self.deep_cleaning_area,
                'supervisor': self.ganesh_jayesh,
                'worker_type': 'general',
                'shift': 'day',
                'is_active': True,
                'is_reliever': False,
            },
        )
        self.reliever_364, _ = HKWorker.objects.get_or_create(
            pay_code='364',
            defaults={
                'name': 'Makvana Nikhil Girishbhai',
                'area': self.deep_cleaning_area,
                'supervisor': self.ganesh_jayesh,
                'worker_type': 'general',
                'shift': 'day',
                'is_active': True,
                'is_reliever': False,
            },
        )
        self.reliever_389, _ = HKWorker.objects.get_or_create(
            pay_code='389',
            defaults={
                'name': 'Bhangi Sikandar D.',
                'area': self.deep_cleaning_area,
                'supervisor': self.ganesh_jayesh,
                'worker_type': 'general',
                'shift': 'day',
                'is_active': True,
                'is_reliever': False,
            },
        )
        self.reliever_455, _ = HKWorker.objects.get_or_create(
            pay_code='455',
            defaults={
                'name': 'Sunil R. Vaghela',
                'area': self.deep_cleaning_area,
                'supervisor': self.ganesh_jayesh,
                'worker_type': 'general',
                'shift': 'day',
                'is_active': True,
                'is_reliever': False,
            },
        )
        # 6th reliever (Vankar Vishalkumar Aravindbhai, pay_code 494)
        self.reliever_494, _ = HKWorker.objects.get_or_create(
            pay_code='494',
            defaults={
                'name': 'Vankar Vishalkumar Aravindbhai',
                'worker_type': 'reliever',
                'shift': 'day',
                'is_active': True,
                'is_reliever': True,
                'area': None,
                'supervisor': None,
            },
        )

        # Task schedule in Sports Complex
        self.schedule = HKScheduleTemplate.objects.create(
            area=self.eligible_area,
            order=1,
            start_time=datetime.time(9, 0),
            end_time=datetime.time(10, 0),
            task_name='Badminton Court Cleaning',
            task_description='',
            worker_tag='general',
            requires_photo=False,
            frequency='daily',
            is_active=True,
        )
        self.today = timezone.localdate()
        self.record = HKDailyRecord.objects.create(
            schedule=self.schedule,
            originating_template=self.schedule,
            area=self.eligible_area,
            date=self.today,
            status='pending',
        )

    def test_eligible_supervisor_attendance_reliever_list_and_numerical_sorting(self):
        from apps.housekeeping.htmx_views import _attendance_relievers_for_area, worker_paycode_sort_key

        relievers = list(_attendance_relievers_for_area(self.eligible_area, user=self.eligible_supervisor))
        self.assertEqual(len(relievers), 6)
        paycodes = [int(r.pay_code) for r in relievers]
        self.assertEqual(paycodes, [303, 329, 364, 389, 455, 494])

        # Verify exact spelling of Bhangi Sikandar D.
        bhangi = next(r for r in relievers if r.pay_code == '389')
        self.assertEqual(bhangi.name, 'Bhangi Sikandar D.')

        # Set phone numbers to verify they are omitted from dropdown options
        self.reliever_303.phone = '7698612890'
        self.reliever_303.save(update_fields=['phone'])
        self.reliever_455.phone = '9023986019'
        self.reliever_455.save(update_fields=['phone'])

        # Verify attendance page loads and contains all 6 relievers with exact expected labels
        self.client.force_login(self.eligible_supervisor)
        resp = self.client.get(f'/housekeeping/attendance/?area={self.eligible_area.id}&date={self.today}')
        self.assertEqual(resp.status_code, 200)

        expected_options = [
            'Vaghela Chirag M · Deep Cleaning · #303',
            'Parmar Vijay Kumar Chhaganbhai · Deep Cleaning · #329',
            'Makvana Nikhil Girishbhai · Deep Cleaning · #364',
            'Bhangi Sikandar D. · Deep Cleaning · #389',
            'Sunil R. Vaghela · Deep Cleaning · #455',
            'Vankar Vishalkumar Aravindbhai · Deep Cleaning · #494',
        ]
        content = resp.content.decode('utf-8')
        last_pos = -1
        for opt in expected_options:
            self.assertIn(opt, content)
            pos = content.find(opt)
            self.assertGreater(pos, last_pos, f"Option '{opt}' is out of order")
            last_pos = pos

        # Verify phone numbers do not appear in reliever dropdown options
        self.assertNotIn('7698612890', content)
        self.assertNotIn('9023986019', content)

    def test_reliever_replacement_in_attendance_and_assignment_in_assign_team(self):
        self.client.force_login(self.eligible_supervisor)

        # 1. Replace assigned_worker_1 with Sunil R. Vaghela (pay_code 455)
        post_data = {
            'original_worker_id': str(self.assigned_worker_1.id),
            'reliever_id': str(self.reliever_455.id),
            'area_id': str(self.eligible_area.id),
            'note': 'Worker on leave',
        }
        resp = self.client.post('/housekeeping/attendance/assign-reliever/', post_data, HTTP_HX_REQUEST='true')
        self.assertEqual(resp.status_code, 200)

        # Verify substitution saved in DB
        sub = HKRelieverSubstitution.objects.filter(
            original_worker=self.assigned_worker_1,
            date=self.today,
            area=self.eligible_area,
        ).first()
        self.assertIsNotNone(sub)
        self.assertEqual(sub.reliever, self.reliever_455)

        # Verify original worker marked Leave
        att = HKAttendanceRecord.objects.filter(worker=self.assigned_worker_1, date=self.today, half='first').first()
        self.assertEqual(att.status, 'leave')
        self.assertIn('Sunil R. Vaghela', att.note)

        # Verify reliever marked Present
        rel_att = HKAttendanceRecord.objects.filter(worker=self.reliever_455, date=self.today, half='first').first()
        self.assertEqual(rel_att.status, 'present')

        # 2. Open Home page (dashboard) and check effective workers for area
        resp = self.client.get(f'/housekeeping/dashboard/?area={self.eligible_area.id}')
        self.assertEqual(resp.status_code, 200)
        from apps.housekeeping.htmx_views import effective_workers_for_area
        eff_workers = effective_workers_for_area(self.eligible_area, self.today)
        eff_ids = [w.id for w in eff_workers]
        self.assertIn(self.reliever_455.id, eff_ids)
        self.assertNotIn(self.assigned_worker_1.id, eff_ids)

        # Verify workers are displayed in ascending numerical paycode order: 102, 455
        eff_paycodes = [int(w.pay_code) for w in eff_workers if w.pay_code]
        self.assertEqual(eff_paycodes, sorted(eff_paycodes))

        # 3. Assign team to task with the reliever
        assign_resp = self.client.post(
            f'/housekeeping/task/{self.record.id}/mark/',
            {'action': 'assign', 'worker_ids': [str(self.reliever_455.id)]},
            HTTP_HX_REQUEST='true',
        )
        self.assertEqual(assign_resp.status_code, 200)
        self.record.refresh_from_db()
        self.assertEqual(self.record.assigned_worker_id, self.reliever_455.id)
        from apps.housekeeping.models import HKTaskWorkerAssignment
        self.assertTrue(
            HKTaskWorkerAssignment.objects.filter(daily_record=self.record, worker=self.reliever_455).exists()
        )

    def test_area_based_exclusions(self):
        User = get_user_model()
        excluded_area_names = [
            'Canteen, Gate-01 and Gate-02',
            'Guest House New',
            'Director Bungalow',
            'Research Park',
            'Old Guest House',
        ]
        from apps.housekeeping.htmx_views import _attendance_relievers_for_area

        for area_name in excluded_area_names:
            area, _ = HKArea.objects.get_or_create(
                name=area_name,
                defaults={'area_type': 'guesthouse', 'is_active': True},
            )
            sup = User.objects.create_user(
                username=f'sup_{area.id}',
                password='pass',
                role='supervisor',
            )
            HKUserArea.objects.create(user=sup, area=area)
            worker = HKWorker.objects.create(
                name=f'Worker in {area_name}',
                pay_code='999',
                area=area,
                shift='day',
                is_active=True,
            )

            # Relievers list should be empty
            relievers = list(_attendance_relievers_for_area(area, user=sup))
            self.assertEqual(len(relievers), 0, f"Area {area_name} should have 0 relievers")

            # Backend POST assign-reliever should reject with 400 Bad Request
            self.client.force_login(sup)
            resp = self.client.post(
                '/housekeeping/attendance/assign-reliever/',
                {
                    'original_worker_id': str(worker.id),
                    'reliever_id': str(self.reliever_303.id),
                    'area_id': str(area.id),
                },
            )
            self.assertEqual(resp.status_code, 400)

    def test_ganesh_jayesh_exclusion(self):
        from apps.housekeeping.htmx_views import _attendance_relievers_for_area, effective_workers_for_area

        # 1. Check relievers list is empty for Ganesh Jayesh
        relievers = list(_attendance_relievers_for_area(self.deep_cleaning_area, user=self.ganesh_jayesh))
        self.assertEqual(len(relievers), 0)

        # 2. Check Attendance page for Ganesh Jayesh has no reliever option
        self.client.force_login(self.ganesh_jayesh)
        resp = self.client.get(f'/housekeeping/attendance/?area={self.deep_cleaning_area.id}&date={self.today}')
        self.assertEqual(resp.status_code, 200)
        self.assertNotContains(resp, '🔄 Reliever')
        self.assertNotContains(resp, 'reliever_id')

        # 3. Check POST to assign-reliever is rejected
        worker = HKWorker.objects.filter(area=self.deep_cleaning_area).first()
        post_resp = self.client.post(
            '/housekeeping/attendance/assign-reliever/',
            {
                'original_worker_id': str(worker.id),
                'reliever_id': str(self.reliever_494.id),
                'area_id': str(self.deep_cleaning_area.id),
            },
        )
        self.assertEqual(post_resp.status_code, 400)

        # 4. Check existing worker list under Ganesh Jayesh contains exactly 5 workers
        workers = effective_workers_for_area(self.deep_cleaning_area, self.today)
        self.assertEqual(len(workers), 5)
        worker_paycodes = {w.pay_code for w in workers}
        self.assertEqual(worker_paycodes, {'303', '329', '364', '389', '455'})
        self.assertNotIn('494', worker_paycodes)

    def test_caretaker_reliever_functionality_preserved(self):
        User = get_user_model()
        caretaker = User.objects.create_user(
            username='caretaker_test',
            password='pass',
            role='caretaker',
        )
        hostel_reliever_area, _ = HKArea.objects.get_or_create(
            name='Hostels Reliever',
            defaults={'area_type': 'hostel', 'is_active': True},
        )
        hostel_reliever = HKWorker.objects.create(
            name='Hostel Reliever One',
            pay_code='777',
            area=hostel_reliever_area,
            worker_type='reliever',
            shift='day',
            is_active=True,
            is_reliever=True,
        )
        hostel_area = HKArea.objects.create(
            name='Beauki',
            area_type='hostel',
            is_active=True,
        )
        HKUserArea.objects.create(user=caretaker, area=hostel_area)

        from apps.housekeeping.htmx_views import _attendance_relievers_for_area
        caretaker_relievers = list(_attendance_relievers_for_area(hostel_area, user=caretaker))
        # Preserves caretaker relievers from Hostels Reliever area
        self.assertTrue(any(r.id == hostel_reliever.id for r in caretaker_relievers))


class HostelCommonAreaRelieverManagementTests(TestCase):
    def setUp(self):
        import datetime
        from django.contrib.auth import get_user_model
        from apps.housekeeping.models import (
            HKArea, HKDailyRecord, HKRelieverSubstitution, HKScheduleTemplate,
            HKUserArea, HKWorker, HKAttendanceRecord
        )
        User = get_user_model()
        self.today = timezone.localdate()

        self.caretaker = User.objects.create_user(
            username='vishwajeet.mishra.test',
            password='pass',
            role='caretaker',
            first_name='Vishwajeet',
            last_name='Mishra',
        )
        self.common_area = HKArea.objects.create(
            name='Hostel Common Area',
            area_type='hostel',
            is_active=True,
        )
        HKUserArea.objects.create(user=self.caretaker, area=self.common_area)

        self.jrha_area = HKArea.objects.create(
            name='Block-D JRHA',
            area_type='hostel',
            is_active=True,
        )

        # 6 Workers registered in the system:
        # Paycodes: 80, 100, 240, 457, 459, 472
        self.w_80 = HKWorker.objects.create(
            name='Yogesh Vaghela',
            pay_code='80',
            area=self.common_area,
            worker_type='general',
            shift='day',
            is_active=True,
            is_reliever=False,
        )
        self.w_100 = HKWorker.objects.create(
            name='Ketan Gujjar',
            pay_code='100',
            area=self.common_area,
            worker_type='general',
            shift='day',
            is_active=True,
            is_reliever=False,
        )
        self.w_240 = HKWorker.objects.create(
            name='Vinayak Solanki',
            pay_code='240',
            area=self.common_area,
            worker_type='general',
            shift='day',
            is_active=True,
            is_reliever=False,
        )
        self.w_457 = HKWorker.objects.create(
            name='Bhavika',
            pay_code='457',
            area=self.jrha_area,
            worker_type='general',
            shift='day',
            is_active=True,
            is_reliever=False,
        )
        self.w_459 = HKWorker.objects.create(
            name='Urvashi',
            pay_code='459',
            area=self.jrha_area,
            worker_type='general',
            shift='day',
            is_active=True,
            is_reliever=False,
        )
        self.w_472 = HKWorker.objects.create(
            name='Suresh Solanki',
            pay_code='472',
            area=self.common_area,
            worker_type='general',
            shift='day',
            is_active=True,
            is_reliever=False,
        )

        # Create schedule templates for testing task time overlaps
        self.tmpl_morning = HKScheduleTemplate.objects.create(
            area=self.common_area,
            start_time=datetime.time(9, 0),
            end_time=datetime.time(10, 0),
            task_name='Office Cleaning',
            worker_tag='all',
            frequency='daily',
            order=1,
        )
        self.tmpl_morning_overlap = HKScheduleTemplate.objects.create(
            area=self.common_area,
            start_time=datetime.time(9, 30),
            end_time=datetime.time(10, 30),
            task_name='Washroom Cleaning',
            worker_tag='all',
            frequency='daily',
            order=2,
        )
        self.tmpl_afternoon = HKScheduleTemplate.objects.create(
            area=self.common_area,
            start_time=datetime.time(14, 0),
            end_time=datetime.time(15, 0),
            task_name='Terrace Cleaning',
            worker_tag='all',
            frequency='daily',
            order=3,
        )

    def test_dropdown_displays_six_workers_actual_names_and_numerical_order(self):
        from apps.housekeeping.htmx_views import _attendance_relievers_for_area

        relievers = list(_attendance_relievers_for_area(self.common_area, user=self.caretaker))
        self.assertEqual(len(relievers), 6)
        paycodes = [int(r.pay_code) for r in relievers]
        # Must be in ascending numerical paycode order: 80, 100, 240, 457, 459, 472
        self.assertEqual(paycodes, [80, 100, 240, 457, 459, 472])
        self.assertNotIn(60, paycodes)
        self.assertIn(80, paycodes)

        # Names must be actual names from DB
        names = [r.name for r in relievers]
        self.assertEqual(names, [
            'Yogesh Vaghela',
            'Ketan Gujjar',
            'Vinayak Solanki',
            'Bhavika',
            'Urvashi',
            'Suresh Solanki',
        ])

        # Test attendance view rendering for caretaker
        self.client.force_login(self.caretaker)
        resp = self.client.get(f'/housekeeping/attendance/?area={self.common_area.id}&date={self.today}')
        self.assertEqual(resp.status_code, 200)
        content = resp.content.decode('utf-8')

        # Check placeholder
        self.assertIn('— Choose reliever —', content)

        # Check that all 6 options appear in ascending order
        expected_options = [
            'Yogesh Vaghela · Hostel Common Area · #80',
            'Ketan Gujjar · Hostel Common Area · #100',
            'Vinayak Solanki · Hostel Common Area · #240',
            'Bhavika · Block-D JRHA · #457',
            'Urvashi · Block-D JRHA · #459',
            'Suresh Solanki · Hostel Common Area · #472',
        ]
        last_pos = -1
        for opt in expected_options:
            self.assertIn(opt, content)
            pos = content.find(opt)
            self.assertGreater(pos, last_pos, f"Option '{opt}' is out of order")
            last_pos = pos

    def test_available_worker_assignment_success(self):
        self.client.force_login(self.caretaker)
        post_data = {
            'original_worker_id': str(self.w_80.id),
            'reliever_id': str(self.w_240.id),
            'area_id': str(self.common_area.id),
            'note': 'Sick leave',
        }
        resp = self.client.post('/housekeeping/attendance/assign-reliever/', post_data, HTTP_HX_REQUEST='true')
        self.assertEqual(resp.status_code, 200)

        # Verify substitution saved in DB
        from apps.housekeeping.models import HKRelieverSubstitution, HKAttendanceRecord
        sub = HKRelieverSubstitution.objects.filter(
            original_worker=self.w_80,
            date=self.today,
            area=self.common_area,
        ).first()
        self.assertIsNotNone(sub)
        self.assertEqual(sub.reliever, self.w_240)

        # Original worker auto-marked as leave
        att = HKAttendanceRecord.objects.filter(worker=self.w_80, date=self.today, half='first').first()
        self.assertEqual(att.status, 'leave')
        self.assertIn('Vinayak Solanki', att.note)

        # Reliever marked present
        rel_att = HKAttendanceRecord.objects.filter(worker=self.w_240, date=self.today, half='first').first()
        self.assertEqual(rel_att.status, 'present')

    def test_busy_worker_displayed_with_busy_label_and_disabled(self):
        from apps.housekeeping.models import HKDailyRecord, HKRelieverSubstitution
        # w_80 has an active task from 09:00 to 10:00
        task_80 = HKDailyRecord.objects.create(
            schedule=self.tmpl_morning,
            area=self.common_area,
            date=self.today,
            status='pending',
            assigned_worker=self.w_80,
        )

        # Assign w_240 as reliever for w_80
        self.client.force_login(self.caretaker)
        self.client.post('/housekeeping/attendance/assign-reliever/', {
            'original_worker_id': str(self.w_80.id),
            'reliever_id': str(self.w_240.id),
            'area_id': str(self.common_area.id),
        }, HTTP_HX_REQUEST='true')

        # w_100 has an overlapping active task from 09:30 to 10:30
        task_100 = HKDailyRecord.objects.create(
            schedule=self.tmpl_morning_overlap,
            area=self.common_area,
            date=self.today,
            status='pending',
            assigned_worker=self.w_100,
        )

        resp = self.client.get(f'/housekeeping/attendance/?area={self.common_area.id}&date={self.today}')
        self.assertEqual(resp.status_code, 200)
        content = resp.content.decode('utf-8')

        # w_240 should have Busy label and be disabled
        self.assertIn('Vinayak Solanki · Hostel Common Area · #240 · Busy', content)
        self.assertIn(f'value="{self.w_240.id}" disabled', content)

        # w_457 is free and should remain selectable without Busy
        self.assertIn('Bhavika · Block-D JRHA · #457', content)
        self.assertNotIn('Bhavika · Block-D JRHA · #457 · Busy', content)
        self.assertIn(f'value="{self.w_457.id}">', content)

    def test_backend_rejects_conflicting_assignment_bypassing_ui(self):
        from apps.housekeeping.models import HKDailyRecord
        # w_80 has active morning task (09:00 - 10:00)
        HKDailyRecord.objects.create(
            schedule=self.tmpl_morning,
            area=self.common_area,
            date=self.today,
            status='in_progress',
            assigned_worker=self.w_80,
        )
        self.client.force_login(self.caretaker)
        self.client.post('/housekeeping/attendance/assign-reliever/', {
            'original_worker_id': str(self.w_80.id),
            'reliever_id': str(self.w_240.id),
            'area_id': str(self.common_area.id),
        })

        # w_100 has overlapping active task (09:30 - 10:30)
        HKDailyRecord.objects.create(
            schedule=self.tmpl_morning_overlap,
            area=self.common_area,
            date=self.today,
            status='pending',
            assigned_worker=self.w_100,
        )

        # Directly attempt to assign w_240 to w_100
        post_resp = self.client.post('/housekeeping/attendance/assign-reliever/', {
            'original_worker_id': str(self.w_100.id),
            'reliever_id': str(self.w_240.id),
            'area_id': str(self.common_area.id),
        })
        self.assertEqual(post_resp.status_code, 400)
        self.assertIn(b'conflicting active task', post_resp.content)

    def test_availability_restored_when_task_completed_or_cancelled(self):
        from apps.housekeeping.models import HKDailyRecord
        task_80 = HKDailyRecord.objects.create(
            schedule=self.tmpl_morning,
            area=self.common_area,
            date=self.today,
            status='in_progress',
            assigned_worker=self.w_80,
        )
        self.client.force_login(self.caretaker)
        self.client.post('/housekeeping/attendance/assign-reliever/', {
            'original_worker_id': str(self.w_80.id),
            'reliever_id': str(self.w_240.id),
            'area_id': str(self.common_area.id),
        })

        task_100 = HKDailyRecord.objects.create(
            schedule=self.tmpl_morning_overlap,
            area=self.common_area,
            date=self.today,
            status='pending',
            assigned_worker=self.w_100,
        )

        # Mark task_80 as done
        task_80.refresh_from_db()
        task_80.status = 'done'
        task_80.save(update_fields=['status'])

        # w_240 should now be available again for w_100!
        resp = self.client.get(f'/housekeeping/attendance/?area={self.common_area.id}&date={self.today}')
        content = resp.content.decode('utf-8')
        self.assertNotIn('Vinayak Solanki · Hostel Common Area · #240 · Busy', content)

        # Assigning w_240 to w_100 now succeeds
        assign_resp = self.client.post('/housekeeping/attendance/assign-reliever/', {
            'original_worker_id': str(self.w_100.id),
            'reliever_id': str(self.w_240.id),
            'area_id': str(self.common_area.id),
        }, HTTP_HX_REQUEST='true')
        self.assertEqual(assign_resp.status_code, 200)

    def test_non_overlapping_task_assignments_remain_possible(self):
        from apps.housekeeping.models import HKDailyRecord
        # w_80 has morning task (09:00 - 10:00)
        HKDailyRecord.objects.create(
            schedule=self.tmpl_morning,
            area=self.common_area,
            date=self.today,
            status='in_progress',
            assigned_worker=self.w_80,
        )
        self.client.force_login(self.caretaker)
        self.client.post('/housekeeping/attendance/assign-reliever/', {
            'original_worker_id': str(self.w_80.id),
            'reliever_id': str(self.w_240.id),
            'area_id': str(self.common_area.id),
        })

        # w_100 has afternoon non-overlapping task (14:00 - 15:00)
        HKDailyRecord.objects.create(
            schedule=self.tmpl_afternoon,
            area=self.common_area,
            date=self.today,
            status='pending',
            assigned_worker=self.w_100,
        )

        # w_240 is NOT busy for w_100's afternoon task
        assign_resp = self.client.post('/housekeeping/attendance/assign-reliever/', {
            'original_worker_id': str(self.w_100.id),
            'reliever_id': str(self.w_240.id),
            'area_id': str(self.common_area.id),
        }, HTTP_HX_REQUEST='true')
        self.assertEqual(assign_resp.status_code, 200)

    def test_inter_area_conflicting_active_task_marks_reliever_busy(self):
        from apps.housekeeping.models import HKDailyRecord
        # w_457 has active morning task in Block-D JRHA (09:00 - 10:00)
        tmpl_jrha = HKScheduleTemplate.objects.create(
            area=self.jrha_area,
            start_time=datetime.time(9, 0),
            end_time=datetime.time(10, 0),
            task_name='JRHA Cleaning',
            worker_tag='all',
            frequency='daily',
            order=1,
        )
        HKDailyRecord.objects.create(
            schedule=tmpl_jrha,
            area=self.jrha_area,
            date=self.today,
            status='in_progress',
            assigned_worker=self.w_457,
        )

        # w_80 in Hostel Common Area has conflicting morning task
        HKDailyRecord.objects.create(
            schedule=self.tmpl_morning,
            area=self.common_area,
            date=self.today,
            status='pending',
            assigned_worker=self.w_80,
        )

        # w_457 should appear as Busy in Hostel Common Area
        self.client.force_login(self.caretaker)
        resp = self.client.get(f'/housekeeping/attendance/?area={self.common_area.id}&date={self.today}')
        content = resp.content.decode('utf-8')
        self.assertIn('Bhavika · Block-D JRHA · #457 · Busy', content)

        # Direct attempt to assign w_457 must be rejected with 400
        post_resp = self.client.post('/housekeeping/attendance/assign-reliever/', {
            'original_worker_id': str(self.w_80.id),
            'reliever_id': str(self.w_457.id),
            'area_id': str(self.common_area.id),
        })
        self.assertEqual(post_resp.status_code, 400)

    def test_worker_cannot_relieve_themselves(self):
        self.client.force_login(self.caretaker)
        post_resp = self.client.post('/housekeeping/attendance/assign-reliever/', {
            'original_worker_id': str(self.w_240.id),
            'reliever_id': str(self.w_240.id),
            'area_id': str(self.common_area.id),
        })
        self.assertEqual(post_resp.status_code, 400)


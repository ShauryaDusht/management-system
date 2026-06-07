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
        area = HKArea.objects.create(
            name='Canteen, Gate-01 and Gate-02',
            area_type='guesthouse',
            is_active=True,
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

import datetime

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from .management.commands.seed_housekeeping import Command as SeedHousekeepingCommand
from .htmx_views import effective_workers_for_area, get_today_records, progress_records, task_completion_sort_key
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

        self.assertEqual(len(records), 40)
        self.assertEqual({record.schedule.frequency for record in records}, {'daily'})
        self.assertFalse(any(record.schedule.is_optional_weekend_task for record in records))
        self.assertEqual(
            {record.schedule.worker_tag for record in records},
            {'floor', 'room', 'washroom'},
        )

    def test_saturday_research_park_has_permanent_and_optional_tasks(self):
        records = self.records_for(2026, 6, 6)
        optional_records = [record for record in records if record.schedule.is_optional_weekend_task]

        self.assertEqual(len(records), 13)
        self.assertEqual(len(optional_records), 4)
        self.assertEqual(len(progress_records(records)), 9)

        optional_records[0].status = 'in_progress'
        optional_records[0].save(update_fields=['status'])
        records = self.records_for(2026, 6, 6)

        self.assertEqual(len(progress_records(records)), 10)

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

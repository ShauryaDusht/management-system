import datetime

from django.test import TestCase
from django.utils import timezone

from .htmx_views import get_today_records, progress_records, task_completion_sort_key
from .models import HKArea, HKDailyRecord, HKScheduleTemplate, HKWorker


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

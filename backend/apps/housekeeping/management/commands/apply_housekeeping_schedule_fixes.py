import datetime

from django.core.management.base import BaseCommand

from apps.housekeeping.models import HKArea, HKScheduleTemplate, HKWorker


HOSTEL_NAMES = [
    'Aibaan', 'Beauki', 'Chimair', 'Duven', 'Emiet', 'Firpeal',
    'Griwiksh', 'Hiqom', 'Ijokha', 'Jurqia', 'Kyzeel', 'Lekhaag',
]


def time_after(start_time, minutes):
    start_dt = datetime.datetime.combine(datetime.date.today(), start_time)
    return (start_dt + datetime.timedelta(minutes=minutes)).time()


class Command(BaseCommand):
    help = 'Apply non-destructive housekeeping schedule corrections to existing production data.'

    def handle(self, *args, **options):
        hostel_result = self.fix_hostel_templates()
        research_result = self.fix_research_park_breaks()
        kunal_result = self.move_kunal_to_new_academic_reliever()

        self.stdout.write(self.style.SUCCESS(
            'Housekeeping schedule fixes applied: '
            f'{hostel_result}; {research_result}; {kunal_result}.'
        ))

    def fix_hostel_templates(self):
        hostels = HKArea.objects.filter(name__in=HOSTEL_NAMES, is_active=True)
        disabled_washroom = 0
        created_sunday = 0
        renamed_rooms = 0

        for area in hostels:
            washroom_daily = HKScheduleTemplate.objects.filter(
                area=area,
                is_active=True,
                frequency='daily',
                task_name__iregex=r'(^|\s)Washroom Dusting$',
            )
            if washroom_daily.exists():
                disabled_washroom += washroom_daily.update(is_active=False)
                sunday_exists = HKScheduleTemplate.objects.filter(
                    area=area,
                    is_active=True,
                    frequency='sunday_extra',
                    task_name__iexact='Washroom Dusting',
                ).exists()
                if not sunday_exists:
                    HKScheduleTemplate.objects.create(
                        area=area,
                        order=90,
                        start_time=datetime.time(9, 0),
                        end_time=datetime.time(9, 30),
                        task_name='Washroom Dusting',
                        task_description='Sunday / Weekly',
                        worker_tag='all',
                        requires_photo=True,
                        frequency='sunday_extra',
                        is_active=True,
                    )
                    created_sunday += 1

            for template in HKScheduleTemplate.objects.filter(
                area=area,
                is_active=True,
                frequency='daily',
                task_name__iregex=r'^\d+\s+Room Cleaning$',
            ):
                template.task_name = 'Room Cleaning'
                template.save(update_fields=['task_name'])
                renamed_rooms += 1

        return (
            f'hostels disabled {disabled_washroom} daily washroom-dusting templates, '
            f'created {created_sunday} Sunday washroom-dusting templates, '
            f'renamed {renamed_rooms} numbered room-cleaning templates'
        )

    def fix_research_park_breaks(self):
        area = HKArea.objects.filter(name='Research Park', is_active=True).first()
        if not area:
            return 'Research Park not found'

        deactivated = 0
        fixed = 0
        for label, minutes, start_time in (
            ('Tea Break', 15, datetime.time(10, 30)),
            ('Lunch Break', 60, datetime.time(13, 0)),
        ):
            templates = list(
                HKScheduleTemplate.objects.filter(
                    area=area,
                    frequency='daily',
                    is_active=True,
                    task_name__icontains=label,
                ).order_by('start_time', 'order', 'id')
            )
            if not templates:
                HKScheduleTemplate.objects.create(
                    area=area,
                    order=98 if label == 'Tea Break' else 99,
                    start_time=start_time,
                    end_time=time_after(start_time, minutes),
                    task_name=label,
                    task_description='Days: Monday to Friday',
                    worker_tag='all',
                    requires_photo=False,
                    frequency='daily',
                    is_active=True,
                )
                fixed += 1
                continue

            keep = templates[0]
            keep.task_name = label
            keep.start_time = start_time
            keep.end_time = time_after(start_time, minutes)
            keep.worker_tag = 'all'
            keep.requires_photo = False
            keep.save(update_fields=['task_name', 'start_time', 'end_time', 'worker_tag', 'requires_photo'])
            fixed += 1

            for template in templates[1:]:
                template.is_active = False
                template.requires_photo = False
                template.save(update_fields=['is_active', 'requires_photo'])
                deactivated += 1

        return f'Research Park fixed {fixed} break templates and deactivated {deactivated} duplicate breaks'

    def move_kunal_to_new_academic_reliever(self):
        target_area = HKArea.objects.filter(name='New Academic Reliever', is_active=True).first()
        if not target_area:
            return 'New Academic Reliever not found'

        updated = 0
        workers = HKWorker.objects.filter(pay_code='390')
        for worker in workers:
            changed = False
            if worker.area_id != target_area.id:
                worker.area = target_area
                changed = True
            if worker.worker_type != 'reliever':
                worker.worker_type = 'reliever'
                changed = True
            if not worker.is_reliever:
                worker.is_reliever = True
                changed = True
            if changed:
                worker.save(update_fields=['area', 'worker_type', 'is_reliever'])
                updated += 1
        return f'moved {updated} Kunal/paycode-390 worker rows to New Academic Reliever'

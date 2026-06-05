import datetime

from django.core.management.base import BaseCommand

from apps.housekeeping.models import HKArea, HKScheduleTemplate


HOSTEL_NAMES = [
    'Aibaan', 'Beauki', 'Chimair', 'Duven', 'Emiet', 'Firpeal',
    'Griwiksh', 'Hiqom', 'Ijokha', 'Jurqia', 'Kyzeel', 'Lekhaag',
    'Beuaki',
]


class Command(BaseCommand):
    help = 'Apply non-destructive hostel-only housekeeping schedule corrections.'

    def handle(self, *args, **options):
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
                disabled_washroom += washroom_daily.update(is_active=False, worker_tag='archived')

            numbered_sunday = HKScheduleTemplate.objects.filter(
                area=area,
                is_active=True,
                frequency='sunday_extra',
                task_name__iregex=r'^\d+\s+Washroom Dusting$',
            )
            if numbered_sunday.exists():
                first = numbered_sunday.order_by('order', 'start_time', 'id').first()
                first.task_name = 'Washroom Dusting'
                first.save(update_fields=['task_name'])
                numbered_sunday.exclude(pk=first.pk).update(is_active=False, worker_tag='archived')

            sunday_templates = list(HKScheduleTemplate.objects.filter(
                area=area,
                is_active=True,
                frequency='sunday_extra',
                task_name__iexact='Washroom Dusting',
            ).order_by('order', 'start_time', 'id'))
            if not sunday_templates:
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
            elif len(sunday_templates) > 1:
                for duplicate in sunday_templates[1:]:
                    duplicate.is_active = False
                    duplicate.worker_tag = 'archived'
                    duplicate.save(update_fields=['is_active', 'worker_tag'])

            for template in HKScheduleTemplate.objects.filter(
                area=area,
                is_active=True,
                frequency='daily',
                task_name__iregex=r'^\d+\s+Room Cleaning$',
            ).order_by('order', 'start_time', 'id'):
                template.task_name = 'Room Cleaning'
                template.save(update_fields=['task_name'])
                renamed_rooms += 1

            room_templates = list(HKScheduleTemplate.objects.filter(
                area=area,
                is_active=True,
                frequency='daily',
                task_name='Room Cleaning',
            ).order_by('order', 'start_time', 'id'))
            for duplicate in room_templates[1:]:
                duplicate.is_active = False
                duplicate.worker_tag = 'archived'
                duplicate.save(update_fields=['is_active', 'worker_tag'])

        self.stdout.write(self.style.SUCCESS(
            'Hostel schedule fixes applied: '
            f'disabled {disabled_washroom} daily washroom-dusting templates, '
            f'created {created_sunday} Sunday washroom-dusting templates, '
            f'renamed {renamed_rooms} numbered room-cleaning templates.'
        ))

import datetime

from django.core.management.base import BaseCommand

from apps.housekeeping.models import HKArea, HKScheduleTemplate


HOSTEL_NAMES = [
    'Aibaan', 'Beauki', 'Chimair', 'Duven', 'Emiet', 'Firpeal',
    'Griwiksh', 'Hiqom', 'Ijokha', 'Jurqia', 'Kyzeel', 'Lekhaag',
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

        self.stdout.write(self.style.SUCCESS(
            'Hostel schedule fixes applied: '
            f'disabled {disabled_washroom} daily washroom-dusting templates, '
            f'created {created_sunday} Sunday washroom-dusting templates, '
            f'renamed {renamed_rooms} numbered room-cleaning templates.'
        ))

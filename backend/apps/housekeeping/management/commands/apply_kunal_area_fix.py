from django.core.management.base import BaseCommand, CommandError

from apps.housekeeping.models import HKArea, HKWorker


class Command(BaseCommand):
    help = 'Move Kunal/pay code 390 to New Academic Reliever without deleting history.'

    def handle(self, *args, **options):
        target_area = HKArea.objects.filter(name='New Academic Reliever', is_active=True).first()
        if not target_area:
            raise CommandError('New Academic Reliever area was not found.')

        workers = HKWorker.objects.filter(pay_code='390')
        active_count = workers.filter(is_active=True).count()
        updated = 0

        for worker in workers:
            update_fields = []
            if worker.area_id != target_area.id:
                worker.area = target_area
                update_fields.append('area')
            if worker.worker_type != 'reliever':
                worker.worker_type = 'reliever'
                update_fields.append('worker_type')
            if not worker.is_reliever:
                worker.is_reliever = True
                update_fields.append('is_reliever')
            if update_fields:
                worker.save(update_fields=update_fields)
                updated += 1

        self.stdout.write(self.style.SUCCESS(
            f'Kunal/pay code 390 fix applied: updated {updated} worker rows; '
            f'active pay-code-390 workers found: {active_count}.'
        ))

from django.core.management.base import BaseCommand
from apps.housekeeping.models import HKScheduleTemplate, HKExtraWork

class Command(BaseCommand):
    help = 'Fixes unicode broken encoding artifacts (â€”, etc.) in the database.'

    def handle(self, *args, **options):
        replacements = [
            ('â€”', '-'),
            ('â”€', '-'),
            ('â€', '-'),
        ]

        # Fix HKScheduleTemplate tasks
        templates = HKScheduleTemplate.objects.all()
        template_count = 0
        for t in templates:
            original = t.task_name
            new_name = original
            for bad, good in replacements:
                if bad in new_name:
                    new_name = new_name.replace(bad, good)
            if new_name != original:
                t.task_name = new_name
                t.save(update_fields=['task_name'])
                template_count += 1

        self.stdout.write(self.style.SUCCESS(f'Fixed {template_count} HKScheduleTemplate records.'))

        # Fix HKScheduleTemplate description
        templates = HKScheduleTemplate.objects.all()
        desc_count = 0
        for t in templates:
            original = t.task_description
            new_desc = original
            for bad, good in replacements:
                if bad in new_desc:
                    new_desc = new_desc.replace(bad, good)
            if new_desc != original:
                t.task_description = new_desc
                t.save(update_fields=['task_description'])
                desc_count += 1

        self.stdout.write(self.style.SUCCESS(f'Fixed {desc_count} HKScheduleTemplate descriptions.'))

        # Fix HKExtraWork
        extra = HKExtraWork.objects.all()
        extra_count = 0
        for e in extra:
            changed = False
            original_name = e.task_name
            original_desc = e.description
            new_name = original_name
            new_desc = original_desc
            
            for bad, good in replacements:
                if bad in new_name:
                    new_name = new_name.replace(bad, good)
                    changed = True
                if bad in new_desc:
                    new_desc = new_desc.replace(bad, good)
                    changed = True
                    
            if changed:
                e.task_name = new_name
                e.description = new_desc
                e.save(update_fields=['task_name', 'description'])
                extra_count += 1

        self.stdout.write(self.style.SUCCESS(f'Fixed {extra_count} HKExtraWork records.'))

        self.stdout.write(self.style.SUCCESS('Successfully fixed encoding artifacts.'))

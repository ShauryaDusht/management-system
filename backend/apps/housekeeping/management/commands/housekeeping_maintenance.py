import re
from datetime import timedelta

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count, Max, Q
from django.utils import timezone

from apps.housekeeping.models import HKDailyRecord, HKExtraWork, HKScheduleTemplate, HKWorker
from apps.housekeeping.photo_utils import process_task_photo
from apps.users.models import User


class Command(BaseCommand):
    help = 'Run one-off housekeeping maintenance actions from a single command.'

    def add_arguments(self, parser):
        parser.add_argument(
            'action',
            choices=[
                'cleanup-temporary-templates',
                'fix-encoding',
                'fix-task-names',
                'migrate-task-photos',
                'update-staff-and-workers',
            ],
            help='Maintenance action to run.',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview changes without saving when supported.',
        )
        parser.add_argument(
            '--days',
            type=int,
            default=30,
            help='Age threshold for cleanup-temporary-templates. Default: 30.',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=0,
            help='Optional max number of records for migrate-task-photos.',
        )
        parser.add_argument(
            '--all',
            action='store_true',
            help='For migrate-task-photos, process all photo rows instead of only incomplete metadata rows.',
        )

    def handle(self, *args, **options):
        action = options['action']
        if action == 'cleanup-temporary-templates':
            self._cleanup_temporary_templates(options)
            return
        if action == 'fix-encoding':
            self._fix_encoding(options)
            return
        if action == 'fix-task-names':
            self._fix_task_names(options)
            return
        if action == 'migrate-task-photos':
            self._migrate_task_photos(options)
            return
        self._update_staff_and_workers()

    def _cleanup_temporary_templates(self, options):
        days = max(1, int(options['days']))
        cutoff = timezone.localdate() - timedelta(days=days)

        stale_qs = (
            HKScheduleTemplate.objects
            .filter(is_active=False)
            .annotate(
                linked_record_count=Count('originated_daily_records', distinct=True),
                latest_record_date=Max('originated_daily_records__date'),
            )
            .filter(linked_record_count=1, latest_record_date__lt=cutoff)
        )

        stale_count = stale_qs.count()
        if options['dry_run']:
            self.stdout.write(
                self.style.WARNING(
                    f"[dry-run] {stale_count} temporary templates eligible for cleanup."
                )
            )
            return

        deleted_count, _ = stale_qs.delete()
        self.stdout.write(
            self.style.SUCCESS(
                f"Deleted {deleted_count} rows (templates and cascaded related rows)."
            )
        )

    def _fix_encoding(self, options):
        replacements = [
            ('Ã¢â‚¬â€', '-'),
            ('Ã¢â€â‚¬', '-'),
            ('Ã¢â‚¬', '-'),
        ]
        dry_run = bool(options['dry_run'])

        template_name_count = 0
        template_desc_count = 0
        extra_count = 0

        for template in HKScheduleTemplate.objects.all():
            original_name = template.task_name
            original_desc = template.task_description
            new_name = original_name
            new_desc = original_desc

            for bad, good in replacements:
                if bad in new_name:
                    new_name = new_name.replace(bad, good)
                if bad in new_desc:
                    new_desc = new_desc.replace(bad, good)

            if new_name != original_name:
                template_name_count += 1
                if not dry_run:
                    template.task_name = new_name
                    template.save(update_fields=['task_name'])

            if new_desc != original_desc:
                template_desc_count += 1
                if not dry_run:
                    template.task_description = new_desc
                    template.save(update_fields=['task_description'])

        for extra in HKExtraWork.objects.all():
            original_name = extra.task_name
            original_desc = extra.description
            new_name = original_name
            new_desc = original_desc
            changed = False

            for bad, good in replacements:
                if bad in new_name:
                    new_name = new_name.replace(bad, good)
                    changed = True
                if bad in new_desc:
                    new_desc = new_desc.replace(bad, good)
                    changed = True

            if changed:
                extra_count += 1
                if not dry_run:
                    extra.task_name = new_name
                    extra.description = new_desc
                    extra.save(update_fields=['task_name', 'description'])

        prefix = '[dry-run] ' if dry_run else ''
        self.stdout.write(self.style.SUCCESS(f'{prefix}Fixed {template_name_count} HKScheduleTemplate names.'))
        self.stdout.write(self.style.SUCCESS(f'{prefix}Fixed {template_desc_count} HKScheduleTemplate descriptions.'))
        self.stdout.write(self.style.SUCCESS(f'{prefix}Fixed {extra_count} HKExtraWork records.'))

    def _fix_task_names(self, options):
        dry_run = bool(options['dry_run'])
        if dry_run:
            self.stdout.write(self.style.WARNING('Running in DRY-RUN mode. No database changes will be made.'))

        updated_names_count = 0
        deleted_templates_count = 0
        deleted_records_count = 0

        self.stdout.write(self.style.SUCCESS('\n--- TASK 1: Removing Worker Names ---'))

        area_13_prefixes = ['Dhaval: ', 'Mahesh: ', 'Shailesh: ', 'Dharmishtaben: ']
        for template in HKScheduleTemplate.objects.filter(area_id=13):
            original = template.task_name
            new_name = original
            for prefix in area_13_prefixes:
                if new_name.startswith(prefix):
                    new_name = new_name[len(prefix):].strip()
            if new_name != original:
                self.stdout.write(f"Area 13: '{original}' -> '{new_name}'")
                if not dry_run:
                    template.task_name = new_name
                    template.save(update_fields=['task_name'])
                updated_names_count += 1

        for template in HKScheduleTemplate.objects.filter(area_id=15):
            original = template.task_name
            new_name = re.sub(r'^[A-Za-z]+:\s*', '', original)
            new_name = re.sub(r'\s*\([A-Za-z\s+]+\)$', '', new_name)
            if new_name != original:
                self.stdout.write(f"Area 15: '{original}' -> '{new_name}'")
                if not dry_run:
                    template.task_name = new_name
                    template.save(update_fields=['task_name'])
                updated_names_count += 1

        area_14_prefixes = ['Vijay: ', 'Bhavnaben: ', 'Ramesh: ']
        for template in HKScheduleTemplate.objects.filter(area_id=14):
            original = template.task_name
            new_name = original
            for prefix in area_14_prefixes:
                if new_name.startswith(prefix):
                    new_name = new_name[len(prefix):].strip()
            new_name = new_name.replace('2nd Floor Floor and Lobby', '2nd Floor and Lobby')

            if new_name != original:
                self.stdout.write(f"Area 14: '{original}' -> '{new_name}'")
                if not dry_run:
                    template.task_name = new_name
                    template.save(update_fields=['task_name'])
                updated_names_count += 1

        area_18_prefixes = [
            'Pankaj: ', 'Gautam: ', 'Hitesh: ',
            'Shailesh + Sanjay: ', 'Dhaval + Ajay + Sumit: ', 'Anil: ',
        ]
        for template in HKScheduleTemplate.objects.filter(area_id=18):
            original = template.task_name
            new_name = original
            for prefix in area_18_prefixes:
                if new_name.startswith(prefix):
                    new_name = new_name[len(prefix):].strip()
            if new_name != original:
                self.stdout.write(f"Area 18: '{original}' -> '{new_name}'")
                if not dry_run:
                    template.task_name = new_name
                    template.save(update_fields=['task_name'])
                updated_names_count += 1

        self.stdout.write(self.style.SUCCESS('\n--- TASK 2: Deleting Supervisor Checks ---'))

        to_delete = [
            (18, 'Supervisor: Weekly Off and Reliever Roster Check'),
            (20, 'Supervisor: Weekly Off Coverage Check'),
            (16, 'Supervisor: Route Allocation and Attendance Check'),
            (16, 'Supervisor: Final Inspection and Closure Report'),
        ]

        for area_id, task_name in to_delete:
            templates = HKScheduleTemplate.objects.filter(
                area_id=area_id,
                task_name=task_name,
                worker_tag='all',
                frequency='daily',
            )
            for template in templates:
                self.stdout.write(f"Deleting Template: [{area_id}] {task_name}")
                records = HKDailyRecord.objects.filter(originating_template=template)
                record_count = records.count()
                self.stdout.write(f"  -> Associated records to delete: {record_count}")

                if not dry_run:
                    records.delete()
                    template.delete()

                deleted_records_count += record_count
                deleted_templates_count += 1

        self.stdout.write(self.style.SUCCESS('\n--- TASK 3: Hostel Wording Fixes ---'))

        replacements = {
            'Paper Cutting / Admin Work': 'Paperwork & Admin Work',
            'Paper Cutting': 'Paperwork',
            'Tea Break / Inside Round': 'Tea Break & Inside Round',
            'Common Cleaning & Pantry Round': 'Common Area Cleaning & Pantry Round',
            'Ground Floor Dry Mop': 'Ground Floor Dry Mopping',
            'Outside Round': 'Outside Inspection Round',
            '6 Washroom Rounds Touch Up': '6 Washroom Touch-Up Rounds',
            'All Washroom Touch Up & Final Round': 'All Washrooms Touch-Up & Final Round',
        }

        for template in HKScheduleTemplate.objects.filter(area_id__in=range(1, 13)):
            original = template.task_name
            new_name = replacements.get(original, original)
            if new_name != original:
                self.stdout.write(f"Hostel Area {template.area_id}: '{original}' -> '{new_name}'")
                if not dry_run:
                    template.task_name = new_name
                    template.save(update_fields=['task_name'])
                updated_names_count += 1

        self.stdout.write(self.style.SUCCESS('\n--- SUMMARY ---'))
        self.stdout.write(f'Updated Task Names: {updated_names_count}')
        self.stdout.write(f'Deleted Templates:  {deleted_templates_count}')
        self.stdout.write(f'Deleted Records:    {deleted_records_count}')

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY-RUN completed. No changes saved.'))
        else:
            self.stdout.write(self.style.SUCCESS('All changes saved to DB.'))

    def _migrate_task_photos(self, options):
        dry_run = bool(options['dry_run'])
        limit = max(0, int(options.get('limit') or 0))
        include_all = bool(options.get('all'))

        records = HKDailyRecord.objects.filter(photo_after__isnull=False).exclude(photo_after='')
        if not include_all:
            records = records.filter(
                Q(photo_after_format='')
                | Q(photo_after_saved_size=0)
                | Q(photo_after_thumbnail__isnull=True)
                | Q(photo_after_thumbnail='')
            )
        records = records.order_by('id')
        if limit:
            records = records[:limit]

        total = records.count()
        self.stdout.write(self.style.NOTICE(f'Found {total} photo records to process.'))
        if total == 0:
            return

        ok = 0
        failed = 0
        for record in records:
            try:
                record.photo_after.open('rb')
                raw = record.photo_after.read()
            finally:
                try:
                    record.photo_after.close()
                except Exception:
                    pass

            if not raw:
                failed += 1
                self.stdout.write(self.style.WARNING(f'Record {record.id}: empty image, skipped.'))
                continue

            old_name = record.photo_after.name
            old_storage = record.photo_after.storage
            old_thumb_name = record.photo_after_thumbnail.name if record.photo_after_thumbnail else ''
            old_thumb_storage = record.photo_after_thumbnail.storage if record.photo_after_thumbnail else old_storage

            uploaded = ContentFile(raw, name=old_name.split('/')[-1] or f'task-photo-{record.id}.jpg')
            try:
                processed = process_task_photo(
                    uploaded,
                    task_id=record.id,
                    original_size_hint=record.photo_after_original_size or len(raw),
                )
            except Exception as ex:
                failed += 1
                self.stdout.write(self.style.WARNING(f'Record {record.id}: process failed ({ex}).'))
                continue

            if dry_run:
                ok += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f"[dry-run] Record {record.id}: {processed['original_size']} -> "
                        f"{processed['saved_size']} bytes ({processed['compression_ratio']}% saved)"
                    )
                )
                continue

            record.photo_after = processed['main_file']
            record.photo_after_thumbnail = processed['thumb_file']
            record.photo_after_original_size = processed['original_size']
            record.photo_after_saved_size = processed['saved_size']
            record.photo_after_thumb_size = processed['thumb_size']
            record.photo_after_compression_ratio = processed['compression_ratio']
            record.photo_after_format = processed['format']
            record.save(
                update_fields=[
                    'photo_after',
                    'photo_after_thumbnail',
                    'photo_after_original_size',
                    'photo_after_saved_size',
                    'photo_after_thumb_size',
                    'photo_after_compression_ratio',
                    'photo_after_format',
                ]
            )

            try:
                if old_name and old_name != record.photo_after.name:
                    old_storage.delete(old_name)
            except Exception:
                pass
            try:
                new_thumb_name = record.photo_after_thumbnail.name if record.photo_after_thumbnail else ''
                if old_thumb_name and old_thumb_name != new_thumb_name:
                    old_thumb_storage.delete(old_thumb_name)
            except Exception:
                pass

            ok += 1
            if ok % 10 == 0:
                self.stdout.write(self.style.NOTICE(f'Progress: {ok}/{total}'))

        self.stdout.write(
            self.style.SUCCESS(
                f'Done. Successful: {ok}, Failed: {failed}, Dry-run: {dry_run}'
            )
        )

    def _update_staff_and_workers(self):
        staff_updates = [
            {'name': 'Bharatkumar Solanki', 'pay_code': '465', 'email': 'bharat2545007@gmail.com'},
            {'name': 'Ashokbhai', 'pay_code': '2', 'email': 'ashok2969798@gmail.com'},
            {'name': 'Narendra Shrimali', 'pay_code': '328', 'email': 'narendrashrimali36262@gmail.com'},
            {'name': 'Moulik Patel', 'pay_code': '7', 'email': 'moulikpatel81290@gmail.com'},
            {'name': 'Pradip', 'pay_code': '460', 'email': 'pradipchauhan783@gmail.com'},
            {'name': 'Mukesh Vaghela', 'pay_code': '466', 'email': 'm.vaghela23@gmail.com'},
            {'name': 'Bipin Vaghela', 'pay_code': '350', 'email': 'bipin.vaghela4u@gmail.com'},
            {'name': 'Sailesh Prajapati', 'pay_code': '4', 'email': ''},
            {'name': 'Kaushik Parmar', 'pay_code': '396', 'email': 'kaushikparmar7673@gmail.com'},
            {'name': 'Jaimin', 'phone': '7600738945', 'pay_code': '318', 'email': 'hostel.caretaker@iitgn.ac.in'},
            {'name': 'Ram Singh Airi', 'phone': '9687460280', 'pay_code': '11', 'email': 'ramairi1198@gmail.com'},
            {'name': 'Priyanka', 'phone': '6353228604', 'pay_code': '237', 'email': 'priyankavijayparmar27@gmail.com'},
            {'name': 'Anita', 'phone': '9512389739', 'pay_code': '10', 'email': 'anitavaghela98@gmail.com'},
            {'name': 'Pankaj', 'phone': '9904803975', 'pay_code': '293', 'email': 'pankajsingh2753@gmail.com'},
            {'name': 'Anil', 'phone': '8155037413', 'pay_code': '300', 'email': 'anil8155037413@gmail.com'},
            {'name': 'Nikul', 'phone': '9714730290', 'pay_code': '427', 'email': 'nikulsinghbhola862@gmail.com'},
            {'name': 'Vishwajeet Mishra', 'phone': '9898037530', 'pay_code': '8', 'email': 'mishra.vishwajeet@iitgn.ac.in'},
            {'name': 'Rushita', 'phone': '7083740424', 'pay_code': '294', 'email': ''},
        ]

        name_matching = {
            'Ashokbhai': 'Ashok',
            'Narendra Shrimali': 'Narendra',
            'Moulik Patel': 'Maulik',
            'Pradip': 'Pradip',
            'Mukesh Vaghela': 'Mukesh',
            'Bipin Vaghela': 'Bipin',
            'Sailesh Prajapati': 'Sailesh',
            'Kaushik Parmar': 'Kaushik',
            'Jaimin': 'Jaimin',
            'Ram Singh Airi': 'Ram',
            'Priyanka': 'Priyanka',
            'Anita': 'Anita',
            'Pankaj': 'Pankaj',
            'Anil': 'Anil',
            'Nikul': 'Nikul',
            'Vishwajeet Mishra': 'Vishwajeet',
            'Rushita': 'Rushita',
            'Rhushita': 'Rushita',
            'Bharatkumar Solanki': 'Bharat',
        }

        worker_updates = [
            {'current_search': 'kailashben', 'new_pay_code': '143', 'new_name': 'KAILASHBEN PARMAR'},
            {'current_search': 'solanki nikul', 'new_pay_code': '446', 'new_name': 'SOLANKI NIKULBHAI RAJESHBHAI'},
            {'current_search': '115|363|jignesh', 'new_pay_code': '115', 'new_name': 'JIGNESBHAI MADHABHAI TUMBADIYA'},
            {'current_search': '269|542|anil thakor', 'new_pay_code': '269', 'new_name': 'ANILKUMAR BHUPATJI THAKOR'},
            {'current_search': '291|123|gafulbhai', 'new_pay_code': '291', 'new_name': 'HITESHKUMAR GAFULBHAI VAGHELA'},
            {'current_search': '311|82|sailesh', 'new_pay_code': '311', 'new_name': 'VAGHELA SHAILESHKUMAR'},
            {'current_search': '82|266|shaileshk', 'new_pay_code': '82', 'new_name': 'VAGHELA SHAILESHBHAI'},
        ]

        self.stdout.write('--- UPDATING USERS ---')
        try:
            with transaction.atomic():
                users = list(User.objects.all())
                found_count = 0
                for update in staff_updates:
                    match_key = name_matching.get(update['name'], update['name'].split()[0]).lower()
                    user = next(
                        (
                            current_user
                            for current_user in users
                            if match_key in current_user.get_full_name().lower()
                            or match_key in current_user.username.lower()
                        ),
                        None,
                    )
                    if not user and update.get('pay_code'):
                        user = next(
                            (
                                current_user
                                for current_user in users
                                if current_user.pay_code == update['pay_code']
                            ),
                            None,
                        )

                    if user:
                        changed = False
                        if update.get('email'):
                            user.email = update['email']
                            changed = True
                        if update.get('phone'):
                            user.phone = update['phone']
                            changed = True
                        if update.get('pay_code'):
                            user.pay_code = update['pay_code']
                            changed = True

                        if changed:
                            user.save()
                            self.stdout.write(
                                self.style.SUCCESS(
                                    f"Updated User: {user.get_full_name()} (PayCode: {user.pay_code})"
                                )
                            )
                            found_count += 1
                    else:
                        self.stdout.write(
                            self.style.WARNING(
                                f"WARNING: Could not find user matching {update['name']}"
                            )
                        )

                self.stdout.write(
                    self.style.SUCCESS(
                        f'Finished updating {found_count}/{len(staff_updates)} mapped users.'
                    )
                )

                self.stdout.write('\n--- UPDATING HK WORKERS ---')
                workers = list(HKWorker.objects.all())
                for update in worker_updates:
                    search_terms = update['current_search'].split('|')
                    found_worker = None

                    for worker in workers:
                        worker_name_lower = worker.name.lower()
                        worker_pay_lower = worker.pay_code.lower()
                        for term in search_terms:
                            lower_term = term.lower()
                            if lower_term in worker_name_lower or lower_term == worker_pay_lower:
                                found_worker = worker
                                break
                        if found_worker:
                            break

                    if found_worker:
                        old_name = found_worker.name
                        old_pay_code = found_worker.pay_code
                        found_worker.name = update['new_name']
                        found_worker.pay_code = update['new_pay_code']
                        found_worker.save()
                        self.stdout.write(
                            self.style.SUCCESS(
                                f"Updated HK Worker: '{old_name}' (PC: {old_pay_code}) -> "
                                f"'{found_worker.name}' (PC: {found_worker.pay_code})"
                            )
                        )
                    else:
                        self.stdout.write(
                            self.style.WARNING(
                                'WARNING: Could not locate HK worker with search terms match: '
                                f"{update['current_search']}"
                            )
                        )
        except Exception as ex:
            self.stdout.write(self.style.ERROR(f'Transaction failed: {ex}'))

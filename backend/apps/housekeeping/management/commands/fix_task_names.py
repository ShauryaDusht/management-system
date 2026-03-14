import re
from django.core.management.base import BaseCommand
from apps.housekeeping.models import HKScheduleTemplate, HKDailyRecord

class Command(BaseCommand):
    help = 'Fixes task names, cleans up special daily tasks, and standardizes wording across areas.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Run the script without saving changes to the database.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write(self.style.WARNING("Running in DRY-RUN mode. No database changes will be made."))

        updated_names_count = 0
        deleted_templates_count = 0
        deleted_records_count = 0

        #######################################################################
        # TASK 1: Remove Worker Names from Task Names
        #######################################################################
        self.stdout.write(self.style.SUCCESS("\n--- TASK 1: Removing Worker Names ---"))

        # Area 13: Maulik Patel -> Research Park
        # Prefixes: Mahesh: , Ajay: , Shailesh: , Dharmishtaben: 
        area_13_prefixes = ["Mahesh: ", "Ajay: ", "Shailesh: ", "Dharmishtaben: "]
        for t in HKScheduleTemplate.objects.filter(area_id=13):
            original = t.task_name
            new_name = original
            for p in area_13_prefixes:
                if new_name.startswith(p):
                    new_name = new_name[len(p):].strip()
            if new_name != original:
                self.stdout.write(f"Area 13: '{original}' -> '{new_name}'")
                if not dry_run:
                    t.task_name = new_name
                    t.save(update_fields=['task_name'])
                updated_names_count += 1

        # Area 15: Bharat Solanki -> Sports Complex
        # "Indoor Deep Clean: Ground Floor (Anita + Ramesh)" -> "Indoor Deep Clean: Ground Floor"
        # "Dinner Break (Sohil + Rahul)" -> "Dinner Break"
        # and "Name: " or "(Name + Name)"
        for t in HKScheduleTemplate.objects.filter(area_id=15):
            original = t.task_name
            new_name = original
            # Remove "Name: "
            new_name = re.sub(r'^[A-Za-z]+:\s*', '', new_name)
            # Remove " (Name + Name)" or " (Name)" or " (Name + Name + Name)"
            new_name = re.sub(r'\s*\([A-Za-z\s+]+\)$', '', new_name)
            if new_name != original:
                self.stdout.write(f"Area 15: '{original}' -> '{new_name}'")
                if not dry_run:
                    t.task_name = new_name
                    t.save(update_fields=['task_name'])
                updated_names_count += 1

        # Area 14: Bharat Solanki -> Central Arcade
        # Prefixes: "Vijay: ", "Bhavnaben: ", "Ramesh: "
        # Fix: "Ramesh: 2nd Floor Floor and Lobby Cleaning" -> "2nd Floor and Lobby Cleaning"
        area_14_prefixes = ["Vijay: ", "Bhavnaben: ", "Ramesh: "]
        for t in HKScheduleTemplate.objects.filter(area_id=14):
            original = t.task_name
            new_name = original
            for p in area_14_prefixes:
                if new_name.startswith(p):
                    new_name = new_name[len(p):].strip()
            # Special double floor fix
            new_name = new_name.replace("2nd Floor Floor and Lobby", "2nd Floor and Lobby")
            
            if new_name != original:
                self.stdout.write(f"Area 14: '{original}' -> '{new_name}'")
                if not dry_run:
                    t.task_name = new_name
                    t.save(update_fields=['task_name'])
                updated_names_count += 1

        # Area 18: Ashok Rathod -> Guest House New
        # Prefixes: "Pankaj: ", "Gautam: ", "Hitesh: ", "Shailesh + Sanjay: ", "Dhaval + Ajay + Sumit: ", "Anil: "
        area_18_prefixes = [
            "Pankaj: ", "Gautam: ", "Hitesh: ", 
            "Shailesh + Sanjay: ", "Dhaval + Ajay + Sumit: ", "Anil: "
        ]
        for t in HKScheduleTemplate.objects.filter(area_id=18):
            original = t.task_name
            new_name = original
            for p in area_18_prefixes:
                if new_name.startswith(p):
                    new_name = new_name[len(p):].strip()
            if new_name != original:
                self.stdout.write(f"Area 18: '{original}' -> '{new_name}'")
                if not dry_run:
                    t.task_name = new_name
                    t.save(update_fields=['task_name'])
                updated_names_count += 1


        #######################################################################
        # TASK 2: Delete Permanent Special Daily Tasks
        #######################################################################
        self.stdout.write(self.style.SUCCESS("\n--- TASK 2: Deleting Supervisor Checks ---"))
        
        to_delete = [
            (18, "Supervisor: Weekly Off and Reliever Roster Check"),
            (20, "Supervisor: Weekly Off Coverage Check"),
            (16, "Supervisor: Route Allocation and Attendance Check"),
            (16, "Supervisor: Final Inspection and Closure Report")
        ]

        for area_id, task_name in to_delete:
            t_qs = HKScheduleTemplate.objects.filter(
                area_id=area_id, 
                task_name=task_name,
                worker_tag='all',
                frequency='daily'
            )
            for t in t_qs:
                self.stdout.write(f"Deleting Template: [{area_id}] {task_name}")
                # Delete daily records originating from this template
                records = HKDailyRecord.objects.filter(originating_template=t)
                r_count = records.count()
                self.stdout.write(f"  -> Associated records to delete: {r_count}")
                
                if not dry_run:
                    records.delete()
                    t.delete()
                
                deleted_records_count += r_count
                deleted_templates_count += 1


        #######################################################################
        # TASK 3: Wording Fixes (All 12 Hostel Areas)
        #######################################################################
        self.stdout.write(self.style.SUCCESS("\n--- TASK 3: Hostel Wording Fixes ---"))

        replacements = {
            "Paper Cutting / Admin Work": "Paperwork & Admin Work",
            "Paper Cutting": "Paperwork",
            "Tea Break / Inside Round": "Tea Break & Inside Round",
            "Common Cleaning & Pantry Round": "Common Area Cleaning & Pantry Round",
            "Ground Floor Dry Mop": "Ground Floor Dry Mopping",
            "Outside Round": "Outside Inspection Round",
            "6 Washroom Rounds Touch Up": "6 Washroom Touch-Up Rounds",
            "All Washroom Touch Up & Final Round": "All Washrooms Touch-Up & Final Round"
        }

        # Apply to areas 1 to 12
        for t in HKScheduleTemplate.objects.filter(area_id__in=range(1, 13)):
            original = t.task_name
            new_name = replacements.get(original, original)
            if new_name != original:
                self.stdout.write(f"Hostel Area {t.area_id}: '{original}' -> '{new_name}'")
                if not dry_run:
                    t.task_name = new_name
                    t.save(update_fields=['task_name'])
                updated_names_count += 1

        #######################################################################
        # SUMMARY
        #######################################################################
        self.stdout.write(self.style.SUCCESS("\n--- SUMMARY ---"))
        self.stdout.write(f"Updated Task Names: {updated_names_count}")
        self.stdout.write(f"Deleted Templates:  {deleted_templates_count}")
        self.stdout.write(f"Deleted Records:    {deleted_records_count}")
        
        if dry_run:
            self.stdout.write(self.style.WARNING("DRY-RUN completed. No changes saved."))
        else:
            self.stdout.write(self.style.SUCCESS("All changes saved to DB."))

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.housekeeping.models import HKArea, HKScheduleTemplate, HKWorker


def _normalize(value):
    return "".join((value or "").lower().split())


class Command(BaseCommand):
    help = (
        "Sync the real worker roster for Guest House New and Director Bungalow, "
        "including phones, pay codes, reliever flags, and schedule labels."
    )

    TARGET_ROSTER = [
        {
            "area": "Guest House New",
            "name": "Raju Manabhai Makwana",
            "phone": "9601550905",
            "pay_code": "263",
            "worker_type": "floor",
            "shift": "day",
            "is_reliever": False,
            "legacy_names": [
                "Pankaj Parmar",
                "Parmar Rakeshkumar Ishvarbhai",
                "Raju Manabhai Makwana",
                "Makvana Rajubhai Manabhai",
            ],
        },
        {
            "area": "Guest House New",
            "name": "Hiteshkumar Gafulbhai Vaghela",
            "phone": "9265621047",
            "pay_code": "291",
            "worker_type": "washroom",
            "shift": "day",
            "is_reliever": False,
            "legacy_names": [
                "Hitesh Vaghela",
                "Hitesh Kumar Vaghela",
                "Hiteshkumar Gafulbhai Vaghela",
            ],
        },
        {
            "area": "Guest House New",
            "name": "Dhaval Kantibhai Jadeja",
            "phone": "9099716206",
            "pay_code": "248",
            "worker_type": "room",
            "shift": "day",
            "is_reliever": False,
            "legacy_names": [
                "Dhaval Jadeja",
                "Jadeja Dhavalkumar Kantibhai",
                "Dhaval Kantibhai Jadeja",
            ],
        },
        {
            "area": "Guest House New",
            "name": "Ajay Harshadbhai Purabiya",
            "phone": "9099483423",
            "pay_code": "284",
            "worker_type": "room",
            "shift": "day",
            "is_reliever": False,
            "legacy_names": [
                "Ajay Purabiya",
                "Purbiya Ajay Harshadbhai",
                "Ajay Harshadbhai Purabiya",
            ],
        },
        {
            "area": "Guest House New",
            "name": "Sumit Rameshbhai Solanki",
            "phone": "8866060385",
            "pay_code": "451",
            "worker_type": "room",
            "shift": "day",
            "is_reliever": False,
            "legacy_names": [
                "Sumit Solanki",
                "Sumit Rameshbhai Solanki",
            ],
        },
        {
            "area": "Guest House New",
            "name": "Shailesh Ishvarbhai Raval",
            "phone": "9157891835",
            "pay_code": "306",
            "worker_type": "washroom",
            "shift": "evening",
            "is_reliever": False,
            "legacy_names": [
                "Shailesh Ravel",
                "Raval Shaileshkumar Ishvarbhai",
                "Shailesh Ishvarbhai Raval",
            ],
        },
        {
            "area": "Guest House New",
            "name": "Sanjay Babubhai Vaghela",
            "phone": "8490012338",
            "pay_code": "304",
            "worker_type": "washroom",
            "shift": "evening",
            "is_reliever": False,
            "legacy_names": [
                "Sanjay Vaghela",
                "Vaghela Sanjaykumar Babubhai",
                "Sanjay Babubhai Vaghela",
            ],
        },
        {
            "area": "Guest House New",
            "name": "Anil Bhupatsinh Thakor",
            "phone": "7359449665",
            "pay_code": "269",
            "worker_type": "general",
            "shift": "night",
            "is_reliever": False,
            "legacy_names": [
                "Anil Thakor",
                "Anilkumar Bhupatji Thakor",
                "Anil Bhupatsinh Thakor",
            ],
        },
        {
            "area": "Guest House New",
            "name": "Gautam Parmar",
            "phone": "8511406220",
            "pay_code": "403",
            "worker_type": "floor",
            "shift": "day",
            "is_reliever": False,
            "legacy_names": [
                "Gautam Parmar",
                "Paramar Gautamkumar",
            ],
        },
        {
            "area": "Guest House New",
            "name": "Pankaj Kantibhai Chamar",
            "phone": "7990281462",
            "pay_code": "393",
            "worker_type": "general",
            "shift": "day",
            "is_reliever": False,
            "legacy_names": [
                "Raju Chamar",
                "Pankajkumar Kantibhai Chamar",
                "Pankaj Kantibhai Chamar",
            ],
        },
        {
            "area": "Guest House New",
            "name": "Lalit Babubhai Parmar",
            "phone": "8866011232",
            "pay_code": "319",
            "worker_type": "general",
            "shift": "day",
            "is_reliever": False,
            "legacy_names": [
                "Lalit Parmar",
                "Lalitbhai Parmar",
                "Lalit Babubhai Parmar",
                "Solanki Lalit",
            ],
        },
        {
            "area": "Guest House New",
            "name": "Vishal Vaghela Karshanbhai",
            "phone": "8154945437",
            "pay_code": "320",
            "worker_type": "room",
            "shift": "day",
            "is_reliever": False,
            "legacy_names": [
                "Vishal Vaghela Karshanbhai",
                "Vishal Vaghela",
                "Vishal",
            ],
        },
        {
            "area": "Director Bungalow",
            "name": "Shailesh Ugarabhai Vaghela",
            "phone": "8128880335",
            "pay_code": "311",
            "worker_type": "general",
            "shift": "day",
            "is_reliever": False,
            "legacy_names": [
                "Shailesh Vaghela",
                "Vaghela Shaileshbhai",
                "Shailesh Ugarabhai Vaghela",
            ],
        },
        {
            "area": "Director Bungalow",
            "name": "Rakesh Ishvarbhai Parmar",
            "phone": "8238931261",
            "pay_code": "305",
            "worker_type": "general",
            "shift": "day",
            "is_reliever": False,
            "legacy_names": [
                "Rakesh Parmar",
                "Parmar Bhadreshkumar Natvarlal",
                "Rakesh Ishvarbhai Parmar",
                "Parmar Rakeshkumar Ishvarbhai",
            ],
        },
    ]

    SCHEDULE_UPDATES = [
        ("Guest House New", "floor", 1, "Raju: Ground Floor Office, Reception and Front Corridor", "Dusting, sweeping and mopping"),
        ("Guest House New", "floor", 2, "Raju: Parking, Washroom and Lobby Touch Up", "Ladies/Gents/Handicapped washroom, lobby and dining passage"),
        ("Guest House New", "floor", 3, "Raju: Front Glass, Lift and Ground Floor Final Round", ""),
        ("Guest House New", "floor", 4, "Raju: Lunch Break", ""),
        ("Guest House New", "floor", 5, "Raju: Washroom Touch Up", ""),
        ("Guest House New", "floor", 6, "Raju: Rooms Back Side Area Sweeping", ""),
        ("Guest House New", "floor", 7, "Raju: Gym Area and Equipment Dusting", ""),
        ("Guest House New", "floor", 8, "Raju: All Floor Coolers and Washroom Cleaning", ""),
        ("Guest House New", "room", 1, "Dhaval + Ajay + Sumit + Vishal: Checkout/Occupied/Vacant Rooms", "Morning room operations"),
        ("Guest House New", "all", 1, "Supervisor: Weekly Off and Reliever Roster Check", "Weekly off coverage to be managed among the Guest House New staff team."),
    ]

    def add_arguments(self, parser):
        parser.add_argument("--quiet", action="store_true", help="Reduce log output.")

    def handle(self, *args, **options):
        quiet = options["quiet"]
        User = get_user_model()

        supervisor = User.objects.filter(username="ashok.rathod").first()
        if not supervisor:
            self.stderr.write("Supervisor ashok.rathod not found; sync skipped.")
            return

        areas = {
            name: HKArea.objects.filter(name=name).first()
            for name in {"Guest House New", "Director Bungalow"}
        }
        if not all(areas.values()):
            self.stderr.write("Required housekeeping areas not found; sync skipped.")
            return

        all_workers = list(HKWorker.objects.select_related("area"))
        keep_ids = set()
        touched = 0

        for spec in self.TARGET_ROSTER:
            area = areas[spec["area"]]
            worker = self._find_worker(spec, area, all_workers, keep_ids)
            created = False
            if worker is None:
                worker = HKWorker(area=area)
                created = True

            worker.name = spec["name"]
            worker.phone = spec["phone"]
            worker.pay_code = spec["pay_code"]
            worker.worker_type = spec["worker_type"]
            worker.shift = spec["shift"]
            worker.area = area
            worker.supervisor = supervisor
            worker.is_reliever = spec["is_reliever"]
            worker.is_active = True
            worker.save()

            if created:
                all_workers.append(worker)
            keep_ids.add(worker.id)
            touched += 1
            if not quiet:
                action = "created" if created else "synced"
                self.stdout.write(f"[{action}] {worker.area.name}: {worker.name} ({worker.pay_code})")

        # Deactivate outdated workers in the two target areas so attendance only shows the real roster.
        old_area_workers = HKWorker.objects.filter(
            area__name__in=["Guest House New", "Director Bungalow"],
            is_active=True,
        ).exclude(id__in=keep_ids)
        old_area_count = old_area_workers.count()
        old_area_workers.update(is_active=False)

        # Deactivate duplicate target pay-code rows outside these areas.
        target_pay_codes = [spec["pay_code"] for spec in self.TARGET_ROSTER]
        duplicate_qs = HKWorker.objects.filter(
            pay_code__in=target_pay_codes,
            is_active=True,
        ).exclude(id__in=keep_ids).exclude(area__name__in=["Guest House New", "Director Bungalow"])
        duplicate_count = duplicate_qs.count()
        duplicate_qs.update(is_active=False)

        schedule_updates = 0
        for area_name, worker_tag, order, task_name, task_description in self.SCHEDULE_UPDATES:
            schedule_updates += HKScheduleTemplate.objects.filter(
                area__name=area_name,
                worker_tag=worker_tag,
                order=order,
            ).update(task_name=task_name, task_description=task_description)

        self.stdout.write(
            self.style.SUCCESS(
                f"Synced guesthouse/director roster: {touched} workers, "
                f"deactivated {old_area_count} outdated area rows, "
                f"deactivated {duplicate_count} duplicate pay-code rows, "
                f"updated {schedule_updates} schedule rows."
            )
        )

    def _find_worker(self, spec, area, all_workers, keep_ids):
        legacy = {_normalize(spec["name"])}
        legacy.update(_normalize(name) for name in spec.get("legacy_names", []))

        for worker in all_workers:
            if worker.id in keep_ids:
                continue
            if worker.area_id == area.id and _normalize(worker.name) == _normalize(spec["name"]):
                return worker

        for worker in all_workers:
            if worker.id in keep_ids:
                continue
            if worker.area_id == area.id and _normalize(worker.name) in legacy:
                return worker

        for worker in all_workers:
            if worker.id in keep_ids:
                continue
            if worker.area_id == area.id and worker.pay_code == spec["pay_code"]:
                return worker

        for worker in all_workers:
            if worker.id in keep_ids:
                continue
            if worker.pay_code == spec["pay_code"]:
                return worker

        for worker in all_workers:
            if worker.id in keep_ids:
                continue
            if worker.area_id == area.id and worker.worker_type == spec["worker_type"] and worker.is_reliever == spec["is_reliever"]:
                return worker

        return None

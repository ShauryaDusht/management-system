import calendar
import copy
import datetime
import functools
import json
import logging
import math
import re
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from django.contrib.auth import (
    authenticate,
    get_user_model,
    login as auth_login,
    update_session_auth_hash,
)
from django.db import models as dm
from django.db import transaction
from django.db.models import DecimalField, IntegerField, Max, Prefetch, Q, Sum, Value
from django.db.models.functions import Cast, Coalesce
from django.http import HttpResponseBadRequest, HttpResponseForbidden, HttpResponseNotFound, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils.dateparse import parse_date, parse_datetime
from django.utils import timezone
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_POST

from .models import (
    HKAlert,
    HKArea,
    HKAreaStock,
    HKAttendanceRecord,
    HKStaffAttendanceRecord,
    HKDailyRecord,
    HKExtraWork,
    HKInchargeAssignment,
    HKInchargeNotification,
    HKRelieverSubstitution,
    HKScheduleTemplate,
    HKLeaveRequest,
    HKStockRequest,
    HKTaskWorkerAssignment,
    HKTemporaryStaffAreaAssignment,
    HKUserArea,
    HKWorker,
    HKWorkerSelectionRequest,
)
from .photo_utils import process_task_photo
from apps.core.image_urls import image_debug_payload, log_image_event
from apps.inventory.request_permissions import (
    EXCESSIVE_QUANTITY_MESSAGE,
    REPEAT_REQUEST_BLOCKED_MESSAGE,
    UNAUTHORIZED_ITEM_REQUEST_MESSAGE,
    filter_requestable_items,
    get_unaccounted_item_quantity,
    user_can_request_item,
)
from apps.users.models import normalize_username_value
from apps.inventory.models import ItemIssue, ItemRequest, ItemUsageLog

logger = logging.getLogger(__name__)
UserModel = get_user_model()
PERMANENT_RELIEVER_USERNAMES = {"dinesh.chauhan"}
STAFF_HIDDEN_AREA_NAMES = {"Hostels Reliever", "Old Academic Reliever", "New Academic Reliever"}
JRHA_AREA_NAMES = {
    "Block-A JRHA",
    "Block-B JRHA",
    "Block-C JRHA",
    "Block-D JRHA",
    "Jeet Hostel Block A",
    "Jeet Hostel Block B",
    "Jeet Hostel Block C",
    "Jeet Hostel Block D",
}
JRHA_NIGHT_CARETAKER_USERNAME = "kailash.vaghela"
JRHA_NIGHT_TASK_MARKER = "[JRHA_NIGHT_CARETAKER]"
JRHA_NIGHT_TASKS = [
    (1, "22:00", "22:30", "Hostel and Other Payments Register", "Check hostel/other payment notes and pending night entries."),
    (2, "22:30", "23:00", "Borewell On/Off Register", "Record borewell on/off timing, status and any issue observed."),
    (3, "23:00", "23:45", "Complaint/Suggestion Register and Resolve", "Review complaint/suggestion entries, resolve possible items and record follow-up."),
    (4, "23:45", "00:30", "Student Entry/Exit Register", "Verify student entry/exit register and note exceptions."),
    (5, "00:30", "01:00", "Courier/Parcel Register", "Check courier/parcel register and pending handover notes."),
    (6, "01:00", "01:30", "Night Round and Incident Note", "Round all assigned JRHA blocks and record any incident or maintenance concern."),
]

ATTENDANCE_CHOICES = [
    ("present", "Present", "#d1fae5", "#065f46"),
    ("absent", "Absent", "#fee2e2", "#991b1b"),
    ("late", "Late", "#fef3c7", "#92400e"),
    ("leave", "Leave", "#dbeafe", "#1d4ed8"),
]
SECOND_HALF_EXCEPTION_CHOICES = [
    ("absent", "Absent", "#fee2e2", "#991b1b"),
    ("leave", "Leave", "#dbeafe", "#1d4ed8"),
]

WORKER_TAG_LABELS = {
    "room": ("room", "Room Staff"),
    "floor": ("floor", "Floor Staff"),
    "washroom": ("washroom", "Washroom Staff"),
    "t1": ("t1", "Team 1"),
    "t2": ("t2", "Team 2"),
    "t3": ("t3", "Team 3"),
    "t4": ("t4", "Team 4"),
    "t5": ("t5", "Team 5"),
    "all": ("all", "All Staff"),
    "general": ("general", "General"),
}


def _safe_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def area_bucket(area):
    if not area:
        return "others"
    n = (area.name or "").strip()
    if n.lower() in {"hostel common area", "common area", "hostels reliever"}:
        return "hostels"
    if n in {"Old Academic Common Area", "New AB U-Shape", "New Academic Common Area", "Old Academic Reliever", "New Academic Reliever"}:
        return "academic"
    if n.startswith("Academic Block "):
        return "academic"
    if area.area_type == "hostel":
        return "hostels"
    if area.area_type == "academic":
        return "academic"
    return "others"


def _academic_block_number(area):
    if not area:
        return None
    name = (area.name or "").strip()
    prefix = "Academic Block "
    if not name.startswith(prefix):
        return None
    try:
        return int(name.replace(prefix, "", 1).strip())
    except (TypeError, ValueError):
        return None


def _uses_academic_reliever_pool(area):
    if area and area.name == "Old Academic Common Area":
        return True
    block_no = _academic_block_number(area)
    return bool(block_no and 1 <= block_no <= 9)


def _uses_new_academic_reliever_pool(area):
    if not area:
        return False
    return area.name in {
        "Academic Block 10",
        "Academic Block 11",
        "Academic Block 12",
        "Academic Block 13",
        "New Academic Common Area",
        "New AB U-Shape",
    }


def _is_jrha_area(area):
    return bool(area and area.name in JRHA_AREA_NAMES)


def _is_jrha_night_caretaker(user):
    return bool(
        user
        and (getattr(user, "username", "") or "").lower() == JRHA_NIGHT_CARETAKER_USERNAME
        and getattr(user, "role", "") == "caretaker"
    )


def _jrha_night_task_description(description):
    return f"{JRHA_NIGHT_TASK_MARKER} {description}"


def _ensure_jrha_night_templates(area):
    if not _is_jrha_area(area):
        return []

    templates = []
    for order, start, end, name, description in JRHA_NIGHT_TASKS:
        template = (
            HKScheduleTemplate.objects
            .filter(
                area=area,
                worker_tag="night_caretaker",
                task_name=name,
                task_description__icontains=JRHA_NIGHT_TASK_MARKER,
            )
            .order_by("id")
            .first()
        )
        defaults = {
            "order": order,
            "start_time": datetime.time.fromisoformat(start),
            "end_time": datetime.time.fromisoformat(end),
            "task_description": _jrha_night_task_description(description),
            "worker_tag": "night_caretaker",
            "requires_photo": False,
            "frequency": "daily",
            "is_active": False,
        }
        if not template:
            template = HKScheduleTemplate.objects.create(area=area, task_name=name, **defaults)
        else:
            updates = []
            for field, value in defaults.items():
                if getattr(template, field) != value:
                    setattr(template, field, value)
                    updates.append(field)
            if updates:
                template.save(update_fields=updates)
        templates.append(template)
    return templates


def _mark_staff_present_from_task(user, date):
    staff_att, created = HKStaffAttendanceRecord.objects.get_or_create(
        staff=user,
        date=date,
        defaults={
            "status": "present",
            "source": "auto_attendance",
            "note": "Auto-marked from JRHA night task submission.",
        },
    )
    if not created and staff_att.source != "auto_leave" and staff_att.status != "present":
        staff_att.status = "present"
        staff_att.source = "auto_attendance"
        staff_att.note = "Auto-marked from JRHA night task submission."
        staff_att.save(update_fields=["status", "source", "note"])
    return staff_att


HOSTEL_RELIEVER_ASSIGNMENTS = {
    "Aibaan": {"names": ["Anju Ben", "Anju ben"]},
    "Ijokha": {"names": ["Anju Ben", "Anju ben"]},
    "Beauki": {"pay_codes": ["356"]},
    "Chimair": {"pay_codes": ["356"]},
    "Duven": {"pay_codes": ["435"]},
    "Emiet": {"pay_codes": ["121"]},
    "Griwiksh": {"pay_codes": ["261"]},
    "Hiqom": {"pay_codes": ["75"]},
    "Jurqia": {"pay_codes": ["136"]},
    "Kyzeel": {"pay_codes": ["154"]},
    "Lekhaag": {"pay_codes": ["88"]},
    "Hostel Common Area": {"pay_codes": ["80", "100", "240", "457", "459", "472"]},
}

HOUSEKEEPING_MANAGER_ROLES = {"admin", "hk_inventory_manager"}
HOUSEKEEPING_STAFF_ROLES = HOUSEKEEPING_MANAGER_ROLES | {"supervisor", "caretaker"}


def can_manage_housekeeping_user(user):
    return getattr(user, "role", "") in HOUSEKEEPING_MANAGER_ROLES


SUPERVISOR_EXCLUDED_AREA_IDS = {1, 18, 24, 25, 26}
SUPERVISOR_EXCLUDED_AREA_NAMES = {
    "Canteen, Gate-01 and Gate-02",
    "Canteen Gate-01",
    "Gate-02",
    "Guest House New",
    "Director Bungalow",
    "Research Park",
    "Old Guest House",
}
SUPERVISOR_RELIEVER_PAYCODES = ["303", "329", "364", "389", "455", "494"]
HOSTEL_COMMON_AREA_RELIEVER_PAYCODES = ["80", "100", "240", "457", "459", "472"]


def is_ganesh_jayesh_user(user):
    if not user:
        return False
    return (
        (getattr(user, "username", "") or "").lower() == "ganesh.jayesh"
        or getattr(user, "id", None) == 27
    )


def is_supervisor_excluded_area(area):
    if not area:
        return True
    if getattr(area, "id", None) in SUPERVISOR_EXCLUDED_AREA_IDS:
        return True
    if getattr(area, "name", "") in SUPERVISOR_EXCLUDED_AREA_NAMES:
        return True
    return False


def worker_paycode_sort_key(worker):
    pay_code = getattr(worker, "pay_code", "") or ""
    try:
        return (0, int(pay_code), (getattr(worker, "name", "") or "").lower(), getattr(worker, "id", 0))
    except (ValueError, TypeError):
        return (1, pay_code, (getattr(worker, "name", "") or "").lower(), getattr(worker, "id", 0))


def task_time_interval(record_or_schedule):
    schedule = getattr(record_or_schedule, "schedule", record_or_schedule)
    start_t = getattr(schedule, "start_time", None)
    end_t = getattr(schedule, "end_time", None)
    if not start_t or not end_t:
        return None
    s = start_t.hour * 60 + start_t.minute
    e = end_t.hour * 60 + end_t.minute
    if e <= s:
        e += 1440
    return (s, e)


def intervals_overlap(int1, int2):
    if not int1 or not int2:
        return True
    s1, e1 = int1
    s2, e2 = int2
    return max(s1, s2) < min(e1, e2)


def get_active_tasks_for_worker(worker_id, date):
    if not worker_id or not date:
        return HKDailyRecord.objects.none()
    return (
        HKDailyRecord.objects.filter(date=date)
        .filter(
            dm.Q(assigned_worker_id=worker_id)
            | dm.Q(worker_assignments__worker_id=worker_id)
        )
        .exclude(status__in=["done", "skipped"])
        .select_related("schedule", "area")
        .distinct()
    )


def is_reliever_busy_for_target(reliever, target_worker=None, date=None, area=None):
    if not reliever:
        return False
    if date is None:
        date = timezone.localdate()

    rel_id = getattr(reliever, "id", reliever)
    target_id = getattr(target_worker, "id", target_worker) if target_worker else None

    # 1. A worker cannot relieve themselves
    if target_id and rel_id == target_id:
        return True

    # 2. Candidate reliever is marked absent or replaced by another worker today
    if HKRelieverSubstitution.objects.filter(original_worker_id=rel_id, date=date).exists():
        return True

    # 3. Active (unfinished) tasks currently assigned to reliever across all areas
    rel_active_tasks = list(get_active_tasks_for_worker(rel_id, date))
    rel_intervals = []
    for t in rel_active_tasks:
        inv = task_time_interval(t)
        if inv:
            rel_intervals.append(inv)

    # 4. Check active substitutions where reliever is covering another worker on date
    active_subs = list(
        HKRelieverSubstitution.objects.filter(reliever_id=rel_id, date=date)
        .exclude(original_worker_id=target_id if target_id else 0)
        .select_related("original_worker", "area")
    )
    has_sub_without_tasks = False
    for sub in active_subs:
        orig_records = HKDailyRecord.objects.filter(
            date=date,
            area=sub.area,
        ).filter(
            dm.Q(assigned_worker_id=sub.original_worker_id)
            | dm.Q(assigned_worker_id=rel_id)
            | dm.Q(worker_assignments__worker_id=sub.original_worker_id)
            | dm.Q(worker_assignments__worker_id=rel_id)
        )
        if orig_records.exists():
            open_records = orig_records.exclude(status__in=["done", "skipped"])
            if open_records.exists():
                for t in open_records.select_related("schedule"):
                    inv = task_time_interval(t)
                    if inv:
                        rel_intervals.append(inv)
                    else:
                        has_sub_without_tasks = True
        else:
            has_sub_without_tasks = True

    has_active_work = bool(rel_active_tasks or rel_intervals or has_sub_without_tasks)

    # 5. Check against target worker / task intervals
    if target_id is not None:
        target_active_tasks = list(get_active_tasks_for_worker(target_id, date))
        target_intervals = []
        for t in target_active_tasks:
            inv = task_time_interval(t)
            if inv:
                target_intervals.append(inv)

        if target_intervals:
            if not rel_intervals and not has_sub_without_tasks:
                return False
            if has_sub_without_tasks:
                return True
            for r_int in rel_intervals:
                for t_int in target_intervals:
                    if intervals_overlap(r_int, t_int):
                        return True
            return False
        else:
            return has_active_work

    return has_active_work


def _format_reliever_options(relievers, user=None, target_worker=None, date=None, area=None):
    if date is None:
        date = timezone.localdate()
    relievers_list = sorted(relievers, key=worker_paycode_sort_key)
    is_common_area = bool(area and getattr(area, "name", "") == "Hostel Common Area")
    formatted = []
    for orig_rel in relievers_list:
        rel = copy.copy(orig_rel)
        rel_paycode = str(getattr(rel, "pay_code", "") or "")
        is_hca = is_common_area or rel_paycode in HOSTEL_COMMON_AREA_RELIEVER_PAYCODES

        if is_hca:
            is_busy = False
            if target_worker and rel.id == getattr(target_worker, "id", None):
                is_busy = True
            elif is_reliever_busy_for_target(rel, target_worker, date, area):
                is_busy = True
            rel.is_busy = is_busy
            area_name = getattr(getattr(rel, "area", None), "name", None) or ""
            if not area_name and getattr(rel, "area_id", None):
                try:
                    from apps.housekeeping.models import HKArea
                    area_obj = HKArea.objects.filter(id=rel.area_id).first()
                    if area_obj:
                        area_name = area_obj.name
                except Exception:
                    pass
            if not area_name and getattr(rel, "pay_code", None):
                matching_worker = (
                    HKWorker.objects.filter(pay_code=rel.pay_code, is_active=True)
                    .exclude(area=None)
                    .select_related("area")
                    .first()
                )
                if matching_worker and matching_worker.area:
                    area_name = matching_worker.area.name

            label = f"{rel.name}"
            if area_name:
                label += f" · {area_name}"
            if rel.pay_code:
                label += f" · #{rel.pay_code}"

            if is_busy:
                rel.reliever_label = f"{label} · Busy"
            else:
                rel.reliever_label = label
        elif rel_paycode in SUPERVISOR_RELIEVER_PAYCODES or getattr(getattr(rel, "area", None), "name", "") == "Deep Cleaning":
            is_busy = is_reliever_busy_for_target(rel, target_worker, date, area) if target_worker else False
            rel.is_busy = is_busy
            label = f"{rel.name} · Deep Cleaning · #{rel.pay_code}"
            if is_busy:
                label += " · Busy"
            rel.reliever_label = label
        else:
            is_busy = is_reliever_busy_for_target(rel, target_worker, date, area) if target_worker else False
            rel.is_busy = is_busy
            label = f"{rel.name}"
            if rel.area:
                label += f" · {rel.area.name}"
            if rel.pay_code:
                label += f" · #{rel.pay_code}"
            if is_busy:
                label += " · Busy"
            rel.reliever_label = label

        formatted.append(rel)
    return formatted


def _hostel_relievers_for_area(qs, area):
    area_name = getattr(area, "name", "") or ""
    assigned = HOSTEL_RELIEVER_ASSIGNMENTS.get(area_name)
    assigned_q = dm.Q()
    if assigned:
        pay_codes = [c for c in assigned.get("pay_codes", []) if c]
        names = [n for n in assigned.get("names", []) if n]
        if pay_codes:
            assigned_q |= dm.Q(pay_code__in=pay_codes)
        if names:
            assigned_q |= dm.Q(name__in=names)

    pool_q = (
        dm.Q(area__name__iexact="Hostels Reliever")
        | dm.Q(area__name__iexact="Hostel Reliever")
        | dm.Q(area__name__iexact="Hostels Relievers")
        | dm.Q(area__name__iexact="Hostel Relievers")
    )

    reliever_q = (assigned_q | pool_q) if assigned_q else pool_q
    matches = qs.filter(reliever_q).distinct().order_by("name")
    if matches.exists():
        return matches

    fallback = qs.filter(is_reliever=True, area__area_type="hostel").distinct().order_by("name")
    if fallback.exists():
        return fallback

    return qs.filter(is_reliever=True).order_by("name")


def _attendance_relievers_for_area(area, user=None):
    qs = HKWorker.objects.filter(is_active=True).select_related("area")
    if not area:
        return qs.none()

    # 1. Ganesh Jayesh exclusion: no reliever option for his account or Deep Cleaning
    if is_ganesh_jayesh_user(user) or area.name == "Deep Cleaning" or getattr(area, "id", None) == 23:
        return qs.none()

    # 2. Excluded areas: reject 6 areas explicitly
    if is_supervisor_excluded_area(area):
        return qs.none()

    # 3. Hostel Common Area: return the 6 registered workers sorted in ascending numerical paycode order
    if area.name == "Hostel Common Area":
        return (
            qs.filter(pay_code__in=HOSTEL_COMMON_AREA_RELIEVER_PAYCODES)
            .annotate(pay_code_num=Cast("pay_code", dm.IntegerField()))
            .order_by("pay_code_num", "name")
        )

    # 4. Hostels: all hostel areas (managed by caretakers or administrators)
    if area_bucket(area) == "hostels":
        return _hostel_relievers_for_area(qs, area)

    # 4b. Academic Block Reliever pools (for supervisors, caretakers, and managers):
    if _uses_academic_reliever_pool(area):
        return (
            qs.filter(
                dm.Q(is_reliever=True, area__name="Old Academic Reliever")
                | dm.Q(is_reliever=True, area=area)
                | dm.Q(pay_code__in=SUPERVISOR_RELIEVER_PAYCODES)
            )
            .distinct()
            .annotate(pay_code_num=Cast("pay_code", dm.IntegerField()))
            .order_by("pay_code_num", "name")
        )

    if _uses_new_academic_reliever_pool(area):
        return (
            qs.filter(
                dm.Q(is_reliever=True, area__name="New Academic Reliever")
                | dm.Q(is_reliever=True, area=area)
                | dm.Q(pay_code__in=SUPERVISOR_RELIEVER_PAYCODES)
            )
            .distinct()
            .annotate(pay_code_num=Cast("pay_code", dm.IntegerField()))
            .order_by("pay_code_num", "name")
        )

    # 5. Caretaker role: preserve existing caretaker reliever behavior for JRHA
    if user and getattr(user, "role", "") == "caretaker":
        if _is_jrha_area(area):
            return qs.filter(area__name__in=JRHA_AREA_NAMES).exclude(area=area).order_by("area__name", "name")


        return qs.none()

    # Fallback for caretaker areas when user object is omitted
    if not user:
        if _is_jrha_area(area):
            return qs.filter(area__name__in=JRHA_AREA_NAMES).exclude(area=area).order_by("area__name", "name")

    # 6. Eligible supervisor-managed areas (and managers viewing supervisor areas):
    # Return master list of 6 relievers sorted in ascending numerical paycode order
    return (
        qs.filter(pay_code__in=SUPERVISOR_RELIEVER_PAYCODES)
        .annotate(pay_code_num=Cast("pay_code", dm.IntegerField()))
        .order_by("pay_code_num", "name")
    )


def _shared_display_worker_qs_for_area(area):
    if not area:
        return HKWorker.objects.none()

    if area.name == "Guest House New":
        # Keep one worker row so attendance marked from either area stays unified.
        return HKWorker.objects.filter(
            is_active=True,
            area__name="Director Bungalow",
            pay_code="305",
            name__iexact="Rakesh Ishvarbhai Parmar",
        )

    if _uses_academic_reliever_pool(area):
        q = dm.Q(area__name="Old Academic Reliever", is_reliever=True)
        if area.name == "Academic Block 8":
            q |= dm.Q(pay_code="309", name__iexact="Parmar Nikulkumar Punjabhai")
        return HKWorker.objects.filter(is_active=True).filter(q)

    if _uses_new_academic_reliever_pool(area):
        return HKWorker.objects.filter(
            is_active=True,
            area__name="New Academic Reliever",
            is_reliever=True,
        )

    return HKWorker.objects.none()


def display_workers_for_area(area):
    if not area:
        return []

    workers = {}
    shared_ids = _shared_display_worker_qs_for_area(area).values_list("id", flat=True)
    for worker in HKWorker.objects.filter(
        dm.Q(area=area) | dm.Q(id__in=shared_ids),
        is_active=True,
    ).order_by("worker_type", "name", "id"):
        workers[worker.id] = worker
    return list(workers.values())


def effective_workers_for_area(area, date=None):
    workers = {worker.id: worker for worker in display_workers_for_area(area)}
    if not area or not date:
        if getattr(area, "area_type", "") == "hostel":
            return sorted(workers.values(), key=lambda w: (w.worker_type or "", worker_paycode_sort_key(w)))
        return sorted(workers.values(), key=worker_paycode_sort_key)

    outgoing_reliever_ids = set()
    # Ganesh Jayesh's Deep Cleaning workers must not be removed from his roster.
    if not (area.name == "Deep Cleaning" or getattr(area, "id", None) == 23):
        outgoing_reliever_ids = set(
            HKRelieverSubstitution.objects.filter(
                date=date,
                reliever_id__in=workers,
            ).exclude(area=area).values_list("reliever_id", flat=True)
        )
        for worker_id in outgoing_reliever_ids:
            workers.pop(worker_id, None)

    incoming_substitutions = list(
        HKRelieverSubstitution.objects.filter(
            area=area,
            date=date,
        ).select_related("original_worker", "reliever")
    )
    if not incoming_substitutions and not outgoing_reliever_ids:
        if getattr(area, "area_type", "") == "hostel":
            return sorted(workers.values(), key=lambda w: (w.worker_type or "", worker_paycode_sort_key(w)))
        return sorted(workers.values(), key=worker_paycode_sort_key)

    for sub in incoming_substitutions:
        workers.pop(sub.original_worker_id, None)
        if sub.reliever and sub.reliever.is_active:
            workers[sub.reliever_id] = sub.reliever

    if getattr(area, "area_type", "") == "hostel":
        return sorted(workers.values(), key=lambda w: (w.worker_type or "", worker_paycode_sort_key(w)))
    return sorted(workers.values(), key=worker_paycode_sort_key)


def display_worker_ids_for_area(area, date=None):
    return {worker.id for worker in effective_workers_for_area(area, date)}


UNASSIGNABLE_ATTENDANCE_STATUSES = {"absent", "leave"}


def attendance_half_for_time(task_time=None):
    if task_time is None:
        return current_half()
    return "first" if task_time.hour < 13 else "second"


def attendance_half_for_record(record):
    schedule = getattr(record, "schedule", None)
    return attendance_half_for_time(getattr(schedule, "start_time", None))


def unavailable_worker_statuses(worker_ids, date, half):
    if not worker_ids or not date or half not in {"first", "second"}:
        return {}
    return dict(
        HKAttendanceRecord.objects.filter(
            worker_id__in=worker_ids,
            date=date,
            half=half,
            status__in=UNASSIGNABLE_ATTENDANCE_STATUSES,
        ).values_list("worker_id", "status")
    )


def mark_unavailable_workers(area_workers, date, half):
    status_by_worker = unavailable_worker_statuses([worker.id for worker in area_workers], date, half)
    for worker in area_workers:
        status = status_by_worker.get(worker.id, "")
        worker.is_unavailable_for_task = bool(status)
        worker.is_absent_for_task = status == "absent"
        worker.unavailable_reason = "Leave" if status == "leave" else ("Absent" if status else "")
    return area_workers


def assignment_workers_for_record(area_workers, record):
    workers = [copy.copy(worker) for worker in area_workers]
    mark_busy_workers(workers, busy_worker_ids_for_tasks(record.area, record.date, exclude_record_id=record.id))
    mark_unavailable_workers(workers, record.date, attendance_half_for_record(record))
    return workers


def unavailable_selection_ids(worker_ids, date, half):
    return set(unavailable_worker_statuses(worker_ids, date, half))


def _substitution_for_reliever(worker, area, date):
    if not worker or not area or not date:
        return None
    return HKRelieverSubstitution.objects.filter(
        reliever=worker,
        area=area,
        date=date,
    ).select_related("original_worker", "reliever").first()


def _mark_reliever_present(reliever, date, marked_by):
    for half in ["first", "second"]:
        att, _ = HKAttendanceRecord.objects.get_or_create(
            worker=reliever,
            date=date,
            half=half,
            defaults={"marked_by": marked_by},
        )
        if not att.is_submitted:
            att.status = "present"
            att.note = "Reliever duty"
            att.marked_by = marked_by
            att.save(update_fields=["status", "note", "marked_by"])


def _move_open_task_assignments_to_reliever(original, reliever, area, date, assigned_by):
    records = HKDailyRecord.objects.filter(
        area=area,
        date=date,
    ).exclude(status="done")

    updated_records = records.filter(assigned_worker=original).update(
        assigned_worker=reliever,
        assigned_by=assigned_by,
        assigned_at=timezone.now(),
    )

    moved_team_rows = 0
    for assignment in HKTaskWorkerAssignment.objects.filter(
        daily_record__in=records,
        worker=original,
    ).select_related("daily_record"):
        if HKTaskWorkerAssignment.objects.filter(
            daily_record=assignment.daily_record,
            worker=reliever,
        ).exists():
            assignment.delete()
            continue
        assignment.worker = reliever
        assignment.assigned_by = assigned_by
        assignment.save(update_fields=["worker", "assigned_by"])
        moved_team_rows += 1

    return updated_records, moved_team_rows


def _auto_second_status_from_first(first_status):
    if first_status in {"present", "late"}:
        return "present"
    if first_status in {"absent", "leave"}:
        return first_status
    return "present"


def _auto_create_second_half_from_first(workers, date, marked_by):
    worker_ids = list(workers.values_list("id", flat=True) if hasattr(workers, "values_list") else [w.id for w in workers])
    if not worker_ids:
        return 0
    first_status_by_worker = dict(
        HKAttendanceRecord.objects.filter(
            worker_id__in=worker_ids,
            date=date,
            half="first",
        ).values_list("worker_id", "status")
    )
    if not first_status_by_worker:
        return 0
    existing_second = list(
        HKAttendanceRecord.objects.filter(
            worker_id__in=first_status_by_worker.keys(),
            date=date,
            half="second",
        )
    )
    existing_second_ids = {att.worker_id for att in existing_second}
    for att in existing_second:
        if att.is_submitted or att.note != "Auto from first half":
            continue
        next_status = _auto_second_status_from_first(first_status_by_worker.get(att.worker_id))
        if att.status != next_status:
            att.status = next_status
            att.marked_by = marked_by
            att.save(update_fields=["status", "marked_by"])

    records = [
        HKAttendanceRecord(
            worker_id=worker_id,
            date=date,
            half="second",
            status=_auto_second_status_from_first(first_status_by_worker.get(worker_id)),
            marked_by=marked_by,
            note="Auto from first half",
        )
        for worker_id in sorted(set(first_status_by_worker) - existing_second_ids)
    ]
    HKAttendanceRecord.objects.bulk_create(records, ignore_conflicts=True)
    return len(records)


def _uses_sunday_special_only(area):
    return bool(area and area.area_type == "research_park")


SWM_WEEKDAY_NAMES = {
    0: "monday",
    1: "tuesday",
    2: "wednesday",
    3: "thursday",
    4: "friday",
    5: "saturday",
    6: "sunday",
}


def _template_matches_day(template, day_idx, target_date=None):
    if getattr(template, "is_optional_weekend_task", False):
        return day_idx in {5, 6}

    desc = (template.task_description or "").lower()
    today = SWM_WEEKDAY_NAMES.get(day_idx)

    if "days:" in desc:
        day_text = desc.split("days:", 1)[1].split("|", 1)[0]
        if "daily" not in day_text and "every day" not in day_text:
            weekday_match = bool(today and today in day_text)
            if "monday to friday" in day_text:
                weekday_match = day_idx in {0, 1, 2, 3, 4}
            if not weekday_match:
                return False

    if "cycle:" in desc and "fortnightly" in desc:
        if target_date is None:
            return day_idx == 0
        anchor = datetime.date(2026, 1, 5)
        return ((target_date - anchor).days % 15) == 0

    for rule_key, rule_day_idx in (("saturdays:", 5), ("sundays:", 6)):
        if rule_key not in desc:
            continue
        if day_idx != rule_day_idx:
            return False
        if target_date is None:
            return True
        rule_text = desc.split(rule_key, 1)[1].split("|", 1)[0]
        week_index = ((target_date.day - 1) // 7) + 1
        rules = {
            "first": 1,
            "1st": 1,
            "second": 2,
            "2nd": 2,
            "third": 3,
            "3rd": 3,
            "fourth": 4,
            "4th": 4,
            "fifth": 5,
            "5th": 5,
        }
        allowed = {index for label, index in rules.items() if label in rule_text}
        if "monthly" in rule_text and not allowed:
            allowed = {1}
        if allowed and week_index not in allowed:
            return False

    return True


def _swm_template_matches_day(template, day_idx):
    return _template_matches_day(template, day_idx)


def _normalize_break_templates_for_area(area):
    if not area or area.area_type in {"hostel", "swm"}:
        return

    templates = HKScheduleTemplate.objects.filter(area=area, frequency="daily", is_active=True)
    if area.name == "Research Park":
        for label, minutes, start_time in (
            ("Tea Break", 15, datetime.time(10, 30)),
            ("Lunch Break", 60, datetime.time(13, 0)),
        ):
            break_templates = list(
                templates
                .filter(task_name__icontains=label)
                .order_by("start_time", "order", "id")
            )
            for index, template in enumerate(break_templates):
                if index == 0:
                    fixed_end = (
                        datetime.datetime.combine(datetime.date.today(), start_time)
                        + datetime.timedelta(minutes=minutes)
                    ).time()
                    updates = []
                    if template.task_name != label:
                        template.task_name = label
                        updates.append("task_name")
                    if template.start_time != start_time:
                        template.start_time = start_time
                        updates.append("start_time")
                    if template.end_time != fixed_end:
                        template.end_time = fixed_end
                        updates.append("end_time")
                    if template.worker_tag != "all":
                        template.worker_tag = "all"
                        updates.append("worker_tag")
                    if template.task_description != "Days: Monday to Friday":
                        template.task_description = "Days: Monday to Friday"
                        updates.append("task_description")
                    if template.requires_photo:
                        template.requires_photo = False
                        updates.append("requires_photo")
                    if updates:
                        template.save(update_fields=updates)
                    continue

                template.is_active = False
                template.requires_photo = False
                template.save(update_fields=["is_active", "requires_photo"])
        templates = HKScheduleTemplate.objects.filter(area=area, frequency="daily", is_active=True)

    for template in templates.filter(task_name__icontains="Tea Break"):
        fixed_end = (
            datetime.datetime.combine(datetime.date.today(), template.start_time)
            + datetime.timedelta(minutes=15)
        ).time()
        updates = []
        if template.end_time != fixed_end:
            template.end_time = fixed_end
            updates.append("end_time")
        if template.requires_photo:
            template.requires_photo = False
            updates.append("requires_photo")
        if updates:
            template.save(update_fields=updates)

    for template in templates.filter(task_name__icontains="Lunch Break"):
        fixed_end = (
            datetime.datetime.combine(datetime.date.today(), template.start_time)
            + datetime.timedelta(minutes=60)
        ).time()
        updates = []
        if template.end_time != fixed_end:
            template.end_time = fixed_end
            updates.append("end_time")
        if template.requires_photo:
            template.requires_photo = False
            updates.append("requires_photo")
        if updates:
            template.save(update_fields=updates)


def _schedule_templates_for_day(area, day_idx, target_date=None):
    _normalize_break_templates_for_area(area)
    base_qs = HKScheduleTemplate.objects.filter(area=area, is_active=True)
    if day_idx == 6 and _uses_sunday_special_only(area):
        return base_qs.filter(frequency="sunday_extra")

    if day_idx == 6 and area and area.area_type == "academic":
        daily_ids = list(base_qs.filter(frequency="daily").values_list("pk", flat=True))
        sunday_ids = [
            template.pk
            for template in base_qs.filter(frequency="sunday_extra").select_related("area")
            if _template_matches_day(template, day_idx, target_date)
        ]
        return base_qs.filter(pk__in=[*daily_ids, *sunday_ids])

    templates = base_qs.filter(frequency="daily")
    if day_idx == 5:
        templates = (templates | base_qs.filter(frequency="saturday_special")).distinct()
    if day_idx == 6:
        templates = (templates | base_qs.filter(frequency="sunday_extra")).distinct()
    template_ids = [
        template.pk
        for template in templates.select_related("area")
        if _template_matches_day(template, day_idx, target_date)
    ]
    return base_qs.filter(pk__in=template_ids)


def _dashboard_section_labels(area):
    labels = {
        "tab_label_floor": "Floor Work",
        "tab_label_room": "Room Work",
        "tab_label_washroom": "Washroom",
        "tab_label_special": "Special Work",
        "tab_label_extra": "Extra Work",
        "heading_floor": "Floor Tasks",
        "heading_room": "Room Tasks",
        "heading_washroom": "Washroom Tasks",
        "heading_special": "Special Work",
    }
    area_name = (area.name or "") if area else ""

    if area_name == "Hostel Common Area":
        labels.update({
            "tab_label_floor": "Day Route",
            "tab_label_room": "Core Zone",
            "tab_label_washroom": "Night Washroom",
            "heading_floor": "Day Route Operations",
            "heading_room": "Core Common Zones",
            "heading_washroom": "Night Washroom Route",
        })
    elif area_name == "Research Park":
        labels.update({
            "tab_label_floor": "Ground Floor",
            "tab_label_room": "Second Floor",
            "tab_label_washroom": "Third Floor",
            "heading_floor": "Ground Floor Tasks",
            "heading_room": "Second Floor Tasks",
            "heading_washroom": "Third Floor Tasks",
            "tab_label_special": "Weekend Work",
            "heading_special": "Weekend Tasks",
        })
    elif area_name == "Central Arcade":
        labels.update({
            "tab_label_floor": "Ground Work",
            "tab_label_room": "Hall Work",
            "tab_label_washroom": "Washroom",
            "heading_floor": "Ground and Entry Operations",
            "heading_room": "First Floor and Hall Operations",
            "heading_washroom": "Second Floor and Washroom Operations",
        })
    elif area_name == "Sports Complex":
        labels.update({
            "tab_label_floor": "Indoor Work",
            "tab_label_room": "Hall Work",
            "tab_label_washroom": "Pool & Washroom",
            "heading_floor": "Indoor and Evening Operations",
            "heading_room": "Hall and Office Operations",
            "heading_washroom": "Washroom and Pool Utility Operations",
        })
    elif area_name == "Guest House New":
        labels.update({
            "tab_label_floor": "Ground Floor",
            "tab_label_room": "Rooms",
            "tab_label_washroom": "Upper & Washroom",
            "heading_floor": "Ground Floor and Canteen Operations",
            "heading_room": "Room Operations",
            "heading_washroom": "Upper Floor and Washroom Operations",
        })
    elif area_name == "Director Bungalow":
        labels.update({
            "tab_label_floor": "Outdoor Work",
            "tab_label_room": "Inside Work",
            "tab_label_washroom": "Washroom",
            "heading_floor": "Bungalow Surrounding and Garden Operations",
            "heading_room": "Inside Bungalow and Camp Office Operations",
            "heading_washroom": "Common Washroom and Kitchen Checks",
        })
    elif area_name == "Roads & Outdoor":
        labels.update({
            "tab_label_floor": "Parking Route",
            "tab_label_room": "Residence Route",
            "tab_label_washroom": "Academic Route",
            "heading_floor": "Parking and Circle Route Operations",
            "heading_room": "Residence and RB Connector Routes",
            "heading_washroom": "Academic, Hostel and Gate-5 Route Operations",
        })
    elif area_name == "Solid Waste Management":
        labels.update({
            "tab_label_floor": "T1",
            "tab_label_room": "T2",
            "tab_label_washroom": "T3",
            "heading_floor": "Team 1 - HB + AB Team",
            "heading_room": "Team 2 - CNG Vehicle Team",
            "heading_washroom": "Team 3 - Hotel Team",
        })
    elif _is_jrha_area(area):
        labels.update({
            "tab_label_room": "General Work",
            "tab_label_special": "Special Work",
            "heading_room": "General Tasks",
            "heading_special": "Special Tasks",
        })
    elif area and area.area_type == "academic":
        labels.update({
            "tab_label_floor": "Block Work",
            "tab_label_room": "Lab & Office",
            "tab_label_washroom": "Washroom",
            "heading_floor": "Block and Corridor Operations",
            "heading_room": "Classroom, Lab and Office Operations",
            "heading_washroom": "Washroom and Common Area Operations",
        })

    return labels


def _build_usage_issues(user, area=None, limit=None):
    if not area:
        return []

    usage_logs_qs = ItemUsageLog.objects.select_related('logged_by').order_by('-logged_at')
    area_filter = Q(request__hkstockrequest__area=area)
    if hasattr(area, 'name') and area.name:
        area_filter |= (
            Q(request__hkstockrequest__isnull=True) &
            Q(request__purpose__startswith=f"[HK - {area.name}]")
        )

    issues_qs = ItemIssue.objects.select_related(
        'request',
        'request__item',
        'request__item__category',
        'request__requested_by',
        'request__hkstockrequest__area',
        'issued_by',
    ).prefetch_related(
        Prefetch('usage_logs', queryset=usage_logs_qs)
    ).annotate(
        total_consumed=Coalesce(
            Sum('usage_logs__quantity_used'),
            Value(0),
            output_field=DecimalField(max_digits=10, decimal_places=2),
        )
    ).filter(
        Q(request__requested_by=user) & area_filter
    ).exclude(
        is_reversed=True
    ).exclude(
        request__status=ItemRequest.Status.REJECTED
    ).order_by('-issued_at')

    issues = []
    for issue in issues_qs:
        total_used = issue.total_consumed or Decimal('0')
        issued_qty = Decimal(issue.issued_quantity)
        remaining = issued_qty - total_used
        issue.remaining_quantity = remaining if remaining > 0 else Decimal('0')
        issue.has_remaining = remaining > 0
        if issued_qty > 0:
            issue.consumption_percent = int(min((total_used / issued_qty) * 100, 100))
        else:
            issue.consumption_percent = 0
        if issue.request.item.item_type == "asset":
            if issue.returned_at:
                continue
        elif issue.remaining_quantity <= 0:
            continue
        issues.append(issue)
        if limit and len(issues) >= limit:
            break
    return issues


def _annotate_blocked_area_stocks(user, sel_area, area_stocks):
    if not sel_area or not area_stocks:
        return
    from apps.inventory.models import Item
    item_names = [s.item_name for s in area_stocks]
    items_by_name = {
        item.name.lower(): item
        for item in Item.objects.filter(name__in=item_names)
    }
    for s in area_stocks:
        matched_item = items_by_name.get(s.item_name.lower())
        if matched_item:
            out_qty = get_unaccounted_item_quantity(user, matched_item, area=sel_area)
            s.is_blocked = out_qty > Decimal('0.00')
            s.outstanding_quantity = out_qty
        else:
            s.is_blocked = False
            s.outstanding_quantity = Decimal('0.00')


def _create_incharge_notice(user, assignment, message, level="info"):
    if not user:
        return
    HKInchargeNotification.objects.create(
        user=user,
        assignment=assignment,
        message=message,
        level=level,
    )


def _staff_candidates_for_area(target_area, exclude_user_id=None):
    """
    Return eligible caretaker/supervisor users for temporary incharge selection.
    Group matching rule:
    - Hostels -> hostel staff only
    - Academic -> academic staff only
    - Others -> others staff only
    """
    target_group = area_bucket(target_area)
    links = (
        HKUserArea.objects.select_related("user", "area")
        .filter(
            user__is_active=True,
            user__role__in=["supervisor", "caretaker"],
        )
        .order_by("user__first_name", "user__username", "area__name")
    )
    by_user = {}
    for link in links:
        if exclude_user_id and link.user_id == exclude_user_id:
            continue
        if area_bucket(link.area) != target_group:
            continue
        by_user.setdefault(link.user_id, {"user": link.user, "areas": []})
        by_user[link.user_id]["areas"].append(link.area)
    _add_permanent_reliever_candidates(by_user, exclude_user_id=exclude_user_id)
    return list(by_user.values())


def _staff_candidates_for_all_areas(exclude_user_id=None):
    """
    Return active caretaker/supervisor users from all area groups.
    Used when leave scope is all assigned areas.
    """
    links = (
        HKUserArea.objects.select_related("user", "area")
        .filter(
            user__is_active=True,
            user__role__in=["supervisor", "caretaker"],
        )
        .order_by("user__first_name", "user__username", "area__name")
    )
    by_user = {}
    for link in links:
        if exclude_user_id and link.user_id == exclude_user_id:
            continue
        by_user.setdefault(link.user_id, {"user": link.user, "areas": []})
        if not any(a.id == link.area_id for a in by_user[link.user_id]["areas"]):
            by_user[link.user_id]["areas"].append(link.area)
    _add_permanent_reliever_candidates(by_user, exclude_user_id=exclude_user_id)
    return list(by_user.values())


def _add_permanent_reliever_candidates(by_user, exclude_user_id=None):
    relievers = UserModel.objects.filter(
        username__in=PERMANENT_RELIEVER_USERNAMES,
        is_active=True,
        role__in=["supervisor", "caretaker"],
    ).order_by("first_name", "username")
    for user in relievers:
        if exclude_user_id and user.id == exclude_user_id:
            continue
        by_user.setdefault(user.id, {"user": user, "areas": []})


def _staff_candidates_for_leave_request(leave_req, exclude_user_id=None):
    if getattr(leave_req, "all_areas", False):
        return _staff_candidates_for_all_areas(exclude_user_id=exclude_user_id)
    return _staff_candidates_for_area(leave_req.area, exclude_user_id=exclude_user_id)


def _leave_scope_label(leave_req):
    if getattr(leave_req, "all_areas", False):
        return "all assigned areas"
    if leave_req.area:
        return leave_req.area.name
    return "assigned area"


def _assign_incharge_for_leave(leave_req, assigned_staff, acted_by_user, note=""):
    leave_staff_name = leave_req.staff.get_full_name() or leave_req.staff.username
    assigned_staff_name = assigned_staff.get_full_name() or assigned_staff.username
    scope_label = _leave_scope_label(leave_req)
    assignment, _ = HKInchargeAssignment.objects.update_or_create(
        leave_request=leave_req,
        defaults={
            "area": leave_req.area,
            "leave_staff": leave_req.staff,
            "leave_staff_name": leave_staff_name,
            "leave_staff_area": area_bucket(leave_req.area),
            "leave_date": leave_req.leave_date,
            "assigned_staff": assigned_staff,
            "assigned_staff_name": assigned_staff_name,
            "cover_all_areas": bool(getattr(leave_req, "all_areas", False)),
            "status": "pending_acceptance",
            "staff_action_at": None,
            "staff_action_note": "",
            "admin_action_by": None,
            "admin_action_at": None,
            "admin_action_note": "",
            "arrival_notified": False,
        },
    )
    leave_req.status = "pending_acceptance"
    leave_req.save(update_fields=["status", "updated_at"])

    note_line = (note or "").strip()
    msg = (
        f"You have been assigned as Temporary Incharge for {scope_label} "
        f"on {leave_req.leave_date} by {leave_staff_name}."
    )
    if note_line:
        msg = f"{msg} Note: {note_line}"
    _create_incharge_notice(assigned_staff, assignment, msg, level="info")
    _create_incharge_notice(
        leave_req.staff,
        assignment,
        f"Incharge request sent to {assigned_staff_name} for {scope_label} on {leave_req.leave_date}. Awaiting their confirmation.",
        level="info",
    )
    if acted_by_user and acted_by_user.id != leave_req.staff_id:
        _create_incharge_notice(
            leave_req.staff,
            assignment,
            f"Admin submitted incharge request to {assigned_staff_name} for {scope_label} on {leave_req.leave_date}.",
            level="info",
        )
    return assignment


def get_user_areas(user):
    if can_manage_housekeeping_user(user):
        return HKArea.objects.filter(is_active=True)
    assigned_area_ids = set(
        HKArea.objects.filter(assigned_users__user=user, is_active=True).values_list("id", flat=True)
    )
    today = timezone.localdate()
    assignment_qs = (
        HKInchargeAssignment.objects.filter(
            assigned_staff=user,
            leave_date__gte=today,
        )
        .filter(
            dm.Q(status__in=["pending_acceptance", "pending_admin_approval"])
            | dm.Q(status="approved", leave_date=today)
        )
        .select_related("leave_staff")
    )
    temp_incharge_area_ids = set()
    leave_staff_ids_for_all_scope = set()
    for assignment in assignment_qs:
        if assignment.cover_all_areas:
            leave_staff_ids_for_all_scope.add(assignment.leave_staff_id)
        elif assignment.area_id:
            temp_incharge_area_ids.add(assignment.area_id)

    if leave_staff_ids_for_all_scope:
        temp_incharge_area_ids.update(
            HKUserArea.objects.filter(
                user_id__in=leave_staff_ids_for_all_scope,
                area__is_active=True,
            ).values_list("area_id", flat=True)
        )

    temporary_area_ids = set(
        HKTemporaryStaffAreaAssignment.objects.filter(
            staff=user,
            revoked_at__isnull=True,
            start_date__lte=today,
            end_date__gte=today,
            area__is_active=True,
        ).values_list("area_id", flat=True)
    )

    all_ids = assigned_area_ids | temp_incharge_area_ids | temporary_area_ids
    if not all_ids:
        return HKArea.objects.none()

    assigned_areas = list(HKArea.objects.filter(is_active=True, id__in=all_ids))

    # Academic supervisors for Blocks 1-9 should also see the shared academic reliever pool.
    if any(_uses_academic_reliever_pool(area) for area in assigned_areas):
        academic_reliever_area_id = HKArea.objects.filter(name='Old Academic Reliever', is_active=True).values_list('id', flat=True).first()
        if academic_reliever_area_id:
            all_ids.add(academic_reliever_area_id)

    # Academic supervisors for Blocks 10-13 + the new academic areas should see their reliever pool only.
    if any(_uses_new_academic_reliever_pool(area) for area in assigned_areas):
        new_academic_reliever_area_id = HKArea.objects.filter(name='New Academic Reliever', is_active=True).values_list('id', flat=True).first()
        if new_academic_reliever_area_id:
            all_ids.add(new_academic_reliever_area_id)

    return HKArea.objects.filter(is_active=True, id__in=all_ids)


def visible_user_areas(user, user_areas):
    if can_manage_housekeeping_user(user):
        return user_areas
    return user_areas.exclude(name__in=STAFF_HIDDEN_AREA_NAMES)


def hk_required(fn):
    @functools.wraps(fn)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return redirect(f"/housekeeping/login/?next={request.path}")
        # deactivated users must not pass through even if role matches
        if not request.user.is_active:
            return redirect("/housekeeping/login/")
        if request.user.role not in HOUSEKEEPING_STAFF_ROLES:
            return redirect("/housekeeping/login/")
        return fn(request, *args, **kwargs)
    return wrapper


def selected_area(request, user_areas):
    aid = request.GET.get("area") or request.POST.get("area") or request.GET.get("area_id") or request.POST.get("area_id")
    if aid:
        try:
            area = user_areas.filter(pk=aid).first()
            if area:
                return area
        except (ValueError, TypeError):
            pass
    return user_areas.first()


VISIBLE_DASHBOARD_TAGS = {
    "floor",
    "room",
    "washroom",
    "t1",
    "t2",
    "t3",
    "t4",
    "t5",
    "all",
    "previous_day",
}


def dashboard_group_tag(record, area):
    tag = (record.schedule.worker_tag or "general").strip().lower()
    task_text = f"{record.schedule.task_name or ''} {record.schedule.task_description or ''}".lower()
    area_name = (area.name or "") if area else ""

    if getattr(record, "is_direct_staff_task", False):
        return "all"
    if getattr(record, "is_previous_day_task", False):
        return "previous_day"

    if area_name == "Research Park":
        research_hint = f"{tag} {task_text}"
        if any(token in research_hint for token in ["2nd", "second", "2f"]):
            return "room"
        if any(token in research_hint for token in ["3rd", "third", "3f"]):
            return "washroom"
        if any(token in research_hint for token in ["ground", "gf", "g/f"]):
            return "floor"

    if _is_jrha_area(area) and tag == "general":
        return "room"
    if area_name == "Old Guest House" and tag == "all" and is_break_task_name(record.schedule.task_name):
        return "floor"
    if tag in VISIBLE_DASHBOARD_TAGS:
        return tag
    return "floor"


def get_today_records(area, date, user=None):
    """
    Generate HKDailyRecord for every applicable template for this area/date.
    daily templates run every day.
    saturday_special templates run only on Saturday.
    sunday_extra templates run only on Sunday.
    Research Park uses Sunday special work only; other areas keep daily + Sunday work.
    """
    from django.db import IntegrityError, transaction

    dow = date.weekday()  # 0=Mon, 6=Sun
    if _is_jrha_night_caretaker(user) and _is_jrha_area(area):
        template_list = _ensure_jrha_night_templates(area)
        templates = HKScheduleTemplate.objects.filter(pk__in=[tmpl.pk for tmpl in template_list])
    else:
        templates = _schedule_templates_for_day(area, dow, date)
        template_list = list(templates.order_by("worker_tag", "order", "start_time"))

    if area and area.name == "Guest House New":
        template_list = [tmpl for tmpl in template_list if tmpl.worker_tag != "previous_day"]

    # Find which templates already have a record for today in one query
    existing_schedule_ids = set(
        HKDailyRecord.objects.filter(
            area=area, date=date, schedule__in=template_list
        ).values_list("schedule_id", flat=True)
    )

    # Only create records for templates that don't have one yet
    missing = [t for t in template_list if t.pk not in existing_schedule_ids]
    if missing:
        with transaction.atomic():
            for tmpl in missing:
                try:
                    HKDailyRecord.objects.get_or_create(
                        schedule=tmpl,
                        area=area,
                        date=date,
                        defaults={"originating_template": tmpl},
                    )
                except IntegrityError:
                    # Another concurrent request created this row between our
                    # check and insert — safe to ignore, record already exists.
                    pass

    active_records = (
        HKDailyRecord.objects
        .filter(area=area, date=date, schedule__in=template_list)
        .select_related("schedule", "completed_by", "assigned_worker", "assigned_by", "area")
        .prefetch_related("worker_assignments__worker")
        .order_by("schedule__worker_tag", "schedule__order", "schedule__start_time")
    )

    temporary_task_records = (
        HKDailyRecord.objects
        .filter(
            area=area,
            date=date,
            schedule__is_active=False,
            schedule__worker_tag="all",
        )
        .exclude(schedule__task_description__icontains=JRHA_NIGHT_TASK_MARKER)
        .exclude(schedule__in=template_list)
        .select_related("schedule", "completed_by", "assigned_worker", "assigned_by", "area")
        .prefetch_related("worker_assignments__worker")
        .order_by("schedule__order", "schedule__start_time")
    )

    if _is_jrha_night_caretaker(user) and _is_jrha_area(area):
        records = list(active_records)
    else:
        records = list(active_records) + list(temporary_task_records)
    _attach_optional_weekend_metadata(records, area, date)
    for record in records:
        record.is_direct_staff_task = bool(
            record.schedule.worker_tag == "night_caretaker"
            and JRHA_NIGHT_TASK_MARKER in (record.schedule.task_description or "")
        )
    return records


def is_optional_weekend_record(record):
    schedule = getattr(record, "schedule", None)
    return bool(schedule and getattr(schedule, "is_optional_weekend_task", False))


def optional_weekend_record_is_selected(record):
    if not is_optional_weekend_record(record):
        return True
    if getattr(record, "assigned_worker_id", None):
        return True
    if getattr(record, "status", "") in {"in_progress", "done"}:
        return True
    try:
        return record.worker_assignments.exists()
    except Exception:
        return False


def record_counts_for_progress(record):
    schedule = getattr(record, "schedule", None)
    if schedule and is_break_task_name(getattr(schedule, "task_name", "")):
        return False
    return (not is_optional_weekend_record(record)) or optional_weekend_record_is_selected(record)


def progress_records(records):
    return [record for record in records if record_counts_for_progress(record)]


def _attach_optional_weekend_metadata(records, area, date):
    optional_records = [
        record
        for record in records
        if is_optional_weekend_record(record) and getattr(record, "schedule", None)
    ]
    if not optional_records:
        return records

    task_names = {record.schedule.task_name for record in optional_records}
    last_done = {
        row["schedule__task_name"]: row["last_completed"]
        for row in (
            HKDailyRecord.objects
            .filter(
                area=area,
                date__lt=date,
                status="done",
                schedule__task_name__in=task_names,
            )
            .values("schedule__task_name")
            .annotate(last_completed=Max("date"))
        )
    }
    for record in optional_records:
        record.is_optional_weekend_task = True
        record.last_executed_date = last_done.get(record.schedule.task_name)
    return records


def get_guest_house_previous_day_records(area, today):
    """Show yesterday's evening/night Guest House work on today's supervisor dashboard."""
    if not area or area.name != "Guest House New":
        return []

    previous_date = today - datetime.timedelta(days=1)
    templates = list(
        HKScheduleTemplate.objects.filter(
            area=area,
            is_active=True,
            frequency="daily",
            worker_tag="previous_day",
        ).order_by("order", "start_time")
    )
    if not templates:
        return []

    from django.db import IntegrityError, transaction

    existing_schedule_ids = set(
        HKDailyRecord.objects.filter(
            area=area,
            date=previous_date,
            schedule__in=templates,
        ).values_list("schedule_id", flat=True)
    )
    missing = [tmpl for tmpl in templates if tmpl.pk not in existing_schedule_ids]
    if missing:
        with transaction.atomic():
            for tmpl in missing:
                try:
                    HKDailyRecord.objects.get_or_create(
                        schedule=tmpl,
                        area=area,
                        date=previous_date,
                        defaults={"originating_template": tmpl},
                    )
                except IntegrityError:
                    pass

    records = list(
        HKDailyRecord.objects
        .filter(area=area, date=previous_date, schedule__in=templates)
        .select_related("schedule", "completed_by", "assigned_worker", "assigned_by", "area")
        .prefetch_related("worker_assignments__worker")
        .order_by("schedule__order", "schedule__start_time")
    )
    for record in records:
        record.is_previous_day_task = True
    return records


def task_completion_sort_key(record):
    """Keep active work above completed work while preserving schedule order."""
    done_rank = 1 if getattr(record, "status", "") == "done" else 0
    optional_rank = 1 if is_optional_weekend_record(record) else 0
    last_executed = getattr(record, "last_executed_date", None) or datetime.date.min
    schedule = getattr(record, "schedule", None)
    return (
        done_rank,
        optional_rank,
        last_executed,
        getattr(schedule, "start_time", None),
        getattr(schedule, "order", 0),
        getattr(record, "id", 0),
    )


def current_half():
    h = timezone.localtime(timezone.now()).hour
    return "first" if h < 13 else "second"


def _has_evening_or_night_workers(workers):
    return any(getattr(worker, "shift", "") in {"evening", "night"} for worker in workers or [])


EXTENDED_SECOND_HALF_AREAS_BY_USER = {
    "ashok.rathod": {"Canteen, Gate-01 and Gate-02", "Guest House New", "Director Bungalow"},
    "bharat.solanki": {"Central Arcade", "Sports Complex"},
}
SHOW_ALL_AREAS_USERNAMES = {"ashok.rathod"}
# Users allowed to mark yesterday's second-half/night attendance after the
# calendar day has rolled over (night shift ends after midnight).
NIGHT_ATTENDANCE_CATCHUP_USERNAMES = {"ashok.rathod"}


def _has_extended_second_half_access(sel_date, user=None, area=None, workers=None):
    allowed_areas = EXTENDED_SECOND_HALF_AREAS_BY_USER.get(getattr(user, "username", ""))
    return bool(
        allowed_areas
        and area
        and area.name in allowed_areas
        and _has_evening_or_night_workers(workers)
    )


def attendance_half_is_open(sel_date, half, user=None, area=None, workers=None):
    """Today attendance is editable only during the matching half window."""
    if sel_date != timezone.localdate():
        return True
    now_time = timezone.localtime(timezone.now()).time()
    if half == "first":
        return datetime.time(8, 0) <= now_time < datetime.time(13, 0)
    if half == "second":
        if _has_extended_second_half_access(sel_date, user=user, area=area, workers=workers):
            return now_time >= datetime.time(13, 0)
        return datetime.time(13, 0) <= now_time < datetime.time(17, 0)
    return False


def busy_worker_ids_for_tasks(area, date, exclude_record_id=None):
    if area is None:
        return set()
    active_records = HKDailyRecord.objects.filter(area=area, date=date).exclude(status="done")
    if exclude_record_id:
        active_records = active_records.exclude(pk=exclude_record_id)
    busy_ids = set(
        active_records
        .exclude(assigned_worker__isnull=True)
        .values_list("assigned_worker_id", flat=True)
    )
    busy_ids.update(
        HKTaskWorkerAssignment.objects
        .filter(daily_record__in=active_records)
        .values_list("worker_id", flat=True)
    )
    return busy_ids


def mark_busy_workers(area_workers, busy_worker_ids):
    for worker in area_workers:
        worker.is_busy_for_task = worker.id in busy_worker_ids
    return area_workers


BREAK_TASK_RE = re.compile(r"(^|[^a-z0-9])break([^a-z0-9]|$)", re.IGNORECASE)


def is_break_task_name(task_name):
    return bool(BREAK_TASK_RE.search(task_name or ""))


def can_multi_worker_task(user, record):
    if not record or not record.area:
        return False
    if (
        record.schedule.worker_tag == "night_caretaker"
        and JRHA_NIGHT_TASK_MARKER in (record.schedule.task_description or "")
    ):
        return False

    if record.area.area_type == "research_park":
        desc = record.schedule.task_description or ""
        return bool(
            getattr(record.schedule, "is_optional_weekend_task", False)
            or not getattr(record.schedule, "is_active", True)
            or "mode=temporary" in desc
        )

    return bool(
        record.area.area_type in {
            "hostel",
            "academic",
            "central_arcade",
            "sports",
            "roads",
            "swm",
            "guesthouse",
            "director",
            "other",
        }
        and getattr(user, "role", "") in HOUSEKEEPING_STAFF_ROLES
    )


def hk_mobile_special_card(today, total_tasks, done_tasks):
    if total_tasks and done_tasks >= total_tasks:
        return {
            "tone": "success",
            "title": "All Tasks Completed",
            "body": "Thank you. Today's work is fully recorded for this area.",
            "meta": "Great finish",
        }

    fixed_days = {
        (1, 26): ("Republic Day", "Special day. Keep campus spaces ready and clean."),
        (5, 1): ("Labour Day", "Thank you for the work that keeps the campus running."),
        (8, 15): ("Independence Day", "Special day. Keep key areas event-ready."),
        (10, 2): ("Gandhi Jayanti", "Cleanliness work matters even more today."),
    }
    fixed = fixed_days.get((today.month, today.day))
    if fixed:
        return {
            "tone": "warm",
            "title": fixed[0],
            "body": fixed[1],
            "meta": "Special occasion",
        }

    if today.weekday() == 6:
        return {
            "tone": "focus",
            "title": "Sunday Special Work",
            "body": "Weekly tasks are active today. Review special and extra work before closing.",
            "meta": "Weekly focus",
        }

    if today.day == 1:
        return {
            "tone": "focus",
            "title": "New Month Started",
            "body": "Start the month with clean attendance and task records.",
            "meta": today.strftime("%B"),
        }

    return None


def hk_mobile_festival_card(today):
    festival_days = {
        (1, 1): "New Year's Day",
        (1, 3): "Hazarat Ali's Birthday",
        (1, 14): "Pongal / Makar Sankranti",
        (1, 23): "Vasant Panchami",
        (1, 26): "Republic Day",
        (2, 1): "Guru Ravidas Jayanti",
        (2, 12): "Maharishi Dayanand Saraswati Jayanti",
        (2, 14): "Valentine's Day",
        (2, 15): "Maha Shivaratri",
        (2, 17): "Lunar New Year",
        (2, 19): "Ramadan Start / Shivaji Jayanti",
        (3, 3): "Holika Dahana",
        (3, 4): "Holi",
        (3, 19): "Ugadi / Gudi Padwa",
        (3, 20): "Jamat Ul-Vida / March Equinox",
        (3, 21): "Id-ul-Fitr",
        (3, 26): "Rama Navami",
        (3, 31): "Mahavir Jayanti",
        (4, 2): "Passover / Maundy Thursday",
        (4, 3): "Good Friday",
        (4, 5): "Easter Day",
        (4, 14): "Vaisakhi / Mesadi / Ambedkar Jayanti",
        (4, 15): "Bahag Bihu",
        (5, 1): "Buddha Purnima / International Worker's Day",
        (5, 9): "Rabindranath Tagore Jayanti",
        (5, 10): "Mother's Day",
        (5, 28): "Bakrid",
        (6, 21): "Father's Day / June Solstice",
        (6, 26): "Muharram / Ashura",
        (7, 16): "Rath Yatra",
        (8, 2): "Friendship Day",
        (8, 15): "Independence Day",
        (8, 26): "Milad un-Nabi / Onam",
        (8, 28): "Raksha Bandhan",
        (9, 4): "Janmashtami",
        (9, 14): "Ganesh Chaturthi",
        (9, 23): "September Equinox",
        (10, 2): "Mahatma Gandhi Jayanti",
        (10, 11): "Sharad Navratri Begins",
        (10, 17): "Durga Puja Festivities Begin",
        (10, 18): "Maha Saptami",
        (10, 19): "Maha Ashtami",
        (10, 20): "Dussehra",
        (10, 26): "Maharishi Valmiki Jayanti",
        (10, 29): "Karaka Chaturthi",
        (10, 31): "Halloween",
        (11, 8): "Diwali / Naraka Chaturdasi",
        (11, 9): "Govardhan Puja",
        (11, 11): "Bhai Duj",
        (11, 15): "Chhat Puja",
        (11, 24): "Guru Nanak Jayanti / Guru Tegh Bahadur's Martyrdom Day",
        (12, 5): "Hanukkah Begins",
        (12, 12): "Hanukkah Ends",
        (12, 22): "December Solstice",
        (12, 23): "Hazarat Ali's Birthday",
        (12, 24): "Christmas Eve",
        (12, 25): "Christmas",
        (12, 31): "New Year's Eve",
    }
    festival_name = festival_days.get((today.month, today.day))
    if not festival_name:
        return None
    return {
        "title": "Festival Greetings",
        "body": "Wishing you and your family happiness and good health. Thank you for your service.",
        "meta": festival_name,
        "scope": "festival",
        "celebration": True,
        "animation": "festival",
    }


def hk_mobile_perfect_attendance_week_card(user, today):
    # Show at the end of a Mon-Sat work week after attendance was submitted daily.
    if today.weekday() != 5:
        return None
    week_start = today - datetime.timedelta(days=today.weekday())
    week_days = [week_start + datetime.timedelta(days=i) for i in range(6)]
    submitted_days = set(
        HKAttendanceRecord.objects.filter(
            marked_by=user,
            is_submitted=True,
            date__in=week_days,
        ).values_list("date", flat=True)
    )
    if len(submitted_days) < len(week_days):
        return None
    return {
        "title": "Great Consistency",
        "body": "Your attendance updates were regular this week. Thank you.",
        "meta": "Weekly",
        "scope": "weekly-attendance",
        "celebration": True,
        "animation": "weekly",
    }


def hk_mobile_admin_extra_completed_card(records):
    completed = next(
        (
            record for record in records
            if record.status == "done"
            and (
                "admin assigned" in ((record.schedule.task_description or "").lower())
                or getattr(getattr(record, "assigned_by", None), "role", "") in HOUSEKEEPING_MANAGER_ROLES
            )
        ),
        None,
    )
    if not completed:
        return None
    return {
        "title": "Extra Work Completed",
        "body": "Thank you for completing the additional work assigned today.",
        "meta": "Extra work",
        "scope": "admin-task-done",
        "celebration": True,
        "animation": "complete",
        "once_key": f"hkGreetingSeen:admin-task:{completed.id}:done",
    }


def hk_mobile_admin_greeting_card(today, total_tasks, done_tasks, attendance_summary, monthly_best_worker, area_name, user):
    admin_name = "Pragnesh Parekh Sir"
    area_label = area_name or "your area"
    first_submitted = attendance_summary.get("first_submitted", 0)
    second_submitted = attendance_summary.get("second_submitted", 0)
    worker_count = attendance_summary.get("worker_count", 0)
    hour = timezone.localtime(timezone.now()).hour
    pending_tasks = max(total_tasks - done_tasks, 0)

    festival_card = hk_mobile_festival_card(today)
    if festival_card:
        return festival_card

    if total_tasks and done_tasks >= total_tasks:
        if hour < 13:
            return {
                "title": "Great Pace Today",
                "body": "All tasks completed early. Thank you for staying ahead.",
                "meta": "Fast finish",
                "scope": "work",
                "celebration": True,
                "animation": "complete",
                "credits": "Thanks for using this app. Rahul Patel, Shaurya Bisht, and Sarthak Pardeshi appreciate your updates.",
            }
        return {
            "title": "Excellent Work Today",
            "body": f"Message from {admin_name}: Thank you for completing all assigned tasks.",
            "meta": "Admin thanks",
            "scope": "work",
            "celebration": True,
            "animation": "complete",
            "credits": "Thanks for using this app. Rahul Patel, Shaurya Bisht, and Sarthak Pardeshi appreciate your updates.",
        }

    if pending_tasks >= 3 and hour >= 16:
        return {
            "title": "Gentle Reminder",
            "body": "Please review pending tasks before closing the shift.",
            "meta": "Pending",
            "scope": "reminder",
        }

    fixed_day_title = {
        (1, 26): "Republic Day Greetings",
        (5, 1): "Labour Day Appreciation",
        (8, 15): "Independence Day Greetings",
        (10, 2): "Gandhi Jayanti Message",
    }.get((today.month, today.day))
    if fixed_day_title:
        return {
            "title": "Special Day Greetings",
            "body": f"Message from {admin_name}: Wishing you and your family a happy and healthy day. Thank you for your service.",
            "meta": "Admin greeting",
            "scope": "start",
            "celebration": True,
            "animation": "festival",
        }

    if today.weekday() == 6:
        return {
            "title": "Sunday Duty Appreciation",
            "body": f"Message from {admin_name}: Thank you for handling special weekly cleaning work today.",
            "meta": "Sunday duty",
            "scope": "start",
        }

    weekly_card = hk_mobile_perfect_attendance_week_card(user, today)
    if weekly_card:
        return weekly_card

    if today.weekday() == 5:
        return {
            "title": "Weekly Appreciation",
            "body": f"{admin_name} thanks the team for this week's work.",
            "meta": "Weekly",
            "scope": "weekly",
            "celebration": True,
            "animation": "weekly",
        }

    if worker_count and second_submitted >= worker_count:
        return {
            "title": "Attendance Received",
            "body": f"Message from {admin_name}: Your punctuality today is appreciated.",
            "meta": "Attendance",
            "scope": "work",
            "credits": "Rahul Patel, Shaurya Bisht, and Sarthak Pardeshi thank you for using this app.",
        }

    if worker_count and first_submitted >= worker_count:
        return {
            "title": "First Half Done",
            "body": f"Message from {admin_name}: Thank you. Please continue the same quality in second half.",
            "meta": "Attendance",
            "scope": "work",
            "credits": "Rahul Patel, Shaurya Bisht, and Sarthak Pardeshi thank you for using this app.",
        }

    if monthly_best_worker and today.day in {1, 10, 20}:
        return {
            "title": "Monthly Appreciation",
            "body": f"Message from {admin_name}: {monthly_best_worker['name']} is appreciated for consistent attendance this month.",
            "meta": monthly_best_worker["month"],
            "scope": "start",
            "celebration": True,
            "animation": "month",
        }

    if today.day == calendar.monthrange(today.year, today.month)[1]:
        return {
            "title": "Month End Appreciation",
            "body": "Thank you for completing this month's work. Your consistency helps campus operations run smoothly.",
            "meta": today.strftime("%B"),
            "scope": "month-end",
            "celebration": True,
            "animation": "month",
        }

    if today.day == 1:
        return {
            "title": "New Month Started",
            "body": "Let's begin the month with clean attendance and timely task updates.",
            "meta": today.strftime("%B"),
            "scope": "month-start",
            "celebration": True,
            "animation": "month",
        }

    if done_tasks > 0 and today.month in {6, 7, 8, 9} and hour >= 13:
        return {
            "title": "Rainy Day Effort",
            "body": "Thank you for your field work during difficult weather.",
            "meta": "Rainy day",
            "scope": "work",
            "celebration": True,
            "animation": "rainy",
            "credits": "Rahul Patel, Shaurya Bisht, and Sarthak Pardeshi thank you for using this app.",
        }

    if done_tasks > 0:
        return {
            "title": "Thanks For Using The App",
            "body": "Your completed task update is recorded. Thank you for using Campus Sanchalika for daily work.",
            "meta": "App thanks",
            "scope": "work",
            "credits": "Rahul Patel, Shaurya Bisht, and Sarthak Pardeshi thank you for using this app.",
        }

    if hour < 12:
        return {
            "title": "Good Morning",
            "body": f"Message from {admin_name}: Thank you for starting the day on time. Wishing good health to you and your family.",
            "meta": "Admin note",
            "scope": "start",
        }
    elif hour < 17:
        if done_tasks > 0:
            return {
                "title": "Team Work",
                "body": f"Message from {admin_name}: Today's team effort in {area_label} is appreciated.",
                "meta": "Admin note",
                "scope": "work",
                "credits": "Rahul Patel, Shaurya Bisht, and Sarthak Pardeshi thank you for using this app.",
            }
        return {
            "title": "Good Afternoon",
            "body": f"Message from {admin_name}: Wishing good health to you and your family. Please keep today's updates clear for {area_label}.",
            "meta": "Admin note",
            "scope": "start",
        }
    else:
        if done_tasks > 0:
            return {
                "title": "Area Looks Good",
                "body": f"Message from {admin_name}: Thank you for keeping {area_label} clean today.",
                "meta": "Admin note",
                "scope": "work",
                "credits": "Rahul Patel, Shaurya Bisht, and Sarthak Pardeshi thank you for using this app.",
            }
        return {
            "title": "Good Evening",
            "body": f"Message from {admin_name}: Wishing good health to you and your family. Please close the day with proper updates.",
            "meta": "Admin note",
            "scope": "start",
        }


def hk_mobile_stock_greeting_card(user, visible_areas):
    area_ids = [area.id for area in visible_areas if area]
    approved_req = (
        HKStockRequest.objects
        .filter(requested_by=user, status__in=["issued", "approved"])
        .filter(dm.Q(area_id__in=area_ids) | dm.Q(area__isnull=True))
        .order_by(
            dm.Case(
                dm.When(status="issued", then=0),
                default=1,
                output_field=dm.IntegerField(),
            ),
            "-created_at",
            "-id",
        )
        .first()
    )
    if not approved_req:
        return None

    qty = approved_req.quantity or 1
    unit = f" {approved_req.unit}" if approved_req.unit else ""
    if approved_req.status == "issued":
        return {
            "title": "Inventory Issued",
            "body": f"{approved_req.item_name} ({qty}{unit}) has been issued/collected. Thank you for using the stock request system.",
            "meta": "Stock issued",
            "scope": "stock",
            "celebration": True,
            "animation": "issued",
            "once_key": f"hkGreetingSeen:{user.username}:stock:{approved_req.id}:issued",
        }

    approved_date = timezone.localtime(approved_req.created_at).date() if approved_req.created_at else None
    if approved_date and approved_date < timezone.localdate():
        title = "Inventory Ready"
        body = "Your requested item is approved. Please collect it from inventory."
        meta = "Collection"
    else:
        title = "Items Approved"
        body = f"{approved_req.item_name} ({qty}{unit}) is approved. Please collect it from inventory."
        meta = "Stock approved"

    return {
        "title": title,
        "body": body,
        "meta": meta,
        "scope": "stock",
        "once_key": f"hkGreetingSeen:{user.username}:stock:{approved_req.id}:approved",
    }


def hk_mobile_admin_task_greeting_card(records):
    admin_record = next(
        (
            record for record in records
            if record.status != "done"
            and (
                "admin assigned" in ((record.schedule.task_description or "").lower())
                or getattr(getattr(record, "assigned_by", None), "role", "") in HOUSEKEEPING_MANAGER_ROLES
            )
        ),
        None,
    )
    if not admin_record:
        return None

    return {
        "title": "Extra Work Assigned",
        "body": f"Admin has assigned today's extra work: {admin_record.schedule.task_name}. Please review and complete it.",
        "meta": "Admin task",
        "scope": "admin-task",
        "once_key": f"hkGreetingSeen:admin-task:{admin_record.id}",
    }


def worker_options_for_selection_request(req_obj, current_area):
    """
    Build eligible worker options for a pending worker-selection request.
    This powers the mobile staff selection UI.
    """
    options_qs = HKWorker.objects.filter(is_active=True).select_related("area").order_by("name")

    if req_obj.source_area_id:
        options_qs = options_qs.filter(area_id=req_obj.source_area_id)
    elif current_area and req_obj.target_area_id == current_area.id:
        # Add-to-area request: pick from outside the current area.
        options_qs = options_qs.exclude(area_id=current_area.id)
    elif current_area and req_obj.source_area_id == current_area.id:
        # Move-out request from current area.
        options_qs = options_qs.filter(area_id=current_area.id)

    options = list(options_qs)
    if req_obj.section_filter in {"hostels", "academic", "others"}:
        options = [w for w in options if area_bucket(w.area) == req_obj.section_filter]
    return options


def get_active_alerts(user, user_areas):
    now = timezone.now()
    return HKAlert.objects.filter(is_active=True).filter(
        dm.Q(expires_at__isnull=True) | dm.Q(expires_at__gt=now)
    ).filter(
        dm.Q(target_areas__isnull=True) | dm.Q(target_areas__in=user_areas)
    ).prefetch_related("target_areas").distinct()


def hk_login(request):
    if request.user.is_authenticated and request.user.role in HOUSEKEEPING_STAFF_ROLES:
        if request.user.role == "admin":
            return redirect("/admin-portal/")
        return redirect("/housekeeping/dashboard/")

    # validate next URL before use
    next_url = "/housekeeping/dashboard/"
    raw_next = request.GET.get("next", "").strip()
    if raw_next and url_has_allowed_host_and_scheme(
        url=raw_next,
        allowed_hosts={request.get_host()},
        require_https=request.is_secure(),
    ):
        next_url = raw_next

    error = ""
    if request.method == "POST":
        raw_post_next = request.POST.get("next", "").strip()
        if raw_post_next and url_has_allowed_host_and_scheme(
            url=raw_post_next,
            allowed_hosts={request.get_host()},
            require_https=request.is_secure(),
        ):
            next_url = raw_post_next

        user = authenticate(
            request,
            username=normalize_username_value(request.POST.get("username", "")),
            password=request.POST.get("password", ""),
        )
        if user and user.is_active and user.role in HOUSEKEEPING_STAFF_ROLES:
            auth_login(request, user)
            if user.role == "admin":
                return redirect("/admin-portal/")
            return redirect(next_url)
        error = "You do not have housekeeping access." if (user and user.is_active) else "Invalid username or password."
    return render(request, "housekeeping/mobile/login.html", {"error": error, "next": next_url})


@hk_required
def hk_dashboard(request):
    user = request.user
    today = timezone.localdate()
    user_areas = get_user_areas(user)
    visible_areas = visible_user_areas(user, user_areas)
    sel_area = selected_area(request, visible_areas)

    area_name = sel_area.name if sel_area else ""
    is_old_guest_house = area_name == "Old Guest House"
    is_jrha = _is_jrha_area(sel_area)
    is_jrha_night_caretaker = _is_jrha_night_caretaker(user)
    today_records = get_today_records(sel_area, today, user=user) if sel_area else []
    previous_day_records = get_guest_house_previous_day_records(sel_area, today) if area_name == "Guest House New" else []
    records = sorted([*today_records, *previous_day_records], key=task_completion_sort_key)
    is_simple_hostel = bool(
        sel_area
        and (
            (sel_area.area_type == "hostel" and area_name != "Hostels Reliever")
            or _is_jrha_area(sel_area)
        )
    )

    grouped = {}
    for rec in records:
        tag = dashboard_group_tag(rec, sel_area)
        grouped.setdefault(tag, []).append(rec)
    # Keep worker-group keys stable so mobile tabs render consistently.
    grouped.setdefault("floor", [])
    grouped.setdefault("room", [])
    grouped.setdefault("washroom", [])
    grouped.setdefault("t1", [])
    grouped.setdefault("t2", [])
    grouped.setdefault("t3", [])
    grouped.setdefault("t4", [])
    grouped.setdefault("t5", [])
    grouped.setdefault("all", [])
    grouped.setdefault("previous_day", [])
    for recs in grouped.values():
        recs.sort(key=task_completion_sort_key)

    if grouped["all"] and not is_jrha and not is_simple_hostel:
        grouped["floor"].extend(grouped["all"])
        grouped["floor"].sort(key=task_completion_sort_key)
        grouped["all"] = []

    is_common_area = area_name == "Hostel Common Area"
    is_research_park = area_name == "Research Park"
    extra_worker_name_mode = user.username == "pradip.chauhan"
    is_central_arcade = area_name == "Central Arcade"
    is_sports_complex = area_name == "Sports Complex"
    is_guest_house_new = area_name == "Guest House New"
    is_director_bungalow = area_name == "Director Bungalow"
    is_roads_outdoor = area_name == "Roads & Outdoor"
    is_swm = area_name == "Solid Waste Management"
    is_academic = bool(sel_area and sel_area.area_type == "academic")
    section_labels = _dashboard_section_labels(sel_area)
    tab_label_floor = section_labels["tab_label_floor"]
    tab_label_room = section_labels["tab_label_room"]
    tab_label_washroom = section_labels["tab_label_washroom"]
    tab_label_special = section_labels["tab_label_special"]
    tab_label_extra = section_labels["tab_label_extra"]
    heading_floor = section_labels["heading_floor"]
    heading_room = section_labels["heading_room"]
    heading_washroom = section_labels["heading_washroom"]
    heading_special = section_labels["heading_special"]
    countable_records = progress_records(records)
    total = len(countable_records)
    done = sum(1 for rec in countable_records if rec.status == "done")
    pct = int((done / total) * 100) if total else 0

    today_dow = today.weekday()
    if is_jrha_night_caretaker and is_jrha:
        area_workers = []
    elif user.username in SHOW_ALL_AREAS_USERNAMES:
        seen_ids = set()
        area_workers = []
        for _area in visible_areas:
            for w in effective_workers_for_area(_area, today):
                if w.id not in seen_ids:
                    seen_ids.add(w.id)
                    area_workers.append(w)
        mark_busy_workers(area_workers, busy_worker_ids_for_tasks(sel_area, today))
    else:
        area_workers = effective_workers_for_area(sel_area, today)
        mark_busy_workers(area_workers, busy_worker_ids_for_tasks(sel_area, today))
    mark_unavailable_workers(area_workers, today, current_half())
    for record in records:
        record.can_multi_worker_assignment = can_multi_worker_task(user, record)
        record.area_workers_for_assignment = assignment_workers_for_record(area_workers, record)
        record.is_break_task = is_break_task_name(record.schedule.task_name)
        record.is_direct_staff_task = bool(
            record.schedule.worker_tag == "night_caretaker"
            and JRHA_NIGHT_TASK_MARKER in (record.schedule.task_description or "")
        )

    worker_ids_for_cards = [worker.id for worker in area_workers]
    attendance_summary = {
        "worker_count": len(worker_ids_for_cards),
        "first_present": 0,
        "first_submitted": 0,
        "second_present": 0,
        "second_submitted": 0,
        "active_half": current_half(),
    }
    monthly_best_worker = None
    if worker_ids_for_cards:
        today_attendance = (
            HKAttendanceRecord.objects
            .filter(worker_id__in=worker_ids_for_cards, date=today, is_submitted=True)
            .values("half", "status")
            .annotate(total=dm.Count("id"))
        )
        for row in today_attendance:
            half = row["half"]
            total_count = row["total"]
            attendance_summary[f"{half}_submitted"] += total_count
            if row["status"] == "present":
                attendance_summary[f"{half}_present"] += total_count

        month_start = today.replace(day=1)
        best_row = (
            HKAttendanceRecord.objects
            .filter(
                worker_id__in=worker_ids_for_cards,
                date__gte=month_start,
                date__lte=today,
                is_submitted=True,
                status="present",
            )
            .values("worker_id", "worker__name")
            .annotate(present_halves=dm.Count("id"))
            .order_by("-present_halves", "worker__name")
            .first()
        )
        if best_row:
            monthly_best_worker = {
                "name": best_row["worker__name"],
                "present_halves": best_row["present_halves"],
                "month": today.strftime("%B"),
            }

    special_card = hk_mobile_special_card(today, total, done)
    admin_greeting_card = hk_mobile_admin_greeting_card(
        today,
        total,
        done,
        attendance_summary,
        monthly_best_worker,
        area_name,
        user,
    )
    stock_greeting_card = hk_mobile_stock_greeting_card(user, visible_areas)
    admin_task_greeting_card = hk_mobile_admin_task_greeting_card(records)
    extra_completed_card = hk_mobile_admin_extra_completed_card(records)
    toast_card = (
        stock_greeting_card
        or extra_completed_card
        or admin_task_greeting_card
        or admin_greeting_card
        or special_card
    )

    extra_works = (
        HKExtraWork.objects
        .filter(area=sel_area, date=today)
        .prefetch_related("assigned_workers")
        .order_by("-logged_at")
        if sel_area else []
    )

    extra_error = ""
    extra_err_code = (request.GET.get("extra_err") or "").strip().lower()
    if extra_err_code:
        err_map = {
            "task_name_required": "Please enter the extra work name.",
            "worker_required": "Please assign at least one worker for extra work.",
            "invalid_worker": "Please select only valid workers for this area.",
            "worker_busy": "One or more selected workers are already assigned to an unfinished task.",
            "worker_absent": "One or more selected workers are absent or on leave for this session.",
            "worker_name_required": "Please enter the worker name.",
            "no_area": "Please select a valid area.",
        }
        extra_error = err_map.get(extra_err_code, "Unable to log extra work.")

    worker_selection_cards = []
    if user.role in ["supervisor", "caretaker"]:
        user_area_list = list(user_areas)
        user_area_ids = {a.id for a in user_area_list}
        if user_area_ids:
            area_by_id = {a.id: a for a in user_area_list}
            worker_selection_requests = list(
                HKWorkerSelectionRequest.objects.annotate(
                    worker_count=dm.Count("workers", distinct=True),
                ).filter(
                    status="pending",
                    worker_count=0,
                ).select_related(
                    "source_area", "target_area", "requested_by",
                ).order_by("-created_at")[:40]
            )

            for req in worker_selection_requests:
                candidate_areas = []
                if req.target_area_id and req.target_area_id in user_area_ids:
                    candidate_areas.append(area_by_id[req.target_area_id])
                if req.source_area_id and req.source_area_id in user_area_ids:
                    candidate_areas.append(area_by_id[req.source_area_id])

                req_group = (req.target_group or "all").strip().lower()
                if req_group == "all":
                    candidate_areas.extend(user_area_list)
                elif req_group in {"hostels", "academic", "others"}:
                    candidate_areas.extend([a for a in user_area_list if area_bucket(a) == req_group])

                # Deduplicate by area id
                dedup = {}
                for a in candidate_areas:
                    dedup[a.id] = a
                candidate_areas = list(dedup.values())
                if not candidate_areas:
                    continue

                staff_area = None
                if sel_area and any(a.id == sel_area.id for a in candidate_areas):
                    staff_area = sel_area
                else:
                    staff_area = candidate_areas[0]

                options = worker_options_for_selection_request(req, staff_area)
                mark_unavailable_workers(options, today, current_half())
                worker_selection_cards.append({
                    "request": req,
                    "selected_workers": [],
                    "options": options,
                    "staff_area": staff_area,
                })

    ws_ok = request.GET.get("ws_ok") == "1"
    ws_error = ""
    ws_err_code = (request.GET.get("ws_err") or "").strip().lower()
    if ws_err_code:
        err_map = {
            "no_area": "Please select a valid area.",
            "bad_type": "Invalid worker request type.",
            "no_workers": "Please select at least one worker.",
            "invalid_destination": "Please select a valid destination area for remove request.",
            "same_destination": "Destination area must be different.",
            "admin_only": "Only admin can create worker selection requests.",
            "invalid_request": "Worker selection request is invalid for this area.",
            "request_locked": "Workers already submitted for this request.",
            "worker_absent": "One or more selected workers are absent or on leave for this session.",
        }
        ws_error = err_map.get(ws_err_code, "Unable to submit worker request.")

    ic_success = ""
    ic_error = ""
    ic_ok_code = (request.GET.get("ic_ok") or "").strip().lower()
    ic_err_code = (request.GET.get("ic_err") or "").strip().lower()
    if ic_ok_code:
        ok_map = {
            "sent": "Incharge request submitted successfully.",
            "accepted": "Incharge acceptance submitted. Awaiting Admin approval.",
            "declined": "You declined the incharge request.",
        }
        ic_success = ok_map.get(ic_ok_code, "")
    if ic_err_code:
        err_map = {
            "invalid_leave": "Leave request is invalid.",
            "leave_locked": "Leave request is locked.",
            "no_incharge": "Please select temporary incharge.",
            "invalid_incharge": "Selected incharge is invalid.",
            "invalid_assignment": "Assignment not found.",
            "assignment_locked": "Assignment is already processed.",
            "invalid_decision": "Invalid decision action.",
        }
        ic_error = err_map.get(ic_err_code, "Unable to process incharge action.")

    ws_decision_notice = None
    if user.role in ["supervisor", "caretaker"]:
        # Show a recent admin decision once (ephemeral UX, no repeated banner
        # on every auto-refresh/reload).
        since = timezone.now() - datetime.timedelta(minutes=30)
        seen_ids = request.session.get("hk_ws_seen_decision_ids", [])
        if not isinstance(seen_ids, list):
            seen_ids = []
        seen_ids = [int(x) for x in seen_ids if str(x).isdigit()]

        staff_decisions = (
            HKWorkerSelectionRequest.objects.filter(
                status__in=["approved", "rejected"],
                decided_at__gte=since,
                note__icontains=user.username,
            )
            .exclude(id__in=seen_ids)
            .select_related("target_area", "approved_by")
            .order_by("-decided_at")
        )
        ws_decision_notice = staff_decisions.first()
        if ws_decision_notice:
            seen_ids.append(ws_decision_notice.id)
            # Keep session payload small.
            request.session["hk_ws_seen_decision_ids"] = seen_ids[-100:]

    # Temporary Incharge workflow banners/cards
    incharge_notice = None
    unread_notice = (
        HKInchargeNotification.objects.filter(user=user, is_seen=False)
        .select_related("assignment", "assignment__area")
        .order_by("-created_at")
        .first()
    )
    if unread_notice:
        incharge_notice = unread_notice
        unread_notice.is_seen = True
        unread_notice.save(update_fields=["is_seen"])

    incoming_incharge_requests = list(
        HKInchargeAssignment.objects.filter(
            assigned_staff=user,
            status="pending_acceptance",
            leave_date__gte=today,
        )
        .select_related("area", "leave_staff")
        .order_by("leave_date", "-created_at")[:10]
    )
    incoming_waiting_admin = list(
        HKInchargeAssignment.objects.filter(
            assigned_staff=user,
            status="pending_admin_approval",
            leave_date__gte=today,
        )
        .select_related("area", "leave_staff")
        .order_by("leave_date", "-created_at")[:10]
    )

    incharge_today_assignments = list(
        HKInchargeAssignment.objects.filter(
            assigned_staff=user,
            status="approved",
            leave_date=today,
        )
        .select_related("area", "leave_staff")
        .order_by("-created_at")
    )
    for item in incharge_today_assignments:
        if not item.arrival_notified:
            _create_incharge_notice(
                user,
                item,
                (
                    "Incharge mode active today for all assigned areas."
                    if item.cover_all_areas
                    else f"Incharge mode active today for {item.area.name}."
                ),
                level="success",
            )
            item.arrival_notified = True
            item.save(update_fields=["arrival_notified", "updated_at"])

    my_open_leave_reqs = list(
        HKLeaveRequest.objects.filter(
            staff=user,
            leave_date__gte=today,
            status__in=["awaiting_incharge", "reassign_required"],
        )
        .select_related("area")
        .order_by("leave_date", "-created_at")[:10]
    )
    leave_reselection_cards = []
    for lr in my_open_leave_reqs:
        candidates = _staff_candidates_for_leave_request(lr, exclude_user_id=user.id)
        latest_assignment = getattr(lr, "incharge_assignment", None)
        leave_reselection_cards.append({
            "leave_request": lr,
            "candidates": candidates,
            "latest_assignment": latest_assignment,
        })

    return render(request, "housekeeping/mobile/dashboard.html", {
        "today": today,
        "today_dow": today_dow,
        "user_areas": visible_areas,
        "selected_area": sel_area,
        "records": records,
        "grouped": grouped,
        "tag_labels": WORKER_TAG_LABELS,
        "total_tasks": total,
        "done_tasks": done,
        "percent_done": pct,
        "alerts": get_active_alerts(user, user_areas),
        "area_workers": area_workers,
        "attendance_summary": attendance_summary,
        "monthly_best_worker": monthly_best_worker,
        "special_card": special_card,
        "admin_greeting_card": admin_greeting_card,
        "toast_card": toast_card,
        "extra_works": extra_works,
        "extra_error": extra_error,
        "tab_label_floor": tab_label_floor,
        "tab_label_room": tab_label_room,
        "tab_label_washroom": tab_label_washroom,
        "tab_label_special": tab_label_special,
        "tab_label_extra": tab_label_extra,
        "heading_floor": heading_floor,
        "heading_room": heading_room,
        "heading_washroom": heading_washroom,
        "heading_special": heading_special,
        "is_swm": is_swm,
        "is_research_park": is_research_park,
        "extra_worker_name_mode": extra_worker_name_mode,
        "is_jrha": is_jrha,
        "is_jrha_night_caretaker": is_jrha_night_caretaker,
        "is_simple_hostel": is_simple_hostel,
        "is_guest_house_new": is_guest_house_new,
        "has_special_tasks": bool(grouped["all"]),
        "can_assign_tasks": user.role in HOUSEKEEPING_STAFF_ROLES,
        "worker_selection_cards": worker_selection_cards,
        "show_ws_overlay": bool(worker_selection_cards) and user.role in ["supervisor", "caretaker"],
        "ws_ok": ws_ok,
        "ws_error": ws_error,
        "ws_decision_notice": ws_decision_notice,
        "ic_success": ic_success,
        "ic_error": ic_error,
        "incoming_incharge_requests": incoming_incharge_requests,
        "incoming_waiting_admin": incoming_waiting_admin,
        "incharge_today_assignments": incharge_today_assignments,
        "leave_reselection_cards": leave_reselection_cards,
        "incharge_notice": incharge_notice,
    })


@hk_required
@require_POST
def hk_worker_selection_request(request):
    """
    Deprecated mobile-create endpoint.
    Worker selection request creation is now admin-only (admin dashboard).
    """
    user_areas = get_user_areas(request.user)
    area = selected_area(request, visible_user_areas(request.user, user_areas))
    if not area:
        return redirect("/housekeeping/dashboard/?ws_err=no_area")
    return redirect(f"/housekeeping/dashboard/?area={area.id}&ws_err=admin_only")


@hk_required
@require_POST
def hk_worker_selection_submit(request):
    """
    Area staff flow:
    - admin creates request in admin dashboard
    - caretaker/supervisor selects workers on mobile and submits
    - admin approves/rejects from admin dashboard
    """
    user = request.user
    user_areas = get_user_areas(user)
    area = selected_area(request, visible_user_areas(user, user_areas))
    if not area:
        return redirect("/housekeeping/dashboard/?ws_err=no_area")

    req_id = request.POST.get("request_id")
    req_obj = (
        HKWorkerSelectionRequest.objects
        .filter(pk=req_id, status="pending")
        .select_related("source_area", "target_area", "requested_by")
        .prefetch_related("workers")
        .first()
    )
    if not req_obj:
        return redirect(f"/housekeeping/dashboard/?area={area.id}&ws_err=invalid_request")

    req_group = (req_obj.target_group or "all").strip().lower()
    group_allowed = req_group == "all" or req_group == area_bucket(area)
    area_allowed = req_obj.target_area_id == area.id or req_obj.source_area_id == area.id or group_allowed
    if not area_allowed:
        return redirect(f"/housekeeping/dashboard/?area={area.id}&ws_err=invalid_request")

    # Once workers are submitted, lock re-submit to prevent accidental overwrite.
    if req_obj.workers.exists():
        return redirect(f"/housekeeping/dashboard/?area={area.id}&ws_err=request_locked")

    # If admin created group-level request without explicit target area,
    # lock destination to submitting staff area.
    if not req_obj.target_area_id:
        req_obj.target_area = area
        req_obj.save(update_fields=["target_area"])

    selected_ids = {int(wid) for wid in request.POST.getlist("worker_ids") if str(wid).isdigit()}
    if not selected_ids:
        return redirect(f"/housekeeping/dashboard/?area={area.id}&ws_err=no_workers")

    eligible_workers = worker_options_for_selection_request(req_obj, area)
    eligible_ids = {w.id for w in eligible_workers}
    final_ids = sorted(selected_ids & eligible_ids)
    if not final_ids:
        return redirect(f"/housekeeping/dashboard/?area={area.id}&ws_err=no_workers")
    if unavailable_selection_ids(final_ids, timezone.localdate(), current_half()):
        return redirect(f"/housekeeping/dashboard/?area={area.id}&ws_err=worker_absent")

    req_obj.workers.set(final_ids)

    staff_note = (request.POST.get("note") or "").strip()
    staff_name = user.get_full_name() or user.username
    staff_line = f"[Staff Selection by {staff_name} ({user.username})]"
    if staff_note:
        staff_line = f"{staff_line} {staff_note}"
    base_note = (req_obj.note or "").strip()
    req_obj.note = f"{base_note}\n{staff_line}".strip() if base_note else staff_line
    req_obj.save(update_fields=["note"])

    return redirect(f"/housekeeping/dashboard/?area={area.id}&ws_ok=1")


@hk_required
@require_POST
def hk_incharge_assign(request):
    user = request.user
    user_areas = get_user_areas(user)
    area = selected_area(request, visible_user_areas(user, user_areas))

    leave_request_id = request.POST.get("leave_request_id")
    assigned_staff_id = request.POST.get("assigned_staff_id")
    note = (request.POST.get("note") or "").strip()
    leave_req = (
        HKLeaveRequest.objects.select_related("area", "staff")
        .filter(pk=leave_request_id, staff=user)
        .first()
    )
    if not leave_req:
        area_q = f"&area={area.id}" if area else ""
        return redirect(f"/housekeeping/dashboard/?ic_err=invalid_leave{area_q}")

    if leave_req.status not in {"awaiting_incharge", "reassign_required", "pending_acceptance"}:
        area_q = f"&area={area.id}" if area else ""
        return redirect(f"/housekeeping/dashboard/?ic_err=leave_locked{area_q}")

    candidate_ids = {row["user"].id for row in _staff_candidates_for_leave_request(leave_req, exclude_user_id=user.id)}
    if not assigned_staff_id or not str(assigned_staff_id).isdigit():
        area_q = f"&area={area.id}" if area else ""
        return redirect(f"/housekeeping/dashboard/?ic_err=no_incharge{area_q}")
    assigned_staff_id = int(assigned_staff_id)
    if assigned_staff_id not in candidate_ids:
        area_q = f"&area={area.id}" if area else ""
        return redirect(f"/housekeeping/dashboard/?ic_err=invalid_incharge{area_q}")

    assigned_staff = get_object_or_404(UserModel, pk=assigned_staff_id, is_active=True)
    _assign_incharge_for_leave(leave_req, assigned_staff, user, note=note)

    area_q = f"&area={area.id}" if area else ""
    return redirect(f"/housekeeping/dashboard/?ic_ok=sent{area_q}")


@hk_required
@require_POST
def hk_incharge_respond(request):
    user = request.user
    user_areas = get_user_areas(user)
    area = selected_area(request, visible_user_areas(user, user_areas))

    assignment_id = request.POST.get("assignment_id")
    decision = (request.POST.get("decision") or "").strip().lower()
    note = (request.POST.get("note") or "").strip()
    assignment = (
        HKInchargeAssignment.objects.select_related("leave_request", "area", "leave_staff", "assigned_staff")
        .filter(pk=assignment_id, assigned_staff=user)
        .first()
    )
    if not assignment:
        area_q = f"&area={area.id}" if area else ""
        return redirect(f"/housekeeping/dashboard/?ic_err=invalid_assignment{area_q}")
    if assignment.status != "pending_acceptance":
        area_q = f"&area={area.id}" if area else ""
        return redirect(f"/housekeeping/dashboard/?ic_err=assignment_locked{area_q}")

    now = timezone.now()
    if decision == "accept":
        assignment.status = "pending_admin_approval"
        assignment.staff_action_at = now
        assignment.staff_action_note = note
        assignment.save(update_fields=["status", "staff_action_at", "staff_action_note", "updated_at"])
        assignment.leave_request.status = "pending_admin_approval"
        assignment.leave_request.save(update_fields=["status", "updated_at"])
        _create_incharge_notice(
            assignment.leave_staff,
            assignment,
            f"{assignment.assigned_staff_name} accepted temporary incharge for {assignment.leave_date}. Awaiting Admin approval.",
            level="success",
        )
        admins = UserModel.objects.filter(
            is_active=True,
            role__in=list(HOUSEKEEPING_MANAGER_ROLES),
        )
        for admin_user in admins:
            _create_incharge_notice(
                admin_user,
                assignment,
                f"Incharge approval pending: {assignment.leave_staff_name} -> {assignment.assigned_staff_name} ({assignment.leave_date})",
                level="warning",
            )
        area_q = f"&area={area.id}" if area else ""
        return redirect(f"/housekeeping/dashboard/?ic_ok=accepted{area_q}")

    if decision == "decline":
        assignment.status = "declined"
        assignment.staff_action_at = now
        assignment.staff_action_note = note
        assignment.save(update_fields=["status", "staff_action_at", "staff_action_note", "updated_at"])
        assignment.leave_request.status = "reassign_required"
        assignment.leave_request.save(update_fields=["status", "updated_at"])
        _create_incharge_notice(
            assignment.leave_staff,
            assignment,
            f"{assignment.assigned_staff_name} declined incharge for {assignment.leave_date}. Please select another incharge.",
            level="error",
        )
        area_q = f"&area={area.id}" if area else ""
        return redirect(f"/housekeeping/dashboard/?ic_ok=declined{area_q}")

    area_q = f"&area={area.id}" if area else ""
    return redirect(f"/housekeeping/dashboard/?ic_err=invalid_decision{area_q}")


@hk_required
@transaction.atomic
def hk_mark_task(request, record_id):
    if request.method != "POST":
        return HttpResponseForbidden()
    record = get_object_or_404(HKDailyRecord.objects.select_for_update(), pk=record_id)
    user = request.user
    if record.area not in get_user_areas(user):
        return HttpResponseForbidden("Not your area.")

    task_error = ""
    action = request.POST.get("action")
    now = timezone.now()
    today = timezone.localdate()
    record_date = record.date
    is_break_task = is_break_task_name(record.schedule.task_name)
    is_direct_staff_task = bool(
        record.schedule.worker_tag == "night_caretaker"
        and JRHA_NIGHT_TASK_MARKER in (record.schedule.task_description or "")
    )
    can_mark_break = user.role == "supervisor"
    is_multi_worker_task = can_multi_worker_task(user, record)

    def has_worker_assignment():
        if is_direct_staff_task:
            return True
        if record.assigned_worker_id:
            return True
        if is_multi_worker_task:
            return record.worker_assignments.exists()
        return False

    if action == "assign":
        if is_break_task:
            task_error = "Break tasks do not need worker assignment."
        elif is_multi_worker_task:
            # Multi-worker tasks lock once a team is assigned.
            if record.assigned_worker_id or record.worker_assignments.exists():
                task_error = "Team already assigned for this task."
            else:
                worker_ids = list(dict.fromkeys(w for w in request.POST.getlist("worker_ids") if w))
                if not worker_ids:
                    single_worker_id = request.POST.get("worker_id")
                    if single_worker_id:
                        worker_ids = [single_worker_id]
                allowed_worker_ids = display_worker_ids_for_area(record.area, record.date)
                busy_ids = busy_worker_ids_for_tasks(record.area, record.date, exclude_record_id=record.id)
                selected_worker_ids = {int(wid) for wid in worker_ids if str(wid).isdigit()}
                unavailable_ids = unavailable_selection_ids(
                    selected_worker_ids,
                    record.date,
                    attendance_half_for_record(record),
                )
                selected_busy_ids = selected_worker_ids & busy_ids

                if len(selected_worker_ids) != len(worker_ids):
                    task_error = "Please select only valid workers for this area."
                elif selected_busy_ids:
                    task_error = (
                        "This worker is already assigned to an unfinished task."
                        if len(selected_worker_ids) == 1
                        else "One or more selected workers are already assigned to an unfinished task."
                    )
                elif unavailable_ids:
                    task_error = (
                        "This worker is absent or on leave for this task session."
                        if len(selected_worker_ids) == 1
                        else "One or more selected workers are absent or on leave for this task session."
                    )
                elif not selected_worker_ids.issubset(allowed_worker_ids):
                    task_error = "Please select only valid workers for this area."
                else:
                    workers = list(
                        HKWorker.objects.filter(
                            pk__in=selected_worker_ids,
                            is_active=True,
                        ).order_by("name")
                    )
                    if not workers:
                        task_error = "Please select at least one valid worker."
                    else:
                        HKTaskWorkerAssignment.objects.bulk_create(
                            [
                                HKTaskWorkerAssignment(
                                    daily_record=record,
                                    worker=w,
                                    assigned_by=user,
                                )
                                for w in workers
                            ]
                        )

                        # Keep legacy single-assignee field for backward-compatible reporting.
                        record.assigned_worker = workers[0]
                        record.assigned_by = user
                        record.assigned_at = now
                        record.save(update_fields=["assigned_worker", "assigned_by", "assigned_at"])
        elif record.assigned_worker_id:
            task_error = "Worker already assigned for this task."
        else:
            worker_id = request.POST.get("worker_id")
            worker = HKWorker.objects.filter(pk=worker_id, is_active=True).first()
            if worker and worker.id not in display_worker_ids_for_area(record.area, record.date):
                worker = None
            if worker and worker.id in busy_worker_ids_for_tasks(record.area, record.date, exclude_record_id=record.id):
                task_error = "This worker is already assigned to an unfinished task."
            elif worker and unavailable_selection_ids([worker.id], record.date, attendance_half_for_record(record)):
                task_error = "This worker is absent or on leave for this task session."
            elif worker:
                record.assigned_worker = worker
                record.assigned_by = user
                record.assigned_at = now
                record.save(update_fields=["assigned_worker", "assigned_by", "assigned_at"])
            else:
                task_error = "Please choose a valid worker for this area."

    elif action == "start":
        if is_break_task:
            task_error = "Break tasks can be marked done directly."
        elif not has_worker_assignment():
            task_error = "Assign worker first, then start work."
        else:
            record.status = "in_progress"
            if not record.started_at:
                record.started_at = now
            record.note = request.POST.get("note", "").strip()
            update_fields = ["status", "started_at", "note"]
            if "photo_before" in request.FILES:
                record.photo_before = request.FILES["photo_before"]
                update_fields.append("photo_before")
            record.save(update_fields=update_fields)
            if record.photo_before:
                log_image_event(
                    "housekeeping_start_saved",
                    request,
                    record_id=record.id,
                    field="photo_before",
                    debug=image_debug_payload(request, record.photo_before),
                )

    elif action == "undo":
        if record.status == "done":
            task_error = "Completed task is locked and cannot be reopened."
        else:
            record.status = "pending"
            record.started_at = None
            record.completed_by = None
            record.completed_at = None
            record.photo_before = None
            record.photo_after = None
            record.photo_after_thumbnail = None
            record.photo_after_captured_at = None
            record.photo_after_capture_method = ""
            record.photo_after_original_size = 0
            record.photo_after_saved_size = 0
            record.photo_after_thumb_size = 0
            record.photo_after_compression_ratio = 0
            record.photo_after_format = ""
            record.save(update_fields=[
                "status", "started_at", "completed_by", "completed_at", "photo_before", "photo_after",
                "photo_after_thumbnail",
                "photo_after_captured_at", "photo_after_capture_method",
                "photo_after_original_size", "photo_after_saved_size", "photo_after_thumb_size",
                "photo_after_compression_ratio", "photo_after_format",
            ])

    elif action == "done":
        if is_break_task and not can_mark_break:
            task_error = "Only supervisor can mark break done."
        elif record.status == "done":
            task_error = "Task already completed. Photo upload is locked."
        elif is_break_task:
            record.status = "done"
            record.completed_by = user
            record.completed_at = now
            record.note = request.POST.get("note", "").strip()
            record.save(update_fields=["status", "completed_by", "completed_at", "note"])
        elif not has_worker_assignment():
            task_error = "Assign worker first."
        else:
            record.status = "done"
            record.completed_by = user
            record.completed_at = now
            record.note = request.POST.get("note", "").strip()
            if "photo_before" in request.FILES:
                record.photo_before = request.FILES["photo_before"]
            if "photo_after" in request.FILES:
                uploaded_photo = request.FILES["photo_after"]
                original_size_hint = _safe_int(request.POST.get("originalSize"), default=0)
                fallback_saved_size = _safe_int(
                    request.POST.get("compressedSize"), default=getattr(uploaded_photo, "size", 0)
                )
                fallback_thumb_size = _safe_int(request.POST.get("thumbnailSize"), default=0)
                fallback_format = (request.POST.get("format") or "").strip().lower()
                if len(fallback_format) > 20:
                    fallback_format = fallback_format[:20]
                if fallback_format.startswith("image/"):
                    fallback_format = fallback_format.split("/", 1)[1]

                try:
                    processed = process_task_photo(
                        uploaded_photo,
                        task_id=record.id,
                        original_size_hint=original_size_hint,
                    )
                    record.photo_after = processed["main_file"]
                    record.photo_after_thumbnail = processed["thumb_file"]
                    record.photo_after_original_size = processed["original_size"]
                    record.photo_after_saved_size = processed["saved_size"]
                    record.photo_after_thumb_size = processed["thumb_size"]
                    record.photo_after_compression_ratio = processed["compression_ratio"]
                    record.photo_after_format = processed["format"]
                except Exception as ex:
                    logger.warning("Task photo processing failed for record %s: %s", record.id, ex)
                    uploaded_photo.seek(0)
                    record.photo_after = uploaded_photo
                    record.photo_after_thumbnail = request.FILES.get("photo_after_thumbnail")
                    original_size = original_size_hint or getattr(uploaded_photo, "size", 0) or fallback_saved_size
                    saved_size = getattr(uploaded_photo, "size", 0) or fallback_saved_size
                    record.photo_after_original_size = original_size
                    record.photo_after_saved_size = saved_size
                    record.photo_after_thumb_size = (
                        getattr(record.photo_after_thumbnail, "size", 0) or fallback_thumb_size
                    )
                    if original_size > 0 and saved_size > 0 and saved_size < original_size:
                        record.photo_after_compression_ratio = int(
                            round((1 - (saved_size / float(original_size))) * 100)
                        )
                    else:
                        record.photo_after_compression_ratio = 0
                    record.photo_after_format = fallback_format or (
                        (getattr(uploaded_photo, "content_type", "") or "image/jpeg").split("/")[-1]
                    )

                raw_captured_at = (request.POST.get("capturedAt") or "").strip()
                parsed_captured_at = parse_datetime(raw_captured_at) if raw_captured_at else None
                if parsed_captured_at and timezone.is_naive(parsed_captured_at):
                    parsed_captured_at = timezone.make_aware(
                        parsed_captured_at,
                        timezone.get_current_timezone(),
                    )
                if parsed_captured_at:
                    record.photo_after_captured_at = parsed_captured_at
                elif record_date and record_date != today:
                    # Late uploads should stay tied to the record's date.
                    record.photo_after_captured_at = timezone.make_aware(
                        datetime.datetime.combine(record_date, now.time()),
                        timezone.get_current_timezone(),
                    )
                else:
                    record.photo_after_captured_at = now

                capture_method = (request.POST.get("captureMethod") or "").strip().lower()
                if capture_method not in {"camera", "file_upload"}:
                    capture_method = "file_upload"
                record.photo_after_capture_method = capture_method
            lat = request.POST.get("latitude")
            lng = request.POST.get("longitude")
            if lat and lng:
                try:
                    record.latitude = float(lat)
                    record.longitude = float(lng)
                except (ValueError, TypeError):
                    pass
            record.save()
            if is_direct_staff_task and record_date:
                _mark_staff_present_from_task(user, record_date)
            log_image_event(
                "housekeeping_complete_saved",
                request,
                record_id=record.id,
                before=image_debug_payload(request, record.photo_before),
                after=image_debug_payload(request, record.photo_after),
                thumbnail=image_debug_payload(request, record.photo_after_thumbnail),
            )

    record = HKDailyRecord.objects.select_related(
        "schedule", "assigned_worker", "assigned_by", "area", "completed_by"
    ).prefetch_related("worker_assignments__worker").get(pk=record.pk)
    record.can_multi_worker_assignment = can_multi_worker_task(user, record)
    record.is_break_task = is_break_task_name(record.schedule.task_name)
    record.is_direct_staff_task = bool(
        record.schedule.worker_tag == "night_caretaker"
        and JRHA_NIGHT_TASK_MARKER in (record.schedule.task_description or "")
    )
    record.is_previous_day_task = (
        record.area.name == "Guest House New"
        and record.schedule.worker_tag == "previous_day"
        and record.date < timezone.localdate()
    )
    area_workers = effective_workers_for_area(record.area, record.date)
    mark_busy_workers(area_workers, busy_worker_ids_for_tasks(record.area, record.date, exclude_record_id=record.id))
    mark_unavailable_workers(area_workers, record.date, attendance_half_for_record(record))
    return render(request, "housekeeping/mobile/partials/task_card.html", {
        "record": record,
        "tag_labels": WORKER_TAG_LABELS,
        "area_workers": area_workers,
        "can_assign_tasks": user.role in HOUSEKEEPING_STAFF_ROLES,
        "task_error": task_error,
    })


@hk_required
def hk_log_extra_work(request):
    if request.method != "POST":
        return redirect("/housekeeping/dashboard/")
    user = request.user
    user_areas = get_user_areas(user)
    area_id = request.POST.get("area_id")
    area = user_areas.filter(pk=area_id).first() or user_areas.first()

    # reject blank task_name after stripping whitespace
    if not area:
        return redirect("/housekeeping/dashboard/?extra_err=no_area")

    task_name = request.POST.get("task_name", "").strip()
    if not task_name:
        param = f"?area={area.id}&extra_err=task_name_required"
        return redirect(f"/housekeeping/dashboard/{param}")

    is_research_park = area.area_type == "research_park"
    extra_worker_name_mode = user.username == "pradip.chauhan"
    selected_workers = []
    worker_name = request.POST.get("worker_name", "").strip()
    if extra_worker_name_mode and not is_research_park and not worker_name:
        return redirect(f"/housekeeping/dashboard/?area={area.id}&extra_err=worker_name_required")
    if not extra_worker_name_mode:
        worker_ids = list(dict.fromkeys(w for w in request.POST.getlist("worker_ids") if w))
        selected_worker_ids = {int(wid) for wid in worker_ids if str(wid).isdigit()}
        allowed_worker_ids = display_worker_ids_for_area(area, timezone.localdate())
        busy_ids = busy_worker_ids_for_tasks(area, timezone.localdate())

        if not worker_ids:
            return redirect(f"/housekeeping/dashboard/?area={area.id}&extra_err=worker_required")
        if len(selected_worker_ids) != len(worker_ids) or not selected_worker_ids.issubset(allowed_worker_ids):
            return redirect(f"/housekeeping/dashboard/?area={area.id}&extra_err=invalid_worker")
        if selected_worker_ids & busy_ids:
            return redirect(f"/housekeeping/dashboard/?area={area.id}&extra_err=worker_busy")
        if unavailable_selection_ids(selected_worker_ids, timezone.localdate(), current_half()):
            return redirect(f"/housekeeping/dashboard/?area={area.id}&extra_err=worker_absent")

        selected_workers = list(
            HKWorker.objects.filter(pk__in=selected_worker_ids, is_active=True).order_by("name")
        )
        if not selected_workers:
            return redirect(f"/housekeeping/dashboard/?area={area.id}&extra_err=worker_required")
        worker_name = ", ".join(worker.name for worker in selected_workers)

    extra = HKExtraWork(
        area=area,
        date=timezone.localdate(),
        task_name=task_name,
        description=request.POST.get("description", "").strip(),
        worker_name=worker_name,
        logged_by=user,
    )
    if "photo" in request.FILES:
        extra.photo = request.FILES["photo"]
    extra.save()
    if selected_workers:
        extra.assigned_workers.set(selected_workers)
    param = f"?area={area.id}" if area else ""
    return redirect(f"/housekeeping/dashboard/{param}")


@hk_required
def hk_schedule(request):
    user = request.user
    user_areas = get_user_areas(user)
    visible_areas = visible_user_areas(user, user_areas)
    sel_area = selected_area(request, visible_areas)
    area_name = sel_area.name if sel_area else ""
    is_common_area = area_name == "Hostel Common Area"
    is_research_park = area_name == "Research Park"
    is_central_arcade = area_name == "Central Arcade"
    is_sports_complex = area_name == "Sports Complex"
    is_guest_house_new = area_name == "Guest House New"
    is_director_bungalow = area_name == "Director Bungalow"
    is_roads_outdoor = area_name == "Roads & Outdoor"
    is_swm = area_name == "Solid Waste Management"
    is_academic = bool(sel_area and sel_area.area_type == "academic")
    is_jrha_night_caretaker = _is_jrha_night_caretaker(user)

    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    weekly = []
    if sel_area:
        for i, day in enumerate(days):
            if is_jrha_night_caretaker and _is_jrha_area(sel_area):
                tasks = _ensure_jrha_night_templates(sel_area)
            else:
                tasks = list(
                    _schedule_templates_for_day(sel_area, i).order_by("worker_tag", "order", "start_time")
                )
            task_count = sum(1 for task in tasks if not is_break_task_name(task.task_name))
            weekly.append({"day": day, "day_idx": i, "tasks": tasks, "task_count": task_count})

    return render(request, "housekeeping/mobile/schedule.html", {
        "user_areas": visible_areas,
        "selected_area": sel_area,
        "is_common_area": is_common_area,
        "is_research_park": is_research_park,
        "is_central_arcade": is_central_arcade,
        "is_sports_complex": is_sports_complex,
        "is_guest_house_new": is_guest_house_new,
        "is_director_bungalow": is_director_bungalow,
        "is_roads_outdoor": is_roads_outdoor,
        "is_swm": is_swm,
        "is_academic": is_academic,
        "is_jrha_night_caretaker": is_jrha_night_caretaker,
        "weekly": weekly,
        "today_dow": timezone.localdate().weekday(),
        "tag_labels": WORKER_TAG_LABELS,
    })


@hk_required
def hk_attendance(request):
    user = request.user
    user_areas = get_user_areas(user)
    visible_areas = visible_user_areas(user, user_areas)
    sel_area = selected_area(request, visible_areas)

    today = timezone.localdate()
    requested_date = parse_date(request.GET.get("date") or request.POST.get("date") or "")
    is_swm = bool(sel_area and sel_area.name == "Solid Waste Management")
    sunday_on_monday_usernames = {"maulik.patel", "ashok.rathod", "ganesh.jayesh"}
    previous_sunday = today - datetime.timedelta(days=1) if today.weekday() == 0 else None
    can_mark_previous_swm_sunday = bool(is_swm and previous_sunday)
    can_mark_previous_sunday_attendance = bool(
        previous_sunday and (is_swm or user.username in sunday_on_monday_usernames)
    )
    yesterday = today - datetime.timedelta(days=1)
    can_mark_previous_night_attendance = bool(
        user.username in NIGHT_ATTENDANCE_CATCHUP_USERNAMES and yesterday != previous_sunday
    )
    allowed_dates = {today}
    if can_mark_previous_sunday_attendance:
        allowed_dates.add(previous_sunday)
    if can_mark_previous_night_attendance:
        allowed_dates.add(yesterday)
    sel_date = requested_date if requested_date in allowed_dates else today

    workers = effective_workers_for_area(sel_area, sel_date)

    cur_half = current_half()
    is_today = sel_date == today
    # Ashok's next-day catch-up is for the night/second-half only; morning
    # attendance for a past date is never opened by this exception.
    is_night_catchup_date = can_mark_previous_night_attendance and sel_date == yesterday
    first_half_open = (
        False if is_night_catchup_date
        else attendance_half_is_open(sel_date, "first", user=user, area=sel_area, workers=workers)
    )
    second_half_open = attendance_half_is_open(sel_date, "second", user=user, area=sel_area, workers=workers)
    can_submit_selected_attendance = is_today or (
        can_mark_previous_sunday_attendance and sel_date == previous_sunday
    ) or is_night_catchup_date
    area_param = f"&area={sel_area.id}" if sel_area else ""

    if workers and (not is_today or cur_half == "second") and can_submit_selected_attendance:
        _auto_create_second_half_from_first(workers, sel_date, user)

    if request.method == "POST":
        action = request.POST.get("action")

        if action == "submit_half":
            half = request.POST.get("half", cur_half)
            if (
                half not in {"first", "second"}
                or (is_night_catchup_date and half == "first")
                or not attendance_half_is_open(sel_date, half, user=user, area=sel_area, workers=workers)
            ):
                return redirect(f"/housekeeping/attendance/?date={sel_date}{area_param}&att_err=half_closed")
            if half == "second":
                _auto_create_second_half_from_first(workers, sel_date, user)
            HKAttendanceRecord.objects.filter(
                worker__in=workers, date=sel_date, half=half, is_submitted=False
            ).update(is_submitted=True, submitted_at=timezone.now())
            staff_att, created = HKStaffAttendanceRecord.objects.get_or_create(
                staff=user,
                date=sel_date,
                defaults={"status": "present", "source": "auto_attendance"},
            )
            if not created and staff_att.source != "auto_leave" and staff_att.status != "present":
                staff_att.status = "present"
                staff_att.source = "auto_attendance"
                staff_att.save(update_fields=["status", "source"])
            return redirect(f"/housekeeping/attendance/?date={sel_date}{area_param}")

        elif action == "mark":
            half = request.POST.get("half", cur_half)
            if (
                half not in {"first", "second"}
                or (is_night_catchup_date and half == "first")
                or not attendance_half_is_open(sel_date, half, user=user, area=sel_area, workers=workers)
            ):
                if request.headers.get("HX-Request"):
                    return HttpResponseBadRequest("Attendance for this half is not open.")
                return redirect(f"/housekeeping/attendance/?date={sel_date}{area_param}&att_err=half_closed")
            worker_id = request.POST.get("worker_id")
            status = request.POST.get("status", "present")
            if status != "clear" and half == "second" and status not in {"absent", "leave"}:
                return HttpResponseBadRequest("Second half attendance is only for absent or leave exceptions.")
            worker = get_object_or_404(HKWorker, pk=worker_id)
            if worker.id not in {w.id for w in workers}:
                return HttpResponseBadRequest("Worker does not belong to the selected area.")
            existing = HKAttendanceRecord.objects.filter(worker=worker, date=sel_date, half=half).first()
            if existing and existing.is_submitted:
                pass
            elif (
                existing
                and status == "clear"
                and half == "second"
                and existing.note == "Auto from first half"
                and existing.status == "present"
            ):
                pass
            elif existing and (status == "clear" or existing.status == status):
                existing.delete()
            elif status != "clear":
                att, _ = HKAttendanceRecord.objects.get_or_create(
                    worker=worker, date=sel_date, half=half,
                    defaults={"marked_by": user}
                )
                att.status = status
                if half == "second":
                    att.note = "Second half exception"
                att.marked_by = user
                update_fields = ["status", "marked_by"]
                if half == "second":
                    update_fields.append("note")
                att.save(update_fields=update_fields)

            if request.headers.get("HX-Request"):
                sub = HKRelieverSubstitution.objects.filter(
                    original_worker=worker, date=sel_date
                ).select_related("reliever").first()
                if not sub:
                    sub = _substitution_for_reliever(worker, sel_area, sel_date)
                raw_rel = _attendance_relievers_for_area(sel_area, user=user)
                all_rel = _format_reliever_options(raw_rel, user=user, target_worker=worker, date=sel_date, area=sel_area)
                return render(request, "housekeeping/mobile/partials/attendance_worker_card.html", {
                    "row": {
                        "worker": worker,
                        "first_att": HKAttendanceRecord.objects.filter(worker=worker, date=sel_date, half="first").first(),
                        "second_att": HKAttendanceRecord.objects.filter(worker=worker, date=sel_date, half="second").first(),
                        "substitution": sub,
                        "can_assign_reliever": _is_jrha_area(sel_area) or not worker.is_reliever,
                        "reliever_options": all_rel,
                    },
                    "sel_date": sel_date,
                    "sel_area": sel_area,
                    "cur_half": cur_half,
                    "is_today": is_today,
                    "first_half_open": first_half_open,
                    "second_half_open": second_half_open,
                    "attn_choices": ATTENDANCE_CHOICES,
                    "second_attn_choices": SECOND_HALF_EXCEPTION_CHOICES,
                    "all_relievers": all_rel,
                })
            return redirect(f"/housekeeping/attendance/?date={sel_date}{area_param}")

    att_map = {(a.worker_id, a.half): a
               for a in HKAttendanceRecord.objects.filter(worker__in=workers, date=sel_date)}

    worker_rows = [{
        "worker": w,
        "first_att": att_map.get((w.id, "first")),
        "second_att": att_map.get((w.id, "second")),
        "can_assign_reliever": _is_jrha_area(sel_area) or not w.is_reliever,
    } for w in workers]

    # Reliever substitutions for today
    subs_today = {}
    if sel_area:
        subs_today = {
            s.original_worker_id: s
            for s in HKRelieverSubstitution.objects.filter(
                date=sel_date, area=sel_area,
            ).select_related("reliever")
        }
    for row in worker_rows:
        row["substitution"] = subs_today.get(row["worker"].id) or _substitution_for_reliever(
            row["worker"], sel_area, sel_date
        )

    raw_relievers = _attendance_relievers_for_area(sel_area, user=user)
    all_relievers = _format_reliever_options(raw_relievers, user=user, date=sel_date, area=sel_area)
    for row in worker_rows:
        row["reliever_options"] = _format_reliever_options(
            raw_relievers,
            user=user,
            target_worker=row["worker"],
            date=sel_date,
            area=sel_area,
        )

    # Group by worker type
    type_groups = {}
    for row in worker_rows:
        wt = row["worker"].worker_type
        type_groups.setdefault(wt, []).append(row)

    def all_submitted(half):
        return bool(workers) and all(
            att_map.get((w.id, half)) and att_map[(w.id, half)].is_submitted
            for w in workers
        )

    return render(request, "housekeeping/mobile/attendance.html", {
        "worker_rows": worker_rows,
        "type_groups": type_groups,
        "sel_date": sel_date,
        "sel_area": sel_area,
        "user_areas": visible_areas,
        "today": today,
        "is_today": is_today,
        "is_swm": is_swm,
        "can_mark_previous_swm_sunday": can_mark_previous_swm_sunday,
        "can_mark_previous_sunday_attendance": can_mark_previous_sunday_attendance,
        "can_submit_selected_attendance": can_submit_selected_attendance,
        "previous_sunday": previous_sunday,
        "cur_half": cur_half,
        "first_half_open": first_half_open,
        "second_half_open": second_half_open,
        "attendance_error": "Attendance can be marked only during the selected half time." if request.GET.get("att_err") == "half_closed" else "",
        "present_first": sum(1 for r in worker_rows if r["first_att"] and r["first_att"].status in ["present", "late"]),
        "present_second": sum(1 for r in worker_rows if r["second_att"] and r["second_att"].status in ["present", "late"]),
        "total_count": len(worker_rows),
        "first_submitted": all_submitted("first"),
        "second_submitted": all_submitted("second"),
        "attn_choices": ATTENDANCE_CHOICES,
        "second_attn_choices": SECOND_HALF_EXCEPTION_CHOICES,
        "all_relievers": all_relievers,
        "subs_today": subs_today,
    })


@hk_required
def hk_assign_reliever(request):
    """HTMX POST: assign a reliever to cover an absent worker for today."""
    if request.method != "POST":
        return HttpResponseForbidden()

    user = request.user
    if is_ganesh_jayesh_user(user):
        return HttpResponseBadRequest("Reliever functionality is not available for this supervisor.")

    user_areas = get_user_areas(user)
    area_id = request.POST.get("area_id")
    area = user_areas.filter(pk=area_id).first()
    if is_supervisor_excluded_area(area):
        return HttpResponseBadRequest("Reliever functionality is not available in this area.")

    today = timezone.localdate()

    with transaction.atomic():
        # of=('self',): HKWorker.Meta.ordering joins the nullable `area` FK, and PostgreSQL
        # refuses FOR UPDATE on the nullable side of an outer join.
        original = get_object_or_404(
            HKWorker.objects.select_for_update(of=('self',)),
            pk=request.POST.get("original_worker_id")
        )
        if area and original.id not in display_worker_ids_for_area(area):
            return HttpResponseBadRequest("Worker does not belong to the selected area.")
        if original.is_reliever and not _is_jrha_area(area or original.area):
            return HttpResponseBadRequest("Reliever workers cannot receive another reliever.")

        reliever_id = request.POST.get("reliever_id")
        reliever = HKWorker.objects.select_for_update(of=('self',)).filter(pk=reliever_id, is_active=True).first()
        if not reliever:
            return HttpResponseBadRequest("Selected worker is not a valid reliever.")

        allowed_relievers = _attendance_relievers_for_area(area or original.area, user=user)
        if not allowed_relievers.filter(pk=reliever.pk).exists():
            return HttpResponseBadRequest("Selected worker is not a valid reliever.")

        if reliever.id == original.id:
            return HttpResponseBadRequest("Worker cannot be assigned as a reliever for themselves.")

        already_absent = HKRelieverSubstitution.objects.filter(
            original_worker=reliever,
            date=today,
        ).select_related("reliever").first()
        if already_absent:
            return HttpResponseBadRequest("Selected worker is already replaced by another worker today.")

        if is_reliever_busy_for_target(reliever, original, today, area or original.area):
            return HttpResponseBadRequest("Selected reliever is already assigned to a conflicting active task.")

        note = request.POST.get("note", "")

        HKRelieverSubstitution.objects.update_or_create(
            original_worker=original,
            date=today,
            defaults={
                "reliever": reliever,
                "area": area or original.area,
                "note": note,
                "assigned_by": user,
            }
        )

        # Auto-mark original worker as leave for both halves (if not already submitted)
        for half in ["first", "second"]:
            att, _ = HKAttendanceRecord.objects.get_or_create(
                worker=original, date=today, half=half,
                defaults={"marked_by": user}
            )
            if not att.is_submitted:
                att.status = "leave"
                att.note = f"Reliever: {reliever.name}"
                att.marked_by = user
                att.save(update_fields=["status", "note", "marked_by"])

        _mark_reliever_present(reliever, today, user)
        _move_open_task_assignments_to_reliever(original, reliever, area or original.area, today, user)

    if request.headers.get("HX-Request"):
        sub = HKRelieverSubstitution.objects.filter(original_worker=original, date=today).select_related("reliever").first()
        first_att = HKAttendanceRecord.objects.filter(worker=original, date=today, half="first").first()
        second_att = HKAttendanceRecord.objects.filter(worker=original, date=today, half="second").first()
        all_relievers = _format_reliever_options(
            _attendance_relievers_for_area(area or original.area, user=user),
            user=user,
            target_worker=original,
            date=today,
            area=area or original.area,
        )
        return render(request, "housekeeping/mobile/partials/attendance_worker_card.html", {
            "row": {
                "worker": original,
                "first_att": first_att,
                "second_att": second_att,
                "substitution": sub,
                "can_assign_reliever": _is_jrha_area(area or original.area) or not original.is_reliever,
                "reliever_options": all_relievers,
            },
            "sel_date": today,
            "sel_area": area,
            "cur_half": current_half(),
            "is_today": True,
            "attn_choices": ATTENDANCE_CHOICES,
            "second_attn_choices": SECOND_HALF_EXCEPTION_CHOICES,
            "all_relievers": all_relievers,
        })

    area_param = f"?area={area.id}&date={today}" if area else f"?date={today}"
    return redirect(f"/housekeeping/attendance/{area_param}")



@hk_required
def hk_stock(request):
    user = request.user
    user_areas = get_user_areas(user)
    visible_areas = visible_user_areas(user, user_areas)
    sel_area = selected_area(request, visible_areas)
    area_stocks = HKAreaStock.objects.filter(area=sel_area).order_by("item_name") if sel_area else []
    _annotate_blocked_area_stocks(user, sel_area, area_stocks)
    issued_items = _build_usage_issues(user, area=sel_area) if sel_area else []
    active_requests = (
        HKStockRequest.objects
        .filter(requested_by=user, area=sel_area, status__in=["pending", "approved"])
        .select_related("item", "inventory_request")
        .order_by("-created_at")
        if sel_area else []
    )
    return render(request, "housekeeping/mobile/stock.html", {
        "area_stocks": area_stocks,
        "low_stocks": [s for s in area_stocks if s.is_low],
        "issued_items": issued_items,
        "active_requests": active_requests,
        "stock_card_count": len(area_stocks) + len(issued_items) + len(active_requests),
        "user_areas": visible_areas,
        "selected_area": sel_area,
        "requested": request.GET.get("requested"),
        "fully_covered": request.GET.get("fully_covered"),
        "partially_covered": request.GET.get("partially_covered"),
    })


@hk_required
def hk_stock_history(request):
    from apps.housekeeping.stock_history_service import (
        get_available_history_months,
        get_user_history_transactions,
        group_transactions_by_date,
    )

    user = request.user
    user_areas = get_user_areas(user)
    visible_areas = visible_user_areas(user, user_areas)

    area_id = request.GET.get("area")
    sel_area = None
    if area_id and area_id != "all":
        try:
            sel_area = visible_areas.filter(pk=area_id).first()
        except (ValueError, TypeError):
            sel_area = None

    month_options = get_available_history_months(user)

    selected_month = request.GET.get("month")
    from_date_raw = (request.GET.get("from_date") or "").strip()
    to_date_raw = (request.GET.get("to_date") or "").strip()
    from_date = parse_date(from_date_raw) if from_date_raw else None
    to_date = parse_date(to_date_raw) if to_date_raw else None

    if from_date or to_date:
        selected_month = "custom"
    elif not selected_month:
        default_month = timezone.localtime().strftime("%Y-%m")
        if any(m["value"] == default_month for m in month_options):
            selected_month = default_month
        elif month_options:
            selected_month = month_options[0]["value"]
        else:
            selected_month = default_month

    status_filter = (request.GET.get("status") or "all").lower().strip()
    if status_filter not in ["all", "issued", "pending", "rejected"]:
        status_filter = "all"

    search_query = (request.GET.get("q") or "").strip()

    res = get_user_history_transactions(
        user=user,
        area=sel_area,
        month=selected_month if selected_month != "custom" else None,
        from_date=from_date,
        to_date=to_date,
        status_filter=status_filter,
        search_query=search_query,
    )

    transactions = res["transactions"]
    date_groups = group_transactions_by_date(transactions)
    summary = res["summary"]

    return render(request, "housekeeping/mobile/stock_history.html", {
        "user_areas": visible_areas,
        "selected_area": sel_area,
        "date_groups": date_groups,
        "transactions": transactions,
        "total_transactions": len(transactions),
        "total_period_transactions": res["total_period_transactions"],
        "summary": summary,
        "month_options": month_options,
        "selected_month": selected_month,
        "from_date": from_date_raw,
        "to_date": to_date_raw,
        "status_filter": status_filter,
        "search_query": search_query,
    })


@hk_required
def hk_stock_history_detail(request, pk):
    from apps.housekeeping.stock_history_service import get_transaction_detail

    user = request.user
    tx = get_transaction_detail(user, pk)
    if not tx:
        return HttpResponseNotFound("Transaction record not found or access denied.")
    if request.headers.get("HX-Request") or request.GET.get("format") == "html":
        return render(request, "housekeeping/mobile/partials/stock_history_detail_modal.html", {"tx": tx})
    return JsonResponse(tx)


@hk_required
def hk_log_usage(request, pk):
    if request.method != "POST":
        return redirect("/housekeeping/stock/")

    user = request.user
    user_areas = get_user_areas(user)
    visible_areas = visible_user_areas(user, user_areas)

    issue = get_object_or_404(
        ItemIssue.objects.select_related(
            'request', 'request__item', 'request__requested_by', 'request__hkstockrequest__area'
        ),
        pk=pk,
        request__requested_by=user,
        is_reversed=False,
    )
    if issue.request.status == ItemRequest.Status.REJECTED:
        return HttpResponseForbidden("Cannot report usage on a rejected request.")

    hk_req = getattr(issue.request, "hkstockrequest", None)
    issue_area = hk_req.area if hk_req else None
    if issue_area and not visible_areas.filter(pk=issue_area.pk).exists():
        return HttpResponseForbidden("You do not have permission to log usage for this area.")

    posted_area_id = request.POST.get("area_id") or request.POST.get("area")
    posted_area = None
    if posted_area_id:
        try:
            posted_area = visible_areas.filter(pk=posted_area_id).first()
        except (ValueError, TypeError):
            pass

    target_area = posted_area or issue_area or selected_area(request, visible_areas)

    raw_qty = (request.POST.get("quantity_used") or "").strip()
    purpose = (request.POST.get("purpose") or "").strip()
    notes = request.POST.get("notes", "")
    error = None
    quantity_used = None

    try:
        quantity_used = Decimal(raw_qty)
    except (ValueError, TypeError, InvalidOperation):
        error = "Enter a valid number."

    if error is None:
        if quantity_used <= 0:
            error = "Quantity must be greater than 0."
        else:
            quantity_used = quantity_used.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            if issue.request.item.item_type == "asset":
                if quantity_used != quantity_used.to_integral_value():
                    error = "Enter a whole number for assets."

    if error is None and not purpose:
        error = "Please describe what the item was used for."

    if error is None:
        with transaction.atomic():
            issue = (
                ItemIssue.objects
                .select_for_update()
                .select_related('request__item', 'request__requested_by')
                .get(pk=pk, request__requested_by=user)
            )
            if issue.is_reversed or issue.request.status == ItemRequest.Status.REJECTED:
                error = "Cannot report usage on a rejected or reversed request."
            else:
                total_used = ItemUsageLog.objects.filter(issue=issue).aggregate(
                    total=Coalesce(
                        Sum('quantity_used'),
                        Value(0),
                        output_field=DecimalField(max_digits=10, decimal_places=2),
                    )
                )['total']
                remaining = Decimal(issue.issued_quantity) - total_used
                if remaining <= 0:
                    error = "All issued quantity has already been logged."
                elif quantity_used > remaining:
                    remaining_display = remaining.quantize(Decimal("0.01"))
                    error = (
                        f"Cannot exceed remaining quantity ({remaining_display} "
                        f"{issue.request.item.unit})."
                    )
                else:
                    ItemUsageLog.objects.create(
                        issue=issue,
                        quantity_used=quantity_used,
                        purpose=purpose,
                        notes=notes,
                        logged_by=user,
                    )

    if error is None:
        if target_area:
            return redirect(f"/housekeeping/stock/?area={target_area.id}")
        return redirect("/housekeeping/stock/")

    sel_area = target_area or selected_area(request, visible_areas)
    area_stocks = HKAreaStock.objects.filter(area=sel_area).order_by("item_name") if sel_area else []
    _annotate_blocked_area_stocks(user, sel_area, area_stocks)
    my_requests = (
        HKStockRequest.objects.filter(requested_by=user, area=sel_area).order_by("-created_at")
        if sel_area else []
    )
    issued_items = _build_usage_issues(user, area=sel_area) if sel_area else []
    active_requests = (
        HKStockRequest.objects
        .filter(requested_by=user, area=sel_area, status__in=["pending", "approved"])
        .select_related("item", "inventory_request")
        .order_by("-created_at")
        if sel_area else []
    )
    return render(request, "housekeeping/mobile/stock.html", {
        "area_stocks": area_stocks,
        "low_stocks": [s for s in area_stocks if s.is_low],
        "my_requests": my_requests,
        "issued_items": issued_items,
        "active_requests": active_requests,
        "stock_card_count": len(area_stocks) + len(issued_items) + len(active_requests),
        "user_areas": visible_areas,
        "selected_area": sel_area,
        "requested": request.GET.get("requested"),
        "form_error": error,
        "error_issue_id": issue.id,
        "open_form_issue_id": issue.id,
    })


@hk_required
def hk_stock_request(request):
    from apps.inventory.models import Item, ItemRequest as InvItemRequest, ItemRequestBatch, RequisitionItem
    from apps.housekeeping.stock_reconciliation import (
        get_area_unreported_stock_items,
        get_unallocated_outstanding_stock,
        reconcile_and_create_batch_stock_requests,
        reconcile_and_create_stock_request,
    )

    user = request.user
    user_areas = get_user_areas(user)
    visible_areas = visible_user_areas(user, user_areas)
    hk_cats = ["Cleaning Supplies", "Housekeeping Supplies", "Consumables",
               "Tools & Equipment", "Garden & Horticulture Equipment"]
    inv_items = filter_requestable_items(
        Item.objects.filter(category__name__in=hk_cats).select_related("category").order_by("name"),
        user,
    )

    if request.method == "POST":
        posted_items_raw = request.POST.get("items")
        if posted_items_raw is not None:
            area_id = request.POST.get("area_id")
            area = visible_areas.filter(pk=area_id).first() if area_id else visible_areas.first()
            reason = request.POST.get("reason", "").strip()
            logger.debug(
                "HK stock request received: user=%s area_id=%s post_keys=%s raw_items=%s",
                user.pk,
                area_id,
                list(request.POST.keys()),
                posted_items_raw,
            )
            try:
                posted_items = json.loads(posted_items_raw or "[]")
            except json.JSONDecodeError:
                posted_items = []

            item_quantities = {}
            error = ""
            for line in posted_items:
                try:
                    item_id = int(line.get("inventory_item_id") or line.get("itemId"))
                    quantity = int(line.get("quantity"))
                except (TypeError, ValueError, AttributeError):
                    error = "Please select valid inventory items and quantities."
                    break
                if quantity <= 0:
                    error = "Quantity must be greater than 0."
                    break
                if item_id in item_quantities:
                    error = "Same item cannot be added twice."
                    break
                item_quantities[item_id] = quantity
            logger.debug(
                "HK stock request parsed: user=%s area=%s item_count=%s items=%s",
                user.pk,
                area.name if area else None,
                len(item_quantities),
                item_quantities,
            )

            if not error and not item_quantities:
                error = "Please add at least one inventory item."
            if not error and not reason:
                error = "Please enter a reason."

            if not error:
                with transaction.atomic():
                    locked_items = {
                        item.id: item
                        for item in Item.objects.select_for_update().filter(pk__in=item_quantities.keys())
                    }
                    if len(locked_items) != len(item_quantities):
                        error = "One or more selected inventory items were not found."
                    else:
                        from apps.housekeeping.stock_reconciliation import get_unallocated_outstanding_stock, reconcile_and_create_batch_stock_requests
                        for item_id, quantity in item_quantities.items():
                            item = locked_items[item_id]
                            if not user_can_request_item(user, item):
                                error = UNAUTHORIZED_ITEM_REQUEST_MESSAGE
                                break
                            unaccounted = get_unaccounted_item_quantity(user, item, area=area)
                            if unaccounted > Decimal('0.00'):
                                error = f"Cannot request {item.name}: previous item's usage report must be completed before requesting it again ({unaccounted} {item.unit} pending)."
                                break
                            unallocated = get_unallocated_outstanding_stock(user, area, item)
                            needed_from_wh = max(0, quantity - int(math.floor(unallocated)))
                            if needed_from_wh > 0 and item.available_quantity <= 0:
                                error = f"{item.name} is out of stock in warehouse."
                                break
                            if needed_from_wh > item.available_quantity:
                                error = EXCESSIVE_QUANTITY_MESSAGE
                                break

                    if not error:
                        is_urgent = request.POST.get("is_urgent") == "on"
                        from apps.housekeeping.stock_reconciliation import reconcile_and_create_batch_stock_requests
                        res = reconcile_and_create_batch_stock_requests(
                            user=user,
                            area=area,
                            item_quantities=item_quantities,
                            reason=reason,
                            is_urgent=is_urgent,
                        )
                        redirect_param = "requested=1"
                        if res['fully_covered_count'] == len(item_quantities):
                            redirect_param += "&fully_covered=1"
                        elif res['fully_covered_count'] > 0 or res['partially_covered_count'] > 0:
                            redirect_param += "&partially_covered=1"
                        return redirect(f"/housekeeping/stock/?{redirect_param}&area={area.id if area else ''}")

            if error:
                logger.debug(
                    "HK stock request validation failed: user=%s area=%s error=%s",
                    user.pk,
                    area.name if area else None,
                    error,
                )

            sel_area_for_render = area or selected_area(request, visible_areas)
            from apps.housekeeping.stock_reconciliation import get_area_unreported_stock_items
            unreported_stocks = get_area_unreported_stock_items(user, sel_area_for_render, inv_items)
            for item in inv_items:
                out_qty = get_unaccounted_item_quantity(user, item, area=sel_area_for_render)
                item.is_blocked = out_qty > Decimal('0.00')
                item.outstanding_quantity = out_qty
            return render(request, "housekeeping/mobile/stock_request.html", {
                "inv_items": inv_items,
                "user_areas": visible_areas,
                "selected_area": sel_area_for_render,
                "pre_item": request.GET.get("item", ""),
                "form_error": error,
                "unreported_stocks": unreported_stocks,
            })

        item_name = request.POST.get("item_name", "").strip()
        inv_item = None
        inv_id = request.POST.get("inventory_item_id")
        if inv_id:
            inv_item = Item.objects.filter(pk=inv_id).first()
            if inv_item:
                item_name = inv_item.name

        area_id = request.POST.get("area_id")
        area = visible_areas.filter(pk=area_id).first() if area_id else visible_areas.first()
        if not item_name:
            return redirect(f"/housekeeping/stock/?error=item_name_required&area={area.id if area else ''}")
        try:
            qty = int(request.POST.get("quantity", 1) or 1)
        except (TypeError, ValueError):
            qty = 0
        if qty <= 0:
            return redirect(f"/housekeeping/stock/?error=invalid_quantity&area={area.id if area else ''}")
        if inv_item and not user_can_request_item(user, inv_item):
            return render(request, "housekeeping/mobile/stock_request.html", {
                "inv_items": inv_items,
                "user_areas": visible_areas,
                "selected_area": area or selected_area(request, visible_areas),
                "pre_item": request.GET.get("item", ""),
                "form_error": UNAUTHORIZED_ITEM_REQUEST_MESSAGE,
            })

        if inv_item:
            from apps.housekeeping.stock_reconciliation import get_unallocated_outstanding_stock, reconcile_and_create_stock_request
            with transaction.atomic():
                locked_item = Item.objects.select_for_update().get(pk=inv_item.pk)
                unaccounted = get_unaccounted_item_quantity(user, locked_item, area=area)
                if unaccounted > Decimal('0.00'):
                    sel_area_for_render = area or selected_area(request, visible_areas)
                    unreported_stocks = get_area_unreported_stock_items(user, sel_area_for_render, inv_items)
                    for item in inv_items:
                        out_qty = get_unaccounted_item_quantity(user, item, area=sel_area_for_render)
                        item.is_blocked = out_qty > Decimal('0.00')
                        item.outstanding_quantity = out_qty
                    return render(request, "housekeeping/mobile/stock_request.html", {
                        "inv_items": inv_items,
                        "user_areas": visible_areas,
                        "selected_area": sel_area_for_render,
                        "pre_item": request.GET.get("item", ""),
                        "form_error": f"Cannot request {locked_item.name}: previous item's usage report must be completed before requesting it again ({unaccounted} {locked_item.unit} pending).",
                        "unreported_stocks": unreported_stocks,
                    })
                unallocated = get_unallocated_outstanding_stock(user, area, locked_item)
                needed_from_wh = max(0, qty - int(math.floor(unallocated)))
                if needed_from_wh > 0 and locked_item.available_quantity <= 0:
                    return render(request, "housekeeping/mobile/stock_request.html", {
                        "inv_items": inv_items,
                        "user_areas": visible_areas,
                        "selected_area": area or selected_area(request, visible_areas),
                        "pre_item": request.GET.get("item", ""),
                        "form_error": f"{locked_item.name} is out of stock in warehouse.",
                    })
                if needed_from_wh > locked_item.available_quantity:
                    return render(request, "housekeeping/mobile/stock_request.html", {
                        "inv_items": inv_items,
                        "user_areas": visible_areas,
                        "selected_area": area or selected_area(request, visible_areas),
                        "pre_item": request.GET.get("item", ""),
                        "form_error": EXCESSIVE_QUANTITY_MESSAGE,
                    })

                is_urgent = request.POST.get("is_urgent") == "on"
                hk_req, inv_req, cov_qty, app_qty = reconcile_and_create_stock_request(
                    user=user,
                    area=area,
                    item=locked_item,
                    quantity=qty,
                    reason=request.POST.get("reason", "").strip(),
                    is_urgent=is_urgent,
                )
                redirect_param = "requested=1"
                if hk_req.is_fully_covered:
                    redirect_param += "&fully_covered=1"
                elif hk_req.is_partially_covered:
                    redirect_param += "&partially_covered=1"
                return redirect(f"/housekeeping/stock/?{redirect_param}&area={area.id if area else ''}")

        hk_req = HKStockRequest.objects.create(
            requested_by=user, area=area,
            item_name=item_name, item=None,
            quantity=qty, unit=request.POST.get("unit", "").strip(),
            reason=request.POST.get("reason", "").strip(),
            is_urgent=request.POST.get("is_urgent") == "on",
            status="pending",
        )
        return redirect(f"/housekeeping/stock/?requested=1&area={area.id if area else ''}")

    sel_area = selected_area(request, visible_areas)
    from apps.housekeeping.stock_reconciliation import get_area_unreported_stock_items
    unreported_stocks = get_area_unreported_stock_items(user, sel_area, inv_items)
    for item in inv_items:
        out_qty = get_unaccounted_item_quantity(user, item, area=sel_area)
        item.is_blocked = out_qty > Decimal('0.00')
        item.outstanding_quantity = out_qty
    return render(request, "housekeeping/mobile/stock_request.html", {
        "inv_items": inv_items,
        "user_areas": visible_areas,
        "selected_area": sel_area,
        "pre_item": request.GET.get("item", ""),
        "unreported_stocks": unreported_stocks,
    })


@hk_required
def hk_profile(request):
    user = request.user
    user_areas = get_user_areas(user)
    visible_areas = visible_user_areas(user, user_areas)
    user_area_items = [
        {
            "name": area.name,
            "meta": area.get_area_type_display(),
        }
        for area in visible_areas
    ]
    today = timezone.localdate()
    success = error = ""
    show_incharge_selector = False
    selector_leave_request = None
    selector_candidates = []
    selected_leave_date = ""
    selected_leave_area_id = ""
    leave_reason_value = ""

    if request.method == "POST":
        action = request.POST.get("action")
        if action == "change_password":
            cur = request.POST.get("current_password", "")
            new = request.POST.get("new_password", "")
            conf = request.POST.get("confirm_password", "")
            if not user.check_password(cur):
                error = "Current password is incorrect."
            elif new != conf:
                error = "Passwords do not match."
            elif len(new) < 8:
                # align to Django's default minimum of 8
                error = "Minimum 8 characters required."
            else:
                user.set_password(new)
                user.save()
                update_session_auth_hash(request, user)
                success = "Password updated successfully."
        elif action == "upload_photo" and "profile_photo" in request.FILES:
            user.profile_photo = request.FILES["profile_photo"]
            user.save(update_fields=["profile_photo"])
            success = "Photo updated."
        elif action == "submit_leave":
            area_id = request.POST.get("leave_area_id")
            leave_date_str = (request.POST.get("leave_date") or "").strip()
            leave_reason_value = (request.POST.get("leave_reason") or "").strip()
            selected_leave_date = leave_date_str
            selected_leave_area_id = area_id or ""

            all_areas = str(area_id or "").strip().lower() == "all"
            if all_areas:
                area = visible_areas.first()
            else:
                area = visible_areas.filter(pk=area_id).first() if area_id else selected_area(request, visible_areas)
            if not area:
                error = "Please select a valid area."
            else:
                try:
                    leave_date = datetime.datetime.strptime(leave_date_str, "%Y-%m-%d").date()
                except (TypeError, ValueError):
                    leave_date = None

                if not leave_date:
                    error = "Please select a valid leave date."
                elif leave_date < today:
                    error = "Leave date cannot be in the past."
                else:
                    leave_req, _ = HKLeaveRequest.objects.get_or_create(
                        staff=user,
                        leave_date=leave_date,
                        defaults={
                            "area": area,
                            "reason": leave_reason_value,
                            "all_areas": all_areas,
                            "status": "awaiting_incharge",
                        },
                    )
                    if leave_req.area_id != area.id:
                        leave_req.area = area
                    leave_req.reason = leave_reason_value
                    leave_req.all_areas = all_areas
                    # Reset flow when creating/re-submitting from profile.
                    if leave_req.status in {"approved", "pending_admin_approval", "pending_acceptance"}:
                        leave_req.status = "awaiting_incharge"
                    leave_req.save(update_fields=["area", "reason", "all_areas", "status", "updated_at"])
                    show_incharge_selector = True
                    selector_leave_request = leave_req
                    selector_candidates = _staff_candidates_for_leave_request(leave_req, exclude_user_id=user.id)
                    if not selector_candidates:
                        error = "No eligible staff found for temporary incharge."
                    else:
                        success = "Leave request submitted. Select temporary incharge."
        elif action == "assign_temp_incharge":
            leave_req_id = request.POST.get("leave_request_id")
            assigned_staff_id = request.POST.get("assigned_staff_id")
            note = (request.POST.get("incharge_note") or "").strip()
            leave_req = (
                HKLeaveRequest.objects.select_related("area", "staff")
                .filter(pk=leave_req_id, staff=user)
                .first()
            )
            if not leave_req:
                error = "Leave request not found."
            else:
                candidate_ids = {row["user"].id for row in _staff_candidates_for_leave_request(leave_req, exclude_user_id=user.id)}
                if not assigned_staff_id or not str(assigned_staff_id).isdigit():
                    error = "Please select temporary incharge."
                elif int(assigned_staff_id) not in candidate_ids:
                    error = "Selected incharge is not valid."
                else:
                    assigned_staff = get_object_or_404(UserModel, pk=int(assigned_staff_id), is_active=True)
                    _assign_incharge_for_leave(leave_req, assigned_staff, user, note=note)
                    return redirect(f"/housekeeping/dashboard/?area={leave_req.area_id}&ic_ok=sent")

    recent_leaves = list(
        HKLeaveRequest.objects.filter(staff=user, leave_date__gte=today - datetime.timedelta(days=30))
        .select_related("area")
        .order_by("-leave_date", "-created_at")[:20]
    )
    return render(request, "housekeeping/mobile/profile.html", {
        "user": user,
        "user_areas": visible_areas,
        "user_area_items": user_area_items,
        "success": success,
        "error": error,
        "today": today,
        "recent_leaves": recent_leaves,
        "show_incharge_selector": show_incharge_selector,
        "selector_leave_request": selector_leave_request,
        "selector_candidates": selector_candidates,
        "selected_leave_date": selected_leave_date,
        "selected_leave_area_id": selected_leave_area_id,
        "leave_reason_value": leave_reason_value,
    })


@hk_required
def hk_alerts_manage(request):
    if not can_manage_housekeeping_user(request.user):
        return redirect("/housekeeping/dashboard/")
    if request.method == "POST":
        action = request.POST.get("action")
        if action == "create":
            alert = HKAlert.objects.create(
                title=request.POST.get("title", ""),
                message=request.POST.get("message", ""),
                priority=request.POST.get("priority", "info"),
                created_by=request.user,
                is_active=True,
            )
            ids = request.POST.getlist("areas")
            if ids:
                alert.target_areas.set(ids)
        elif action == "deactivate":
            HKAlert.objects.filter(pk=request.POST.get("alert_id")).update(is_active=False)
        return redirect("/housekeeping/alerts/")
    return render(request, "housekeeping/mobile/alerts_manage.html", {
        "alerts": HKAlert.objects.order_by("-created_at")[:20],
        "all_areas": HKArea.objects.filter(is_active=True),
    })
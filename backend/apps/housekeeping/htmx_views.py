import datetime
import functools
import logging

from django.contrib.auth import (
    authenticate,
    login as auth_login,
    logout as auth_logout,
    update_session_auth_hash,
)
from django.db import models as dm
from django.http import HttpResponseBadRequest, HttpResponseForbidden
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_POST

from .models import (
    HKAlert,
    HKArea,
    HKAreaStock,
    HKAttendanceRecord,
    HKDailyRecord,
    HKExtraWork,
    HKRelieverSubstitution,
    HKScheduleTemplate,
    HKStockRequest,
    HKSundayIncharge,
    HKTaskWorkerAssignment,
    HKUserArea,
    HKWorker,
    HKWorkerSelectionRequest,
)

logger = logging.getLogger(__name__)

ATTENDANCE_CHOICES = [
    ("present", "Present", "#d1fae5", "#065f46"),
    ("absent", "Absent", "#fee2e2", "#991b1b"),
    ("late", "Late", "#fef3c7", "#92400e"),
    ("leave", "Leave", "#dbeafe", "#1d4ed8"),
]

WORKER_TAG_LABELS = {
    "room": ("room", "Room Staff"),
    "floor": ("floor", "Floor Staff"),
    "washroom": ("washroom", "Washroom Staff"),
    "all": ("all", "All Staff"),
    "general": ("general", "General"),
}


def area_bucket(area):
    if not area:
        return "others"
    n = (area.name or "").strip()
    if n.lower() in {"hostel common area", "common area", "hostels reliever"}:
        return "hostels"
    if n in {"Academic Common Area", "New AB U-Shape", "New Academy"}:
        return "academic"
    if n.startswith("Academic Block "):
        return "academic"
    if area.area_type == "hostel":
        return "hostels"
    return "others"


def get_user_areas(user):
    if user.role in ["admin", "housekeeping_manager"]:
        return HKArea.objects.filter(is_active=True)
    return HKArea.objects.filter(assigned_users__user=user, is_active=True)


def hk_required(fn):
    @functools.wraps(fn)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return redirect(f"/housekeeping/login/?next={request.path}")
        # deactivated users must not pass through even if role matches
        if not request.user.is_active:
            return redirect("/housekeeping/login/")
        if request.user.role not in ["admin", "housekeeping_manager", "supervisor", "caretaker"]:
            return redirect("/housekeeping/login/")
        return fn(request, *args, **kwargs)
    return wrapper


def selected_area(request, user_areas):
    aid = request.GET.get("area") or request.POST.get("area")
    if aid:
        area = user_areas.filter(pk=aid).first()
        if area:
            return area
    return user_areas.first()


def get_today_records(area, date):
    """
    Generate HKDailyRecord for every applicable template for this area/date.
    daily templates run every day.
    saturday_special templates run only on Saturday.
    sunday_extra templates run only on Sunday.
    """
    from django.db import IntegrityError, transaction

    dow = date.weekday()  # 0=Mon, 6=Sun
    is_swm_area = area.area_type == "swm"

    # SWM business rule:
    # - Monday-Saturday: normal daily flow
    # - Sunday: only rotational deep-clean tasks
    if is_swm_area and dow == 6:
        templates = HKScheduleTemplate.objects.filter(
            area=area, is_active=True, frequency="sunday_extra"
        )
    else:
        templates = HKScheduleTemplate.objects.filter(area=area, is_active=True, frequency="daily")
        if dow == 5:
            saturday_qs = HKScheduleTemplate.objects.filter(
                area=area, is_active=True, frequency="saturday_special"
            )
            templates = (templates | saturday_qs).distinct()
        if dow == 6:
            sunday_qs = HKScheduleTemplate.objects.filter(
                area=area, is_active=True, frequency="sunday_extra"
            )
            templates = (templates | sunday_qs).distinct()

    template_list = list(templates.order_by("worker_tag", "order", "start_time"))

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

    return (
        HKDailyRecord.objects
        .filter(area=area, date=date, schedule__in=template_list)
        .select_related("schedule", "completed_by", "assigned_worker", "assigned_by", "area")
        .prefetch_related("worker_assignments__worker")
        .order_by("schedule__worker_tag", "schedule__order", "schedule__start_time")
    )


def current_half():
    h = timezone.localtime(timezone.now()).hour
    return "first" if h < 13 else "second"


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
    if request.user.is_authenticated and request.user.role in [
        "supervisor", "caretaker", "admin", "housekeeping_manager"
    ]:
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
            username=request.POST.get("username", "").strip(),
            password=request.POST.get("password", ""),
        )
        if user and user.is_active and user.role in [
            "supervisor", "caretaker", "admin", "housekeeping_manager"
        ]:
            auth_login(request, user)
            if user.role == "admin":
                return redirect("/admin-portal/")
            return redirect(next_url)
        error = "You do not have housekeeping access." if (user and user.is_active) else "Invalid username or password."
    return render(request, "housekeeping/mobile/login.html", {"error": error, "next": next_url})


# require POST for logout to prevent CSRF-style logout via GET
@require_POST
def hk_logout(request):
    auth_logout(request)
    return redirect("/portal/login/")


@hk_required
def hk_dashboard(request):
    user = request.user
    today = timezone.localdate()
    user_areas = get_user_areas(user)
    sel_area = selected_area(request, user_areas)

    records = list(get_today_records(sel_area, today)) if sel_area else []
    area_name = sel_area.name if sel_area else ""
    is_old_guest_house = area_name == "Old Guest House"

    grouped = {}
    for rec in records:
        tag = rec.schedule.worker_tag or "general"
        if is_old_guest_house and tag == "all":
            task_title = (rec.schedule.task_name or "").lower()
            if "break" in task_title or "lunch" in task_title:
                tag = "floor"
        grouped.setdefault(tag, []).append(rec)
    # Keep worker-group keys stable so mobile tabs render consistently.
    grouped.setdefault("floor", [])
    grouped.setdefault("room", [])
    grouped.setdefault("washroom", [])
    grouped.setdefault("all", [])

    is_common_area = area_name == "Hostel Common Area"
    is_research_park = area_name == "Research Park"
    is_central_arcade = area_name == "Central Arcade"
    is_sports_complex = area_name == "Sports Complex"
    is_guest_house_new = area_name == "Guest House New"
    is_director_bungalow = area_name == "Director Bungalow"
    is_roads_outdoor = area_name == "Roads & Outdoor"
    is_swm = area_name == "Solid Waste Management"
    is_academic = bool(sel_area and sel_area.area_type == "academic")
    if is_common_area:
        tab_label_floor = "Route A"
        tab_label_room = "Core Area"
        tab_label_washroom = "Night Route"
        heading_floor = "Day Route Operations"
        heading_room = "Core Common Zones"
        heading_washroom = "Night Touch-up Route"
    elif is_research_park:
        tab_label_floor = "Ground Ops"
        tab_label_room = "Office Zone"
        tab_label_washroom = "WR Zone"
        heading_floor = "Ground and External Operations"
        heading_room = "Office and Meeting Zones"
        heading_washroom = "Washroom and Utility Rounds"
    elif is_central_arcade:
        tab_label_floor = "Vijay Zone"
        tab_label_room = "Bhavna Zone"
        tab_label_washroom = "Ramesh Zone"
        heading_floor = "Ground and Entry Operations"
        heading_room = "First Floor and Hall Operations"
        heading_washroom = "Second Floor and Washroom Operations"
    elif is_sports_complex:
        tab_label_floor = "Indoor Ops"
        tab_label_room = "Hall Zone"
        tab_label_washroom = "Pool/WR"
        heading_floor = "Indoor and Evening Operations"
        heading_room = "Hall and Office Operations"
        heading_washroom = "Washroom and Pool Utility Operations"
    elif is_guest_house_new:
        tab_label_floor = "Ground/Canteen"
        tab_label_room = "Room Ops"
        tab_label_washroom = "Upper Floors"
        heading_floor = "Ground Floor and Canteen Operations"
        heading_room = "Room and Shift Operations"
        heading_washroom = "Upper Floor and Washroom Operations"
    elif is_director_bungalow:
        tab_label_floor = "Outer Area"
        tab_label_room = "Inside Ops"
        tab_label_washroom = "WR Checks"
        heading_floor = "Bungalow Surrounding and Garden Operations"
        heading_room = "Inside Bungalow and Camp Office Operations"
        heading_washroom = "Common Washroom and Kitchen Checks"
    elif is_roads_outdoor:
        tab_label_floor = "Route C/K"
        tab_label_room = "Route E/F"
        tab_label_washroom = "Route B/A"
        heading_floor = "Parking and Circle Route Operations"
        heading_room = "Residence and RB Connector Routes"
        heading_washroom = "Academic/Hostel/Gate-5 Route Operations"
    elif is_swm:
        tab_label_floor = "Collection"
        tab_label_room = "Transport"
        tab_label_washroom = "Segregation"
        heading_floor = "Primary and Secondary Collection Routes"
        heading_room = "Tempo and Vehicle Collection Operations"
        heading_washroom = "Segregation and Supervisor Operations"
    elif is_academic:
        tab_label_floor = "Block Ops"
        tab_label_room = "Labs/Office"
        tab_label_washroom = "WR/Common"
        heading_floor = "Block and Corridor Operations"
        heading_room = "Classroom, Lab and Office Operations"
        heading_washroom = "Washroom and Common Area Operations"
    else:
        tab_label_floor = "Floor"
        tab_label_room = "Room"
        tab_label_washroom = "WR"
        heading_floor = "Floor Staff"
        heading_room = "Room Staff"
        heading_washroom = "Washroom Staff"

    total = len(records)
    done = sum(1 for rec in records if rec.status == "done")
    pct = int((done / total) * 100) if total else 0

    today_dow = today.weekday()
    sunday_incharge = None
    upcoming_sunday = None
    area_workers = list(HKWorker.objects.filter(area=sel_area, is_active=True).order_by("name")) if sel_area else []
    if today_dow == 5 and sel_area:
        upcoming_sunday = today + datetime.timedelta(days=1)
        sunday_incharge = HKSundayIncharge.objects.filter(
            area=sel_area, for_sunday=upcoming_sunday
        ).first()

    extra_works = HKExtraWork.objects.filter(area=sel_area, date=today).order_by("-logged_at") if sel_area else []

    worker_selection_cards = []
    if user.role in ["supervisor", "caretaker"]:
        user_area_list = list(user_areas)
        user_area_ids = {a.id for a in user_area_list}
        if user_area_ids:
            area_by_id = {a.id: a for a in user_area_list}
            worker_selection_requests = list(
                HKWorkerSelectionRequest.objects.filter(
                    status="pending",
                ).select_related(
                    "source_area", "target_area", "requested_by",
                ).prefetch_related("workers").order_by("-created_at")[:40]
            )

            for req in worker_selection_requests:
                # Mobile should show only fresh admin requests where staff must select workers.
                if req.workers.exists():
                    continue

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
        }
        ws_error = err_map.get(ws_err_code, "Unable to submit worker request.")

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

    return render(request, "housekeeping/mobile/dashboard.html", {
        "today": today,
        "today_dow": today_dow,
        "user_areas": user_areas,
        "selected_area": sel_area,
        "records": records,
        "grouped": grouped,
        "tag_labels": WORKER_TAG_LABELS,
        "total_tasks": total,
        "done_tasks": done,
        "percent_done": pct,
        "alerts": get_active_alerts(user, user_areas),
        "sunday_incharge": sunday_incharge,
        "upcoming_sunday": upcoming_sunday,
        "area_workers": area_workers,
        "extra_works": extra_works,
        "tab_label_floor": tab_label_floor,
        "tab_label_room": tab_label_room,
        "tab_label_washroom": tab_label_washroom,
        "heading_floor": heading_floor,
        "heading_room": heading_room,
        "heading_washroom": heading_washroom,
        # Product requirement: Special tab should be visible in all HK dashboards.
        # It can be empty by default and then receive admin-assigned area tasks.
        "has_special_tasks": bool(sel_area),
        "can_assign_tasks": user.role in ["admin", "housekeeping_manager", "supervisor", "caretaker"],
        "worker_selection_cards": worker_selection_cards,
        "show_ws_overlay": bool(worker_selection_cards) and user.role in ["supervisor", "caretaker"],
        "ws_ok": ws_ok,
        "ws_error": ws_error,
        "ws_decision_notice": ws_decision_notice,
    })


@hk_required
@require_POST
def hk_worker_selection_request(request):
    """
    Deprecated mobile-create endpoint.
    Worker selection request creation is now admin-only (admin dashboard).
    """
    user_areas = get_user_areas(request.user)
    area = selected_area(request, user_areas)
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
    area = selected_area(request, user_areas)
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
def hk_mark_task(request, record_id):
    if request.method != "POST":
        return HttpResponseForbidden()
    record = get_object_or_404(HKDailyRecord, pk=record_id)
    user = request.user
    if record.area not in get_user_areas(user):
        return HttpResponseForbidden("Not your area.")

    task_error = ""
    action = request.POST.get("action")
    now = timezone.now()
    task_title = (record.schedule.task_name or "").lower()
    is_break_task = ("break" in task_title) or ("lunch" in task_title)
    can_mark_break = user.role == "supervisor"
    is_swm_task = record.area.area_type == "swm"

    def has_worker_assignment():
        if record.assigned_worker_id:
            return True
        if is_swm_task:
            return record.worker_assignments.exists()
        return False

    if action == "assign":
        if is_break_task:
            task_error = "Break tasks do not need worker assignment."
        elif is_swm_task:
            # SWM rule: once team is assigned for a task, do not allow reassignment.
            if record.assigned_worker_id or record.worker_assignments.exists():
                task_error = "Team already assigned for this SWM task."
            else:
                worker_ids = [w for w in request.POST.getlist("worker_ids") if w]
                if not worker_ids:
                    single_worker_id = request.POST.get("worker_id")
                    if single_worker_id:
                        worker_ids = [single_worker_id]

                workers = list(
                    HKWorker.objects.filter(
                        pk__in=worker_ids,
                        area=record.area,
                        is_active=True,
                    ).order_by("name")
                )
                if not workers:
                    task_error = "Please select at least one valid SWM worker."
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
            worker = HKWorker.objects.filter(pk=worker_id, area=record.area, is_active=True).first()
            if worker:
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
            record.save(update_fields=["status", "started_at", "note"])

    elif action == "undo":
        record.status = "pending"
        record.started_at = None
        record.completed_by = None
        record.completed_at = None
        record.photo_after = None
        record.save(update_fields=["status", "started_at", "completed_by", "completed_at", "photo_after"])

    elif action == "done":
        if is_break_task and not can_mark_break:
            task_error = "Only supervisor can mark break done."
        elif is_break_task:
            record.status = "done"
            record.completed_by = user
            record.completed_at = now
            record.note = request.POST.get("note", "").strip()
            record.save(update_fields=["status", "completed_by", "completed_at", "note"])
        elif not has_worker_assignment():
            task_error = "Assign worker first."
        elif record.schedule.requires_photo and "photo_after" not in request.FILES and not record.photo_after:
            task_error = "After-photo is required to complete this task."
        else:
            record.status = "done"
            record.completed_by = user
            record.completed_at = now
            record.note = request.POST.get("note", "").strip()
            if "photo_before" in request.FILES:
                record.photo_before = request.FILES["photo_before"]
            if "photo_after" in request.FILES:
                record.photo_after = request.FILES["photo_after"]
            lat = request.POST.get("latitude")
            lng = request.POST.get("longitude")
            if lat and lng:
                try:
                    record.latitude = float(lat)
                    record.longitude = float(lng)
                except (ValueError, TypeError):
                    pass
            record.save()

    record = HKDailyRecord.objects.select_related(
        "schedule", "assigned_worker", "assigned_by", "area", "completed_by"
    ).prefetch_related("worker_assignments__worker").get(pk=record.pk)
    area_workers = list(HKWorker.objects.filter(area=record.area, is_active=True).order_by("name"))
    return render(request, "housekeeping/mobile/partials/task_card.html", {
        "record": record,
        "tag_labels": WORKER_TAG_LABELS,
        "area_workers": area_workers,
        "can_assign_tasks": user.role in ["admin", "housekeeping_manager", "supervisor", "caretaker"],
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
    task_name = request.POST.get("task_name", "").strip()
    if not task_name:
        param = f"?area={area.id}&error=task_name_required" if area else "?error=task_name_required"
        return redirect(f"/housekeeping/dashboard/{param}")

    extra = HKExtraWork(
        area=area,
        date=timezone.localdate(),
        task_name=task_name,
        description=request.POST.get("description", "").strip(),
        worker_name=request.POST.get("worker_name", "").strip(),
        logged_by=user,
    )
    if "photo" in request.FILES:
        extra.photo = request.FILES["photo"]
    extra.save()
    param = f"?area={area.id}" if area else ""
    return redirect(f"/housekeeping/dashboard/{param}")


@hk_required
def hk_schedule(request):
    user = request.user
    user_areas = get_user_areas(user)
    sel_area = selected_area(request, user_areas)
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

    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    weekly = []
    if sel_area:
        daily = list(HKScheduleTemplate.objects.filter(
            area=sel_area, is_active=True, frequency="daily"
        ).order_by("worker_tag", "order", "start_time"))
        saturday_special = list(HKScheduleTemplate.objects.filter(
            area=sel_area, is_active=True, frequency="saturday_special"
        ).order_by("worker_tag", "order", "start_time"))
        sunday_extra = list(HKScheduleTemplate.objects.filter(
            area=sel_area, is_active=True, frequency="sunday_extra"
        ).order_by("order", "start_time"))
        for i, day in enumerate(days):
            if is_swm and i == 6:
                tasks = list(sunday_extra)
            else:
                tasks = list(daily)
                if i == 5:
                    tasks += saturday_special
                if i == 6:
                    tasks += sunday_extra
            weekly.append({"day": day, "day_idx": i, "tasks": tasks})

    return render(request, "housekeeping/mobile/schedule.html", {
        "user_areas": user_areas,
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
        "weekly": weekly,
        "today_dow": timezone.localdate().weekday(),
        "tag_labels": WORKER_TAG_LABELS,
    })


@hk_required
def hk_attendance(request):
    user = request.user
    user_areas = get_user_areas(user)
    sel_area = selected_area(request, user_areas)

    date_str = request.GET.get("date", "")
    try:
        sel_date = datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        sel_date = timezone.localdate()

    workers = HKWorker.objects.filter(
        area=sel_area, is_active=True, is_reliever=False
    ).order_by("worker_type", "name") if sel_area else HKWorker.objects.none()

    cur_half = current_half()
    is_today = sel_date == timezone.localdate()
    area_param = f"&area={sel_area.id}" if sel_area else ""

    if request.method == "POST":
        action = request.POST.get("action")

        if action == "submit_half":
            half = request.POST.get("half", cur_half)
            HKAttendanceRecord.objects.filter(
                worker__in=workers, date=sel_date, half=half, is_submitted=False
            ).update(is_submitted=True, submitted_at=timezone.now())
            return redirect(f"/housekeeping/attendance/?date={sel_date}{area_param}")

        elif action == "mark":
            half = request.POST.get("half", cur_half)
            worker_id = request.POST.get("worker_id")
            status = request.POST.get("status", "present")
            worker = get_object_or_404(HKWorker, pk=worker_id)
            existing = HKAttendanceRecord.objects.filter(worker=worker, date=sel_date, half=half).first()
            if not (existing and existing.is_submitted):
                att, _ = HKAttendanceRecord.objects.get_or_create(
                    worker=worker, date=sel_date, half=half,
                    defaults={"marked_by": user}
                )
                att.status = status
                att.marked_by = user
                att.save(update_fields=["status", "marked_by"])

            if request.headers.get("HX-Request"):
                sub = HKRelieverSubstitution.objects.filter(
                    original_worker=worker, date=sel_date
                ).select_related("reliever").first()
                all_rel = HKWorker.objects.filter(is_reliever=True, is_active=True).order_by("name")
                return render(request, "housekeeping/mobile/partials/attendance_worker_card.html", {
                    "row": {
                        "worker": worker,
                        "first_att": HKAttendanceRecord.objects.filter(worker=worker, date=sel_date, half="first").first(),
                        "second_att": HKAttendanceRecord.objects.filter(worker=worker, date=sel_date, half="second").first(),
                        "substitution": sub,
                    },
                    "sel_date": sel_date,
                    "sel_area": sel_area,
                    "cur_half": cur_half,
                    "is_today": is_today,
                    "attn_choices": ATTENDANCE_CHOICES,
                    "all_relievers": all_rel,
                })
            return redirect(f"/housekeeping/attendance/?date={sel_date}{area_param}")

    att_map = {(a.worker_id, a.half): a
               for a in HKAttendanceRecord.objects.filter(worker__in=workers, date=sel_date)}

    worker_rows = [{
        "worker": w,
        "first_att": att_map.get((w.id, "first")),
        "second_att": att_map.get((w.id, "second")),
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
        row["substitution"] = subs_today.get(row["worker"].id)

    all_relievers = HKWorker.objects.filter(is_reliever=True, is_active=True).order_by("name")

    # Group by worker type
    type_groups = {}
    for row in worker_rows:
        wt = row["worker"].worker_type
        type_groups.setdefault(wt, []).append(row)

    def all_submitted(half):
        return workers.exists() and all(
            att_map.get((w.id, half)) and att_map[(w.id, half)].is_submitted
            for w in workers
        )

    return render(request, "housekeeping/mobile/attendance.html", {
        "worker_rows": worker_rows,
        "type_groups": type_groups,
        "sel_date": sel_date,
        "sel_area": sel_area,
        "user_areas": user_areas,
        "today": timezone.localdate(),
        "is_today": is_today,
        "cur_half": cur_half,
        "present_first": sum(1 for r in worker_rows if r["first_att"] and r["first_att"].status in ["present", "late"]),
        "present_second": sum(1 for r in worker_rows if r["second_att"] and r["second_att"].status in ["present", "late"]),
        "total_count": len(worker_rows),
        "first_submitted": all_submitted("first"),
        "second_submitted": all_submitted("second"),
        "attn_choices": ATTENDANCE_CHOICES,
        "all_relievers": all_relievers,
        "subs_today": subs_today,
    })


@hk_required
def hk_assign_reliever(request):
    """HTMX POST: assign a reliever to cover an absent worker for today."""
    if request.method != "POST":
        return HttpResponseForbidden()

    user = request.user
    user_areas = get_user_areas(user)
    area_id = request.POST.get("area_id")
    area = user_areas.filter(pk=area_id).first()
    today = timezone.localdate()

    original = get_object_or_404(HKWorker, pk=request.POST.get("original_worker_id"))
    reliever = HKWorker.objects.filter(
        pk=request.POST.get("reliever_id"),
        is_reliever=True,
    ).first()
    if not reliever:
        return HttpResponseBadRequest("Selected worker is not a valid reliever.")

    already_covering = HKRelieverSubstitution.objects.filter(
        reliever=reliever,
        date=today,
    ).exclude(original_worker=original).select_related("original_worker").first()
    if already_covering:
        return HttpResponseBadRequest(
            f"This reliever is already covering {already_covering.original_worker.name} today"
        )

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

    if request.headers.get("HX-Request"):
        sub = HKRelieverSubstitution.objects.filter(original_worker=original, date=today).select_related("reliever").first()
        first_att = HKAttendanceRecord.objects.filter(worker=original, date=today, half="first").first()
        second_att = HKAttendanceRecord.objects.filter(worker=original, date=today, half="second").first()
        all_relievers = HKWorker.objects.filter(is_reliever=True, is_active=True).order_by("name")
        return render(request, "housekeeping/mobile/partials/attendance_worker_card.html", {
            "row": {
                "worker": original,
                "first_att": first_att,
                "second_att": second_att,
                "substitution": sub,
            },
            "sel_date": today,
            "sel_area": area,
            "cur_half": current_half(),
            "is_today": True,
            "attn_choices": ATTENDANCE_CHOICES,
            "all_relievers": all_relievers,
        })

    area_param = f"?area={area.id}&date={today}" if area else f"?date={today}"
    return redirect(f"/housekeeping/attendance/{area_param}")


@hk_required
def hk_sunday_incharge(request):
    if request.method != "POST":
        return redirect("/housekeeping/dashboard/")
    user = request.user
    user_areas = get_user_areas(user)
    today = timezone.localdate()

    area_id = request.POST.get("area_id")
    area = user_areas.filter(pk=area_id).first()
    if not area:
        return redirect("/housekeeping/dashboard/?error=area_required")

    days_until_sunday = (6 - today.weekday()) % 7
    if days_until_sunday == 0:
        return redirect(f"/housekeeping/dashboard/?error=already_sunday&area={area.id}")
    upcoming = today + datetime.timedelta(days=days_until_sunday)

    worker = get_object_or_404(
        HKWorker,
        pk=request.POST.get("worker_id"),
        is_active=True,
        area=area,
    )
    HKSundayIncharge.objects.update_or_create(
        area=area, for_sunday=upcoming,
        defaults={"worker": worker, "set_by": user, "notes": request.POST.get("notes", "")}
    )
    return redirect(f"/housekeeping/dashboard/?area={area_id}")

@hk_required
def hk_stock(request):
    user = request.user
    user_areas = get_user_areas(user)
    sel_area = selected_area(request, user_areas)
    area_stocks = HKAreaStock.objects.filter(area=sel_area).order_by("item_name") if sel_area else []
    my_requests = HKStockRequest.objects.filter(requested_by=user).order_by("-created_at")[:10]
    return render(request, "housekeeping/mobile/stock.html", {
        "area_stocks": area_stocks,
        "low_stocks": [s for s in area_stocks if s.is_low],
        "my_requests": my_requests,
        "user_areas": user_areas,
        "selected_area": sel_area,
        "requested": request.GET.get("requested"),
    })


@hk_required
def hk_stock_request(request):
    from apps.inventory.models import Item, ItemRequest as InvItemRequest

    user = request.user
    user_areas = get_user_areas(user)
    hk_cats = ["Cleaning Supplies", "Housekeeping Supplies", "Consumables",
               "Tools & Equipment", "Garden & Horticulture Equipment"]
    inv_items = Item.objects.filter(category__name__in=hk_cats).select_related("category").order_by("name")

    if request.method == "POST":
        item_name = request.POST.get("item_name", "").strip()
        inv_item = None
        inv_id = request.POST.get("inventory_item_id")
        if inv_id:
            inv_item = Item.objects.filter(pk=inv_id).first()
            if inv_item:
                item_name = inv_item.name

        area_id = request.POST.get("area_id")
        area = user_areas.filter(pk=area_id).first() if area_id else user_areas.first()
        if not item_name:
            return redirect(f"/housekeeping/stock/?error=item_name_required&area={area.id if area else ''}")
        qty = max(1, int(request.POST.get("quantity", 1) or 1))

        hk_req = HKStockRequest.objects.create(
            requested_by=user, area=area,
            item_name=item_name, item=inv_item,
            quantity=qty, unit=request.POST.get("unit", "").strip(),
            reason=request.POST.get("reason", "").strip(),
            is_urgent=request.POST.get("is_urgent") == "on",
        )

        # FIX HK-01: log inventory request creation failures instead of silently swallowing them
        if inv_item:
            try:
                inv_req = InvItemRequest.objects.create(
                    item=inv_item, requested_by=user,
                    quantity_requested=qty,
                    purpose=f"[HK - {area.name if area else 'General'}] {hk_req.reason}",
                    notes=f"Urgent: {'Yes' if hk_req.is_urgent else 'No'}",
                    is_urgent=hk_req.is_urgent,
                )
                hk_req.inventory_request = inv_req
                hk_req.save(update_fields=["inventory_request"])
            except Exception:
                # Log the error so it appears in server logs; the HKStockRequest
                # is saved but inventory_request will be None — ops team can reconcile.
                logger.exception(
                    "Failed to create InvItemRequest for HKStockRequest pk=%s item=%s",
                    hk_req.pk,
                    inv_item.pk,
                )

        return redirect(f"/housekeeping/stock/?requested=1&area={area.id if area else ''}")

    sel_area = selected_area(request, user_areas)
    return render(request, "housekeeping/mobile/stock_request.html", {
        "inv_items": inv_items,
        "user_areas": user_areas,
        "selected_area": sel_area,
        "pre_item": request.GET.get("item", ""),
    })


@hk_required
def hk_profile(request):
    user = request.user
    user_areas = get_user_areas(user)
    success = error = ""
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
    return render(request, "housekeeping/mobile/profile.html", {
        "user": user,
        "user_areas": user_areas,
        "success": success,
        "error": error,
    })


@hk_required
def hk_alerts_manage(request):
    if request.user.role not in ["admin", "housekeeping_manager"]:
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


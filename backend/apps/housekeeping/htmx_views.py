import datetime
import functools
import logging
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from django.contrib.auth import (
    authenticate,
    get_user_model,
    login as auth_login,
    logout as auth_logout,
    update_session_auth_hash,
)
from django.db import models as dm
from django.db import transaction
from django.db.models import Prefetch, Sum, Value, DecimalField
from django.db.models.functions import Coalesce
from django.http import HttpResponseBadRequest, HttpResponseForbidden
from django.shortcuts import get_object_or_404, redirect, render
from django.utils.dateparse import parse_datetime
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
    HKUserArea,
    HKWorker,
    HKWorkerSelectionRequest,
)
from .photo_utils import process_task_photo
from apps.inventory.models import ItemIssue, ItemUsageLog

logger = logging.getLogger(__name__)
UserModel = get_user_model()

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
    if n in {"Academic Common Area", "New AB U-Shape", "New Academy"}:
        return "academic"
    if n.startswith("Academic Block "):
        return "academic"
    if area.area_type == "hostel":
        return "hostels"
    return "others"


def _build_usage_issues(user, limit=None):
    usage_logs_qs = ItemUsageLog.objects.select_related('logged_by').order_by('-logged_at')
    issues_qs = ItemIssue.objects.select_related(
        'request',
        'request__item',
        'request__item__category',
        'request__requested_by',
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
        request__requested_by=user
    ).order_by('-issued_at')

    if limit:
        issues = list(issues_qs[:limit])
    else:
        issues = list(issues_qs)

    for issue in issues:
        total_used = issue.total_consumed or Decimal('0')
        issued_qty = Decimal(issue.issued_quantity)
        remaining = issued_qty - total_used
        issue.remaining_quantity = remaining if remaining > 0 else Decimal('0')
        issue.has_remaining = remaining > 0
        if issued_qty > 0:
            issue.consumption_percent = int(min((total_used / issued_qty) * 100, 100))
        else:
            issue.consumption_percent = 0
    return issues


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
    return list(by_user.values())


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
    if user.role in ["admin", "housekeeping_manager"]:
        return HKArea.objects.filter(is_active=True)
    assigned_area_ids = set(
        HKArea.objects.filter(assigned_users__user=user, is_active=True).values_list("id", flat=True)
    )
    today = timezone.localdate()
    approved_assignments = list(
        HKInchargeAssignment.objects.filter(
            assigned_staff=user,
            status="approved",
            leave_date=today,
        ).select_related("leave_staff")
    )
    temp_incharge_area_ids = set()
    leave_staff_ids_for_all_scope = set()
    for assignment in approved_assignments:
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

    all_ids = assigned_area_ids | temp_incharge_area_ids
    if not all_ids:
        return HKArea.objects.none()

    # Hostel staff should be able to mark the dedicated reliever pool too.
    if HKArea.objects.filter(id__in=all_ids, area_type='hostel', is_active=True).exclude(name='Hostels Reliever').exists():
        reliever_area_id = HKArea.objects.filter(name='Hostels Reliever', is_active=True).values_list('id', flat=True).first()
        if reliever_area_id:
            all_ids.add(reliever_area_id)

    return HKArea.objects.filter(is_active=True, id__in=all_ids)


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
        .exclude(schedule__in=template_list)
        .select_related("schedule", "completed_by", "assigned_worker", "assigned_by", "area")
        .prefetch_related("worker_assignments__worker")
        .order_by("schedule__order", "schedule__start_time")
    )

    return list(active_records) + list(temporary_task_records)


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
    area_workers = list(HKWorker.objects.filter(area=sel_area, is_active=True).order_by("name")) if sel_area else []

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
        "user_areas": user_areas,
        "selected_area": sel_area,
        "records": records,
        "grouped": grouped,
        "tag_labels": WORKER_TAG_LABELS,
        "total_tasks": total,
        "done_tasks": done,
        "percent_done": pct,
        "alerts": get_active_alerts(user, user_areas),
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
@require_POST
def hk_incharge_assign(request):
    user = request.user
    user_areas = get_user_areas(user)
    area = selected_area(request, user_areas)

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
    area = selected_area(request, user_areas)

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
            role__in=["admin", "housekeeping_manager"],
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
    today = timezone.localdate()
    record_date = record.date
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
        record.photo_after_thumbnail = None
        record.photo_after_captured_at = None
        record.photo_after_capture_method = ""
        record.photo_after_original_size = 0
        record.photo_after_saved_size = 0
        record.photo_after_thumb_size = 0
        record.photo_after_compression_ratio = 0
        record.photo_after_format = ""
        record.save(update_fields=[
            "status", "started_at", "completed_by", "completed_at", "photo_after",
            "photo_after_thumbnail",
            "photo_after_captured_at", "photo_after_capture_method",
            "photo_after_original_size", "photo_after_saved_size", "photo_after_thumb_size",
            "photo_after_compression_ratio", "photo_after_format",
        ])

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

    sel_date = timezone.localdate()

    workers = HKWorker.objects.filter(
        area=sel_area, is_active=True
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
def hk_stock(request):
    user = request.user
    user_areas = get_user_areas(user)
    sel_area = selected_area(request, user_areas)
    area_stocks = HKAreaStock.objects.filter(area=sel_area).order_by("item_name") if sel_area else []
    issued_items = _build_usage_issues(user, limit=10)
    return render(request, "housekeeping/mobile/stock.html", {
        "area_stocks": area_stocks,
        "low_stocks": [s for s in area_stocks if s.is_low],
        "issued_items": issued_items,
        "user_areas": user_areas,
        "selected_area": sel_area,
        "requested": request.GET.get("requested"),
    })


@hk_required
def hk_log_usage(request, pk):
    if request.method != "POST":
        return redirect("/housekeeping/stock/")

    user = request.user
    issue = get_object_or_404(
        ItemIssue.objects.select_related(
            'request', 'request__item', 'request__requested_by'
        ),
        pk=pk,
        request__requested_by=user,
    )

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
        area_id = request.POST.get("area_id") or ""
        if area_id:
            return redirect(f"/housekeeping/stock/?area={area_id}")
        return redirect("/housekeeping/stock/")

    user_areas = get_user_areas(user)
    sel_area = selected_area(request, user_areas)
    area_stocks = HKAreaStock.objects.filter(area=sel_area).order_by("item_name") if sel_area else []
    my_requests = HKStockRequest.objects.filter(requested_by=user).order_by("-created_at")[:10]
    issued_items = _build_usage_issues(user, limit=10)
    return render(request, "housekeeping/mobile/stock.html", {
        "area_stocks": area_stocks,
        "low_stocks": [s for s in area_stocks if s.is_low],
        "my_requests": my_requests,
        "issued_items": issued_items,
        "user_areas": user_areas,
        "selected_area": sel_area,
        "requested": request.GET.get("requested"),
        "form_error": error,
        "error_issue_id": issue.id,
        "open_form_issue_id": issue.id,
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
                area = user_areas.first()
            else:
                area = user_areas.filter(pk=area_id).first() if area_id else selected_area(request, user_areas)
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
        "user_areas": user_areas,
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


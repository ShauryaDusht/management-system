import datetime

from django.contrib.auth.decorators import login_required
from django.db.models import Q
from django.http import HttpResponse, HttpResponseForbidden
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone

from .models import (
    HKAttendance,
    HKCaretaker,
    HKComplaint,
    HKDailyTask,
    HKDepartment,
    HKExtraWork,
    HKLocation,
    HKSupervisor,
    HKTaskTemplate,
    HKWorker,
)


def get_user_role(user):
    return getattr(user, 'role', '')


def is_admin_manager(user):
    return get_user_role(user) in ['admin', 'manager']


def is_supervisor(user):
    return get_user_role(user) == 'supervisor'


def is_caretaker(user):
    return get_user_role(user) == 'caretaker'


def get_supervisor_for_user(user):
    supervisor = HKSupervisor.objects.filter(user=user).first()
    if supervisor:
        return supervisor

    full_name = (user.get_full_name() or '').strip()
    if full_name:
        return HKSupervisor.objects.filter(name__iexact=full_name).first()
    return HKSupervisor.objects.filter(name__iexact=user.username).first()


def get_caretaker_for_user(user):
    caretaker = HKCaretaker.objects.filter(user=user).first()
    if caretaker:
        return caretaker

    full_name = (user.get_full_name() or '').strip()
    if full_name:
        return HKCaretaker.objects.filter(name__iexact=full_name).first()
    return HKCaretaker.objects.filter(name__iexact=user.username).first()


def worker_scope_for_user(user):
    if is_admin_manager(user):
        return HKWorker.objects.filter(is_active=True)

    if is_supervisor(user):
        supervisor = get_supervisor_for_user(user)
        if not supervisor:
            return HKWorker.objects.none()
        return HKWorker.objects.filter(
            Q(supervisor=supervisor) | Q(department__in=supervisor.departments.all()),
            is_active=True,
        ).distinct()

    if is_caretaker(user):
        caretaker = get_caretaker_for_user(user)
        if not caretaker:
            return HKWorker.objects.none()
        return HKWorker.objects.filter(
            Q(caretaker=caretaker) | Q(location__in=caretaker.locations.all()),
            is_active=True,
        ).distinct()

    return HKWorker.objects.none()


def complaint_scope_for_user(user):
    if is_admin_manager(user):
        return HKComplaint.objects.all()

    if is_supervisor(user):
        supervisor = get_supervisor_for_user(user)
        if not supervisor:
            return HKComplaint.objects.none()
        return HKComplaint.objects.filter(
            Q(location__department__in=supervisor.departments.all()) |
            Q(assigned_to__supervisor=supervisor)
        ).distinct()

    if is_caretaker(user):
        caretaker = get_caretaker_for_user(user)
        if not caretaker:
            return HKComplaint.objects.none()
        return HKComplaint.objects.filter(
            Q(location__in=caretaker.locations.all()) |
            Q(assigned_to__caretaker=caretaker)
        ).distinct()

    return HKComplaint.objects.filter(raised_by=user)


def frequency_matches(template, date):
    frequency = template.frequency
    if frequency in ['daily', 'twice_daily']:
        return True
    if frequency == 'alternate_day':
        return date.toordinal() % 2 == 0
    if frequency == 'weekly':
        return date.weekday() == 0
    if frequency == 'fortnightly':
        return date.day in [1, 15]
    if frequency == 'monthly':
        return date.day == 1
    if frequency == 'quarterly':
        return date.day == 1 and date.month in [1, 4, 7, 10]
    return False


def generate_daily_tasks_for_worker(worker, date):
    templates = HKTaskTemplate.objects.filter(
        is_active=True,
        department=worker.department,
    ).filter(
        Q(location__isnull=True) | Q(location=worker.location)
    )

    if worker.worker_type:
        templates = templates.filter(Q(worker_type='') | Q(worker_type=worker.worker_type))
    if worker.shift:
        templates = templates.filter(Q(shift='') | Q(shift=worker.shift))

    created_count = 0
    for template in templates.order_by('order', 'start_time'):
        if not frequency_matches(template, date):
            continue

        _, created = HKDailyTask.objects.get_or_create(
            worker=worker,
            template=template,
            date=date,
            task_name=template.name,
            start_time=template.start_time,
            end_time=template.end_time,
            defaults={
                'area': template.area,
                'description': template.description,
                'status': 'pending',
                'order': template.order,
            },
        )
        if created:
            created_count += 1

    return created_count


def find_worker_for_logged_user(user):
    if getattr(user, 'phone', ''):
        worker = HKWorker.objects.filter(phone=user.phone, is_active=True).first()
        if worker:
            return worker

    full_name = (user.get_full_name() or '').strip()
    if full_name:
        worker = HKWorker.objects.filter(name__iexact=full_name, is_active=True).first()
        if worker:
            return worker

    return HKWorker.objects.filter(name__iexact=user.username, is_active=True).first()


@login_required
def hk_dashboard(request):
    user = request.user
    role = get_user_role(user)
    today = timezone.localdate()

    workers_qs = worker_scope_for_user(user) if not is_admin_manager(user) else HKWorker.objects.filter(is_active=True)
    if is_admin_manager(user):
        workers_qs = HKWorker.objects.filter(is_active=True)

    workers = workers_qs.select_related('department', 'location', 'caretaker', 'supervisor')
    total_workers = workers.count()
    present_today = HKAttendance.objects.filter(
        worker__in=workers,
        date=today,
        status__in=['present', 'late', 'half_day'],
    ).count()

    tasks_today_qs = HKDailyTask.objects.filter(worker__in=workers, date=today)
    total_tasks_today = tasks_today_qs.count()
    completed_tasks = tasks_today_qs.filter(status__in=['done', 'verified']).count()
    tasks_done_percent = int((completed_tasks / total_tasks_today) * 100) if total_tasks_today else 0

    open_complaints = complaint_scope_for_user(user).filter(status__in=['open', 'in_progress']).count()

    departments_scope = HKDepartment.objects.filter(is_active=True)
    if is_supervisor(user):
        supervisor = get_supervisor_for_user(user)
        departments_scope = supervisor.departments.all() if supervisor else HKDepartment.objects.none()
    elif is_caretaker(user):
        caretaker = get_caretaker_for_user(user)
        if caretaker:
            departments_scope = HKDepartment.objects.filter(locations__in=caretaker.locations.all()).distinct()
        else:
            departments_scope = HKDepartment.objects.none()

    department_cards = []
    for department in departments_scope:
        dept_workers = workers.filter(department=department)
        dept_total = dept_workers.count()
        dept_present = HKAttendance.objects.filter(
            worker__in=dept_workers,
            date=today,
            status__in=['present', 'late', 'half_day'],
        ).count()
        dept_tasks = HKDailyTask.objects.filter(worker__in=dept_workers, date=today)
        dept_task_total = dept_tasks.count()
        dept_task_done = dept_tasks.filter(status__in=['done', 'verified']).count()
        completion = int((dept_task_done / dept_task_total) * 100) if dept_task_total else 0
        if completion > 80:
            completion_color = 'green'
        elif completion >= 50:
            completion_color = 'orange'
        else:
            completion_color = 'red'
        department_cards.append({
            'department': department,
            'workers_total': dept_total,
            'workers_present': dept_present,
            'tasks_total': dept_task_total,
            'tasks_done': dept_task_done,
            'completion': completion,
            'completion_color': completion_color,
        })

    recent_complaints = complaint_scope_for_user(user).order_by('-created_at')[:5]
    recent_activity = HKDailyTask.objects.filter(
        worker__in=workers,
        date=today,
        completed_at__isnull=False,
    ).order_by('-completed_at')[:5]

    caretaker = get_caretaker_for_user(user) if is_caretaker(user) else None
    supervisor = get_supervisor_for_user(user) if is_supervisor(user) else None

    context = {
        'role': role,
        'today': today,
        'total_workers': total_workers,
        'present_today': present_today,
        'tasks_done_percent': tasks_done_percent,
        'open_complaints': open_complaints,
        'department_cards': department_cards,
        'recent_complaints': recent_complaints,
        'recent_activity': recent_activity,
        'supervisor_obj': supervisor,
        'caretaker_obj': caretaker,
        'location_name': caretaker.locations.first().name if caretaker and caretaker.locations.exists() else '',
    }
    return render(request, 'housekeeping/mobile/dashboard.html', context)


@login_required
def hk_attendance(request):
    user = request.user
    role = get_user_role(user)
    if role not in ['admin', 'manager', 'supervisor', 'caretaker']:
        return HttpResponseForbidden('Permission denied')

    workers = worker_scope_for_user(user).select_related('department', 'location', 'caretaker', 'supervisor').order_by('name')
    date_str = request.GET.get('date', '')
    selected_date = timezone.localdate()
    if date_str:
        try:
            selected_date = datetime.datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            selected_date = timezone.localdate()

    if request.method == 'POST':
        worker = get_object_or_404(HKWorker, pk=request.POST.get('worker_id'))
        if worker not in workers:
            return HttpResponseForbidden('Not allowed for this worker')

        status = request.POST.get('status', 'present')
        note = request.POST.get('note', '')
        attendance, _ = HKAttendance.objects.get_or_create(
            worker=worker,
            date=selected_date,
            defaults={
                'status': status,
                'note': note,
                'marked_by': user,
            },
        )
        attendance.status = status
        attendance.note = note
        attendance.marked_by = user
        attendance.save(update_fields=['status', 'note', 'marked_by'])

        if request.headers.get('HX-Request'):
            badge_color = {
                'present': '#16a34a',
                'absent': '#dc2626',
                'half_day': '#f59e0b',
                'late': '#d97706',
                'leave': '#2563eb',
            }.get(attendance.status, '#6b7280')
            html = f"""
            <div class=\"worker-status-wrap\" id=\"worker-card-{worker.id}\">
              <div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:8px\">
                <div style=\"font-weight:700;color:#1f2937\">{worker.name}</div>
                <span style=\"background:{badge_color};color:white;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase\">{attendance.status}</span>
              </div>
              <div style=\"font-size:12px;color:#6b7280\">Marked for {selected_date}</div>
            </div>
            """
            return HttpResponse(html)
        return redirect('hk_attendance')

    attendance_map = {
        a.worker_id: a
        for a in HKAttendance.objects.filter(worker__in=workers, date=selected_date)
    }
    for worker in workers:
        attendance = attendance_map.get(worker.id)
        worker.today_attendance = attendance
        worker.attendance_status = attendance.status if attendance else 'pending'

    present_count = sum(1 for worker in workers if worker.attendance_status in ['present', 'late', 'half_day'])
    absent_count = sum(1 for worker in workers if worker.attendance_status == 'absent')
    late_count = sum(1 for worker in workers if worker.attendance_status == 'late')

    return render(request, 'housekeeping/mobile/attendance.html', {
        'workers': workers,
        'selected_date': selected_date,
        'present_count': present_count,
        'absent_count': absent_count,
        'late_count': late_count,
        'total_count': workers.count(),
    })


@login_required
def hk_attendance_history(request):
    user = request.user
    workers = worker_scope_for_user(user).order_by('name')
    worker_id = request.GET.get('worker')
    date_from = request.GET.get('date_from')
    date_to = request.GET.get('date_to')

    end_date = timezone.localdate()
    start_date = end_date - datetime.timedelta(days=30)
    if date_from:
        try:
            start_date = datetime.datetime.strptime(date_from, '%Y-%m-%d').date()
        except ValueError:
            pass
    if date_to:
        try:
            end_date = datetime.datetime.strptime(date_to, '%Y-%m-%d').date()
        except ValueError:
            pass

    attendances = HKAttendance.objects.filter(
        worker__in=workers,
        date__gte=start_date,
        date__lte=end_date,
    ).select_related('worker').order_by('-date', 'worker__name')

    if worker_id:
        attendances = attendances.filter(worker_id=worker_id)

    summary = {
        'present': attendances.filter(status='present').count(),
        'absent': attendances.filter(status='absent').count(),
        'late': attendances.filter(status='late').count(),
        'half_day': attendances.filter(status='half_day').count(),
        'leave': attendances.filter(status='leave').count(),
    }

    return render(request, 'housekeeping/mobile/attendance_history.html', {
        'workers': workers,
        'attendances': attendances,
        'summary': summary,
        'date_from': start_date,
        'date_to': end_date,
        'selected_worker': worker_id,
    })


@login_required
def hk_my_tasks(request):
    user = request.user
    today = timezone.localdate()
    worker = find_worker_for_logged_user(user)

    if not worker:
        scope = worker_scope_for_user(user)
        worker = scope.first() if scope.exists() else None

    if not worker:
        return render(request, 'housekeeping/mobile/my_tasks.html', {
            'error': 'No worker profile mapped for this account.',
            'tasks': [],
            'pending_tasks': [],
            'in_progress_tasks': [],
            'done_tasks': [],
            'completion_percent': 0,
            'worker': None,
        })

    if not HKDailyTask.objects.filter(worker=worker, date=today).exists():
        generate_daily_tasks_for_worker(worker, today)

    tasks = HKDailyTask.objects.filter(worker=worker, date=today).order_by('order', 'start_time')
    pending_tasks = tasks.filter(status='pending')
    in_progress_tasks = tasks.filter(status='in_progress')
    done_tasks = tasks.filter(status__in=['done', 'verified'])
    total = tasks.count()
    done_count = done_tasks.count()
    completion_percent = int((done_count / total) * 100) if total else 0
    extra_works = HKExtraWork.objects.filter(worker=worker, date=today).order_by('-created_at')

    return render(request, 'housekeeping/mobile/my_tasks.html', {
        'worker': worker,
        'tasks': tasks,
        'pending_tasks': pending_tasks,
        'in_progress_tasks': in_progress_tasks,
        'done_tasks': done_tasks,
        'done_count': done_count,
        'total_count': total,
        'completion_percent': completion_percent,
        'extra_works': extra_works,
        'today': today,
    })


@login_required
def hk_mark_task_done(request, task_id):
    task = get_object_or_404(HKDailyTask, pk=task_id)
    user = request.user
    role = get_user_role(user)
    logged_worker = find_worker_for_logged_user(user)
    if role not in ['admin', 'manager', 'supervisor', 'caretaker'] and (not logged_worker or logged_worker.id != task.worker_id):
        return HttpResponseForbidden('Permission denied')

    if request.method == 'POST':
        task.status = 'done'
        task.completed_at = timezone.now()
        task.completed_note = request.POST.get('completed_note', '')
        task.save(update_fields=['status', 'completed_at', 'completed_note'])

        if request.headers.get('HX-Request'):
            start = task.start_time.strftime('%I:%M %p') if task.start_time else '--'
            end = task.end_time.strftime('%I:%M %p') if task.end_time else '--'
            completed_at = task.completed_at.strftime('%I:%M %p') if task.completed_at else ''
            html = f"""
            <div class=\"card\" id=\"task-card-{task.id}\" style=\"border:2px solid #52b788;\">
              <div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:8px\">
                <div style=\"font-weight:700;color:#2d6a4f\">✅ {start} - {end}</div>
                <span style=\"font-size:12px;color:#065f46\">Done at {completed_at}</span>
              </div>
              <div style=\"font-weight:600\">{task.task_name}</div>
              <div style=\"font-size:12px;color:#666;margin-top:4px\">📍 {task.area or '-'}</div>
            </div>
            """
            return HttpResponse(html)

    worker_tasks_url = request.POST.get('redirect_to_worker')
    if worker_tasks_url:
        return redirect(worker_tasks_url)
    return redirect('hk_my_tasks')


@login_required
def hk_worker_tasks(request):
    user = request.user
    workers = worker_scope_for_user(user).select_related('location', 'department').order_by('name')
    today = timezone.localdate()

    worker_cards = []
    for worker in workers:
        if not HKDailyTask.objects.filter(worker=worker, date=today).exists():
            generate_daily_tasks_for_worker(worker, today)
        total = HKDailyTask.objects.filter(worker=worker, date=today).count()
        done = HKDailyTask.objects.filter(worker=worker, date=today, status__in=['done', 'verified']).count()
        percent = int((done / total) * 100) if total else 0
        attendance = HKAttendance.objects.filter(worker=worker, date=today).first()
        status = attendance.status if attendance else 'pending'
        if percent > 80:
            color = 'green'
        elif percent >= 50:
            color = 'orange'
        else:
            color = 'red'
        worker_cards.append({
            'worker': worker,
            'total': total,
            'done': done,
            'pending': max(total - done, 0),
            'percent': percent,
            'color': color,
            'attendance_status': status,
        })

    return render(request, 'housekeeping/mobile/worker_tasks.html', {
        'worker_cards': worker_cards,
        'today': today,
    })


@login_required
def hk_worker_task_detail(request, worker_id):
    user = request.user
    worker = get_object_or_404(HKWorker, pk=worker_id)
    if worker not in worker_scope_for_user(user):
        return HttpResponseForbidden('Permission denied')

    today = timezone.localdate()
    if request.method == 'POST':
        action = request.POST.get('action')
        if action == 'verify':
            task = get_object_or_404(HKDailyTask, pk=request.POST.get('task_id'), worker=worker, date=today)
            task.status = 'verified'
            task.verified_by = user
            task.verified_at = timezone.now()
            task.save(update_fields=['status', 'verified_by', 'verified_at'])
        elif action == 'add_extra':
            HKExtraWork.objects.create(
                worker=worker,
                assigned_by=user,
                task_name=request.POST.get('task_name', '').strip(),
                description=request.POST.get('description', '').strip(),
                date=today,
            )

    if not HKDailyTask.objects.filter(worker=worker, date=today).exists():
        generate_daily_tasks_for_worker(worker, today)

    tasks = HKDailyTask.objects.filter(worker=worker, date=today).order_by('order', 'start_time')
    total = tasks.count()
    done = tasks.filter(status__in=['done', 'verified']).count()
    percent = int((done / total) * 100) if total else 0
    attendance = HKAttendance.objects.filter(worker=worker, date=today).first()
    extra_works = HKExtraWork.objects.filter(worker=worker, date=today).order_by('-created_at')

    return render(request, 'housekeeping/mobile/task_detail.html', {
        'worker': worker,
        'tasks': tasks,
        'attendance': attendance,
        'total_count': total,
        'done_count': done,
        'completion_percent': percent,
        'extra_works': extra_works,
        'today': today,
        'can_verify': get_user_role(user) in ['admin', 'manager', 'supervisor'],
    })


@login_required
def hk_add_extra_work(request):
    if request.method != 'POST':
        return redirect('hk_worker_tasks')

    user = request.user
    worker = get_object_or_404(HKWorker, pk=request.POST.get('worker_id'))
    if worker not in worker_scope_for_user(user):
        return HttpResponseForbidden('Permission denied')

    HKExtraWork.objects.get_or_create(
        worker=worker,
        date=timezone.localdate(),
        task_name=request.POST.get('task_name', '').strip(),
        defaults={
            'description': request.POST.get('description', '').strip(),
            'assigned_by': user,
            'is_done': False,
        },
    )
    return redirect('hk_worker_task_detail', worker_id=worker.id)


@login_required
def hk_generate_daily_tasks(request):
    if request.method != 'POST':
        return redirect('hk_dashboard')

    user = request.user
    if get_user_role(user) not in ['admin', 'manager', 'supervisor']:
        return HttpResponseForbidden('Permission denied')

    today = timezone.localdate()
    workers = worker_scope_for_user(user) if not is_admin_manager(user) else HKWorker.objects.filter(is_active=True)
    generated_count = 0

    for worker in workers:
        attendance = HKAttendance.objects.filter(worker=worker, date=today).first()
        if attendance and attendance.status in ['absent', 'leave']:
            continue
        generated_count += generate_daily_tasks_for_worker(worker, today)

    if request.headers.get('HX-Request'):
        return HttpResponse(f'<div class="card" style="border:1px solid #52b788;color:#2d6a4f;">Generated {generated_count} tasks for today.</div>')
    return redirect('hk_dashboard')


@login_required
def hk_complaints(request):
    complaints = complaint_scope_for_user(request.user).select_related('location', 'assigned_to').order_by('-created_at')
    status_filter = request.GET.get('status', 'all')
    priority_filter = request.GET.get('priority', 'all')
    if status_filter != 'all':
        complaints = complaints.filter(status=status_filter)
    if priority_filter != 'all':
        complaints = complaints.filter(priority=priority_filter)

    return render(request, 'housekeeping/mobile/complaints.html', {
        'complaints': complaints,
        'status_filter': status_filter,
        'priority_filter': priority_filter,
    })


@login_required
def hk_add_complaint(request):
    user = request.user
    locations = HKLocation.objects.filter(is_active=True).select_related('department').order_by('department__name', 'name')
    workers = worker_scope_for_user(user).order_by('name')

    if request.method == 'POST':
        location = HKLocation.objects.filter(pk=request.POST.get('location')).first()
        assigned_to = HKWorker.objects.filter(pk=request.POST.get('assigned_to')).first()
        HKComplaint.objects.create(
            title=request.POST.get('title', '').strip(),
            description=request.POST.get('description', '').strip(),
            location=location,
            raised_by=user,
            assigned_to=assigned_to,
            priority=request.POST.get('priority', 'medium'),
            status='open',
        )
        return redirect('hk_complaints')

    return render(request, 'housekeeping/mobile/add_complaint.html', {
        'locations': locations,
        'workers': workers,
    })


@login_required
def hk_complaint_detail(request, complaint_id):
    complaint = get_object_or_404(HKComplaint.objects.select_related('location', 'assigned_to', 'raised_by'), pk=complaint_id)
    if complaint not in complaint_scope_for_user(request.user):
        return HttpResponseForbidden('Permission denied')

    workers = worker_scope_for_user(request.user).order_by('name')

    if request.method == 'POST' and get_user_role(request.user) in ['admin', 'manager', 'supervisor']:
        new_status = request.POST.get('status', complaint.status)
        complaint.status = new_status
        complaint.priority = request.POST.get('priority', complaint.priority)
        assigned_to = HKWorker.objects.filter(pk=request.POST.get('assigned_to')).first()
        complaint.assigned_to = assigned_to
        if new_status in ['resolved', 'closed'] and not complaint.resolved_at:
            complaint.resolved_at = timezone.now()
        complaint.save()
        return redirect('hk_complaint_detail', complaint_id=complaint.id)

    return render(request, 'housekeeping/mobile/complaint_detail.html', {
        'complaint': complaint,
        'workers': workers,
    })


@login_required
def hk_reports(request):
    user = request.user
    workers = worker_scope_for_user(user)
    tab = request.GET.get('tab', 'daily')
    today = timezone.localdate()
    date_str = request.GET.get('date', '')
    report_date = today
    if date_str:
        try:
            report_date = datetime.datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            report_date = today

    # Daily tab
    tasks_qs = HKDailyTask.objects.filter(worker__in=workers, date=report_date)
    done_qs = tasks_qs.filter(status__in=['done', 'verified'])
    attendance_qs = HKAttendance.objects.filter(worker__in=workers, date=report_date)
    complaints_open = complaint_scope_for_user(user).filter(status__in=['open', 'in_progress'])

    total_tasks = tasks_qs.count()
    completed_tasks = done_qs.count()
    attendance_total = workers.count()
    attendance_present = attendance_qs.filter(status__in=['present', 'late', 'half_day']).count()
    attendance_percent = int((attendance_present / attendance_total) * 100) if attendance_total else 0
    task_percent = int((completed_tasks / total_tasks) * 100) if total_tasks else 0

    department_cards = []
    for department in HKDepartment.objects.filter(workers__in=workers).distinct():
        dept_workers = workers.filter(department=department)
        dept_tasks = HKDailyTask.objects.filter(worker__in=dept_workers, date=report_date)
        dept_done = dept_tasks.filter(status__in=['done', 'verified']).count()
        dept_total = dept_tasks.count()
        dept_percent = int((dept_done / dept_total) * 100) if dept_total else 0
        department_cards.append({
            'name': department.name,
            'done': dept_done,
            'total': dept_total,
            'percent': dept_percent,
        })

    # Attendance tab
    date_from = request.GET.get('date_from')
    date_to = request.GET.get('date_to')
    range_end = report_date
    range_start = range_end - datetime.timedelta(days=6)
    if date_from:
        try:
            range_start = datetime.datetime.strptime(date_from, '%Y-%m-%d').date()
        except ValueError:
            pass
    if date_to:
        try:
            range_end = datetime.datetime.strptime(date_to, '%Y-%m-%d').date()
        except ValueError:
            pass
    if range_end < range_start:
        range_start, range_end = range_end, range_start

    days = []
    day = range_start
    while day <= range_end:
        days.append(day)
        day += datetime.timedelta(days=1)

    attendance_records = HKAttendance.objects.filter(
        worker__in=workers,
        date__gte=range_start,
        date__lte=range_end,
    )
    attendance_map = {(a.worker_id, a.date): a.status for a in attendance_records}
    attendance_grid = []
    for worker in workers.order_by('name'):
        status_row = [attendance_map.get((worker.id, day), '-') for day in days]
        attendance_grid.append({'worker': worker, 'statuses': status_row})

    # Performance tab
    period = request.GET.get('period', 'week')
    perf_end = report_date
    perf_start = perf_end - datetime.timedelta(days=6 if period == 'week' else 29)
    performance_rows = []
    for worker in workers.order_by('name'):
        worker_tasks = HKDailyTask.objects.filter(worker=worker, date__gte=perf_start, date__lte=perf_end)
        worker_done = worker_tasks.filter(status__in=['done', 'verified']).count()
        worker_total = worker_tasks.count()
        worker_percent = int((worker_done / worker_total) * 100) if worker_total else 0

        worker_att = HKAttendance.objects.filter(worker=worker, date__gte=perf_start, date__lte=perf_end)
        present_days = worker_att.filter(status__in=['present', 'late', 'half_day']).count()
        late_days = worker_att.filter(status='late').count()
        performance_rows.append({
            'worker': worker,
            'avg_completion': worker_percent,
            'present_days': present_days,
            'late_days': late_days,
        })

    return render(request, 'housekeeping/mobile/reports.html', {
        'tab': tab,
        'report_date': report_date,
        'total_tasks': total_tasks,
        'completed_tasks': completed_tasks,
        'task_percent': task_percent,
        'attendance_percent': attendance_percent,
        'open_issues': complaints_open.count(),
        'department_cards': department_cards,
        'days': days,
        'attendance_grid': attendance_grid,
        'date_from': range_start,
        'date_to': range_end,
        'period': period,
        'performance_rows': performance_rows,
    })

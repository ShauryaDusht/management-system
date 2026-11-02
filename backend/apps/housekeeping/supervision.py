"""Keeps HKWorker.supervisor consistent with who is actually assigned to the worker's area."""
from django.db.models import Exists, OuterRef

from .models import HKUserArea, HKWorker

SUPERVISION_ROLES = ('supervisor', 'caretaker')


def other_area_supervisor_id(area_id, exclude_user_id=None):
    """Id of the first active supervisor/caretaker assigned to the area (other than exclude_user_id)."""
    links = HKUserArea.objects.filter(
        area_id=area_id,
        user__is_active=True,
        user__role__in=SUPERVISION_ROLES,
    )
    if exclude_user_id is not None:
        links = links.exclude(user_id=exclude_user_id)
    link = links.order_by('id').first()
    return link.user_id if link else None


def release_workers_from_supervisor(user, area_ids):
    """`user` is no longer assigned to `area_ids`: hand their workers there to another assignee of the
    same area, or leave them without a supervisor, rather than keep pointing at someone who left."""
    released = 0
    for area_id in set(area_ids):
        replacement_id = other_area_supervisor_id(area_id, exclude_user_id=user.id)
        released += HKWorker.objects.filter(area_id=area_id, supervisor=user).update(supervisor_id=replacement_id)
    return released


def stale_supervisor_workers():
    """Workers whose supervisor is no longer assigned to the worker's own area.

    Relievers are left out: they sit in a shared pool area (e.g. "Hostels Reliever") that their
    supervisor is deliberately not linked to, so "not assigned to the area" says nothing about them.
    """
    assigned = HKUserArea.objects.filter(user_id=OuterRef('supervisor_id'), area_id=OuterRef('area_id'))
    return (
        HKWorker.objects
        .filter(area__isnull=False, supervisor__isnull=False, is_reliever=False)
        .annotate(supervisor_is_assigned=Exists(assigned))
        .filter(supervisor_is_assigned=False)
    )

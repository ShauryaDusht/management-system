from datetime import timedelta
from django.shortcuts import render, redirect, get_object_or_404
from django.utils import timezone
from django.http import JsonResponse, HttpResponseRedirect
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import SessionAuthentication
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.core.models import Notification, get_notification_retention_days
from apps.core.serializers import NotificationSerializer


class CsrfExemptSessionAuthentication(SessionAuthentication):
    def enforce_csrf(self, request):
        return  # Allow API requests with session cookie even without manual csrf token for simple mobile requests


class NotificationListAPIView(APIView):
    authentication_classes = [JWTAuthentication, CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        # 1. Permanently purge any expired notifications from the database
        Notification.delete_expired_notifications(user=user)

        # 2. Build active queryset
        base_qs = Notification.objects.filter(user=user)

        # 3. Handle category filtering
        category_param = request.GET.get('category') or request.GET.get('type')
        filtered_qs = base_qs
        if category_param:
            cat_upper = str(category_param).strip().upper()
            if cat_upper in (Notification.Category.IMPORTANT, Notification.Category.ROUTINE):
                filtered_qs = filtered_qs.filter(category=cat_upper)
            elif cat_upper in ('ALL', 'ANY'):
                filtered_qs = base_qs
            else:
                # Support filtering by legacy notification_type if matching
                filtered_qs = filtered_qs.filter(notification_type=category_param.strip().lower())

        # 4. Compute unread counts on active notifications
        active_unread_qs = Notification.objects.filter(user=user, is_read=False)
        unread_count = active_unread_qs.count()
        important_unread_count = active_unread_qs.filter(category=Notification.Category.IMPORTANT).count()
        routine_unread_count = active_unread_qs.filter(category=Notification.Category.ROUTINE).count()

        limit = request.GET.get('limit', 50)
        try:
            limit = min(int(limit), 100)
        except (ValueError, TypeError):
            limit = 50

        notifications = filtered_qs.order_by('-created_at')[:limit]
        serializer = NotificationSerializer(notifications, many=True)

        return Response({
            'unread_count': unread_count,
            'important_unread_count': important_unread_count,
            'routine_unread_count': routine_unread_count,
            'notifications': serializer.data,
        })


class NotificationMarkReadAPIView(APIView):
    authentication_classes = [JWTAuthentication, CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        user = request.user
        notification = get_object_or_404(Notification, pk=pk, user=user)

        # Update read status and recalculate expires_at based on classification
        notification.mark_read(save=True)

        # Ensure expired notifications are purged from database and unread count
        Notification.delete_expired_notifications(user=user)
        unread_count = Notification.objects.filter(user=user, is_read=False).count()

        return Response({
            'success': True,
            'id': notification.id,
            'unread_count': unread_count,
            'expires_at': notification.expires_at,
            'category': notification.category,
        })


class NotificationMarkAllReadAPIView(APIView):
    authentication_classes = [JWTAuthentication, CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        now = timezone.now()
        retention = get_notification_retention_days()

        # Mark all active unread notifications as read and recalculate expiry
        unread_notifs = Notification.objects.filter(user=user, is_read=False)
        for notif in unread_notifs:
            notif.is_read = True
            notif.read_at = now
            if notif.category == Notification.Category.IMPORTANT:
                notif.expires_at = now + timedelta(days=retention['important_read'])
            else:
                notif.expires_at = now + timedelta(days=retention['routine_read'])
            notif.save(update_fields=['is_read', 'read_at', 'expires_at', 'updated_at'])

        return Response({
            'success': True,
            'unread_count': 0,
        })


def portal_notifications_page(request):
    """
    Renders full-page notification view for mobile Staff Portal with classification and filters.
    """
    if not request.user.is_authenticated:
        return redirect('/portal/login/')

    user = request.user

    # Real-time permanent deletion of expired notifications
    Notification.delete_expired_notifications(user=user)

    active_qs = Notification.objects.filter(user=user).order_by('-created_at')
    unread_count = active_qs.filter(is_read=False).count()
    important_count = active_qs.filter(category=Notification.Category.IMPORTANT).count()
    routine_count = active_qs.filter(category=Notification.Category.ROUTINE).count()
    all_count = active_qs.count()

    # Category filter
    category_filter = request.GET.get('category', 'all').strip().lower()
    if category_filter == 'important':
        notifications_list = active_qs.filter(category=Notification.Category.IMPORTANT)[:100]
    elif category_filter == 'routine':
        notifications_list = active_qs.filter(category=Notification.Category.ROUTINE)[:100]
    else:
        category_filter = 'all'
        notifications_list = active_qs[:100]

    # Resolve return/back URL
    back_url = '/housekeeping/dashboard/'
    if getattr(user, 'role', '') == 'horticulture_manager' or (
        getattr(user, 'role', '') == 'supervisor'
        and hasattr(user, 'horticulture_supervised_zones')
        and user.horticulture_supervised_zones.exists()
        and not getattr(user, 'hk_areas', None)
    ):
        back_url = '/horticulture/dashboard/'

    return render(request, 'core/notifications.html', {
        'notifications': notifications_list,
        'unread_count': unread_count,
        'important_count': important_count,
        'routine_count': routine_count,
        'all_count': all_count,
        'category_filter': category_filter,
        'back_url': back_url,
    })

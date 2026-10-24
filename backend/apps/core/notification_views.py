from django.shortcuts import render, redirect, get_object_or_404
from django.utils import timezone
from django.http import JsonResponse, HttpResponseRedirect
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import SessionAuthentication
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.core.models import Notification
from apps.core.serializers import NotificationSerializer


class CsrfExemptSessionAuthentication(SessionAuthentication):
    def enforce_csrf(self, request):
        return  # Allow API requests with session cookie even without manual csrf token for simple mobile requests


class NotificationListAPIView(APIView):
    authentication_classes = [JWTAuthentication, CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        notifications_qs = Notification.objects.filter(user=user).order_by('-created_at')
        unread_count = notifications_qs.filter(is_read=False).count()

        limit = request.GET.get('limit', 50)
        try:
            limit = min(int(limit), 100)
        except (ValueError, TypeError):
            limit = 50

        notifications = notifications_qs[:limit]
        serializer = NotificationSerializer(notifications, many=True)
        return Response({
            'unread_count': unread_count,
            'notifications': serializer.data,
        })


class NotificationMarkReadAPIView(APIView):
    authentication_classes = [JWTAuthentication, CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        user = request.user
        notification = get_object_or_404(Notification, pk=pk, user=user)

        if not notification.is_read:
            notification.is_read = True
            notification.read_at = timezone.now()
            notification.save(update_fields=['is_read', 'read_at', 'updated_at'])

        unread_count = Notification.objects.filter(user=user, is_read=False).count()
        return Response({
            'success': True,
            'id': notification.id,
            'unread_count': unread_count,
        })


class NotificationMarkAllReadAPIView(APIView):
    authentication_classes = [JWTAuthentication, CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        now = timezone.now()
        Notification.objects.filter(user=user, is_read=False).update(
            is_read=True,
            read_at=now,
            updated_at=now,
        )
        return Response({
            'success': True,
            'unread_count': 0,
        })


def portal_notifications_page(request):
    """
    Renders full-page notification view for mobile Staff Portal.
    """
    if not request.user.is_authenticated:
        return redirect('/portal/login/')

    user = request.user
    notifications_qs = Notification.objects.filter(user=user).order_by('-created_at')
    unread_count = notifications_qs.filter(is_read=False).count()
    notifications = notifications_qs[:100]

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
        'notifications': notifications,
        'unread_count': unread_count,
        'back_url': back_url,
    })

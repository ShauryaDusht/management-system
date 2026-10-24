from rest_framework import serializers
from django.utils import timezone
from apps.core.models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    time_ago = serializers.SerializerMethodField()
    created_at_formatted = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            'id',
            'title',
            'message',
            'notification_type',
            'status_label',
            'is_read',
            'read_at',
            'link',
            'created_at',
            'created_at_formatted',
            'time_ago',
        ]

    def get_time_ago(self, obj):
        now = timezone.now()
        diff = now - obj.created_at
        seconds = int(diff.total_seconds())

        if seconds < 60:
            return "Just now"
        minutes = seconds // 60
        if minutes < 60:
            return f"{minutes}m ago"
        hours = minutes // 60
        if hours < 24:
            return f"{hours}h ago"
        days = hours // 24
        if days < 7:
            return f"{days}d ago"
        return obj.created_at.strftime('%d %b %Y')

    def get_created_at_formatted(self, obj):
        local_time = timezone.localtime(obj.created_at)
        return local_time.strftime('%d %b %Y, %I:%M %p')

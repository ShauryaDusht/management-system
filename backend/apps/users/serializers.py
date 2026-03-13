from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import User


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Add user info into the JWT token response."""

    @staticmethod
    def _get_portal_redirect(user):
        role = user.role
        if role == 'admin':
            return '/admin-portal/'
        if role == 'inventory_manager':
            return '/inventory/mobile/'
        if role == 'housekeeping_manager':
            return '/housekeeping/dashboard/'
        if role == 'horticulture_manager':
            return '/horticulture/dashboard/'
        if role in ('supervisor', 'caretaker'):
            return '/housekeeping/dashboard/'
        return '/portal/'

    def validate(self, attrs):
        data = super().validate(attrs)
        user = self.user
        data['user'] = {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'full_name': user.get_full_name(),
            'role': user.role,
            'phone': user.phone,
            'pay_code': user.pay_code,
            'portal_redirect': self._get_portal_redirect(user),
        }
        return data


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    areas_incharge = serializers.SerializerMethodField()
    assigned_area_ids = serializers.SerializerMethodField()
    area_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        write_only=True,
        required=False,
    )
    password = serializers.CharField(write_only=True, required=False, min_length=8)

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'full_name',
            'role',
            'phone',
            'pay_code',
            'is_active',
            'areas_incharge',
            'assigned_area_ids',
            'area_ids',
            'password',
        ]
        read_only_fields = ['id']

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username

    def get_areas_incharge(self, obj):
        return [link.area.name for link in obj.hk_areas.all() if link.area]

    def get_assigned_area_ids(self, obj):
        return [link.area_id for link in obj.hk_areas.all() if link.area_id]

    def _apply_area_assignments(self, user, area_ids):
        from apps.housekeeping.models import HKArea, HKUserArea

        if area_ids is None:
            return

        existing_ids = set(HKArea.objects.filter(id__in=area_ids).values_list('id', flat=True))
        requested_ids = set(area_ids)
        missing = sorted(requested_ids - existing_ids)
        if missing:
            raise serializers.ValidationError({'area_ids': [f'Invalid area ids: {missing}']})

        HKUserArea.objects.filter(user=user).exclude(area_id__in=requested_ids).delete()
        for area_id in requested_ids:
            HKUserArea.objects.get_or_create(user=user, area_id=area_id)

    def update(self, instance, validated_data):
        area_ids = validated_data.pop('area_ids', None)
        password = validated_data.pop('password', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if password:
            instance.set_password(password)

        instance.save()
        self._apply_area_assignments(instance, area_ids)
        return instance


class UserCreateSerializer(serializers.ModelSerializer):
    area_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        write_only=True,
        required=False,
    )
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ['username', 'email', 'first_name', 'last_name', 'role', 'phone', 'pay_code', 'password', 'area_ids']

    def create(self, validated_data):
        area_ids = validated_data.pop('area_ids', [])
        if area_ids:
            from apps.housekeeping.models import HKArea

            existing_ids = set(HKArea.objects.filter(id__in=area_ids).values_list('id', flat=True))
            requested_ids = set(area_ids)
            missing = sorted(requested_ids - existing_ids)
            if missing:
                raise serializers.ValidationError({'area_ids': [f'Invalid area ids: {missing}']})

        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()

        if area_ids:
            from apps.housekeeping.models import HKUserArea

            for area_id in set(area_ids):
                HKUserArea.objects.get_or_create(user=user, area_id=area_id)
        return user

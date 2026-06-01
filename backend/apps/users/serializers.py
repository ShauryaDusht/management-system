from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from apps.core.image_urls import image_field_url
from apps.core.portal_views import get_portal_redirect

from .models import User, is_standard_username, normalize_username_value, unique_standard_username

STAFF_HIDDEN_AREA_NAMES = {'Hostels Reliever', 'Old Academic Reliever', 'New Academic Reliever'}


def _canonical_username(attrs, instance=None):
    first_name = attrs.get('first_name', getattr(instance, 'first_name', ''))
    last_name = attrs.get('last_name', getattr(instance, 'last_name', ''))
    supplied = normalize_username_value(attrs.get('username', getattr(instance, 'username', '')))
    if supplied == 'hk_inventory_manager':
        return supplied
    generated = unique_standard_username(
        first_name,
        last_name,
        model=User,
        exclude_pk=getattr(instance, 'pk', None),
    )
    username = generated or supplied
    if not username:
        raise serializers.ValidationError({'username': 'Enter first and last name to generate username.'})
    if not is_standard_username(username):
        raise serializers.ValidationError({'username': 'Username must be lowercase firstname.lastname.'})
    qs = User.objects.filter(username=username)
    if instance is not None:
        qs = qs.exclude(pk=instance.pk)
    if qs.exists() and username == supplied:
        raise serializers.ValidationError({'username': 'A user with this standardized username already exists.'})
    return username


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Add user info into the JWT token response."""

    @staticmethod
    def _get_portal_redirect(user):
        return get_portal_redirect(user)

    @staticmethod
    def _repair_portal_user(user):
        if user.username == 'hostel.office' and user.role != User.Role.HOSTEL_OFFICE:
            user.role = User.Role.HOSTEL_OFFICE
            user.is_active = True
            user.is_staff = True
            user.is_superuser = False
            user.save(update_fields=['role', 'is_active', 'is_staff', 'is_superuser'])
        return user

    def validate(self, attrs):
        attrs['username'] = normalize_username_value(attrs.get('username'))
        data = super().validate(attrs)
        user = self._repair_portal_user(self.user)
        data['user'] = {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'full_name': user.get_full_name(),
            'role': user.role,
            'phone': user.phone,
            'portal_redirect': self._get_portal_redirect(user),
        }
        return data


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    areas_incharge = serializers.SerializerMethodField()
    assigned_area_ids = serializers.SerializerMethodField()
    profile_photo_url = serializers.SerializerMethodField()
    profile_photo = serializers.ImageField(required=False, allow_null=True)
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
            'profile_photo',
            'profile_photo_url',
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
        names = []
        hide_staff_reliever_areas = obj.role in {User.Role.SUPERVISOR, User.Role.CARETAKER}
        for link in obj.hk_areas.all():
            if not link.area:
                continue
            if hide_staff_reliever_areas and link.area.name in STAFF_HIDDEN_AREA_NAMES:
                continue
            names.append(link.area.name)
        horticulture_zones = getattr(obj, 'horticulture_supervised_zones', None)
        if horticulture_zones is not None:
            names.extend(zone.name for zone in horticulture_zones.all())
        return names

    def get_assigned_area_ids(self, obj):
        return [link.area_id for link in obj.hk_areas.all() if link.area_id]

    def get_profile_photo_url(self, obj):
        return image_field_url(self.context.get('request'), obj.profile_photo)

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
        validated_data['username'] = _canonical_username(validated_data, instance)

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

        validated_data['username'] = _canonical_username(validated_data)
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()

        if area_ids:
            from apps.housekeeping.models import HKUserArea

            for area_id in set(area_ids):
                HKUserArea.objects.get_or_create(user=user, area_id=area_id)
        return user

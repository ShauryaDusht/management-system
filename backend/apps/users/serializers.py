from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from apps.core.image_urls import image_field_url
from apps.core.portal_views import get_portal_redirect

from .models import User, is_standard_username, normalize_username_value, unique_standard_username

STAFF_HIDDEN_AREA_NAMES = {'Hostels Reliever', 'Old Academic Reliever', 'New Academic Reliever'}
REMOVED_ROLES = {'housekeeping_manager'}


def _validate_removed_role(attrs):
    if attrs.get('role') in REMOVED_ROLES:
        raise serializers.ValidationError({'role': ['Housekeeping Manager role has been removed. Use HK / Inventory Manager instead.']})


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


def _update_username(attrs, instance):
    supplied = normalize_username_value(attrs.get('username', ''))
    current = normalize_username_value(getattr(instance, 'username', ''))
    if not supplied or supplied == current:
        return current
    if not is_standard_username(supplied):
        raise serializers.ValidationError({'username': 'Username must be lowercase firstname.lastname.'})
    if User.objects.filter(username=supplied).exclude(pk=instance.pk).exists():
        raise serializers.ValidationError({'username': 'A user with this standardized username already exists.'})
    return supplied


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
        raw_val = normalize_username_value(attrs.get('username'))
        if not User.objects.filter(username=raw_val).exists():
            matched_user = User.objects.filter(email__iexact=raw_val).first()
            if not matched_user and '@' in raw_val:
                from django.conf import settings
                civil_emails = [e.strip().lower() for e in getattr(settings, 'CIVIL_ALERT_EMAIL', '').split(',') if e.strip()]
                elec_emails = [e.strip().lower() for e in getattr(settings, 'ELECTRICAL_ALERT_EMAIL', '').split(',') if e.strip()]
                if raw_val.lower() in civil_emails:
                    matched_user = User.objects.filter(username='civil.team').first()
                elif raw_val.lower() in elec_emails:
                    matched_user = User.objects.filter(username='electrical.team').first()
            if matched_user:
                raw_val = matched_user.username
        attrs['username'] = raw_val
        data = super().validate(attrs)
        user = self._repair_portal_user(self.user)
        response_role = User.Role.HK_INVENTORY_MANAGER if user.username == 'hostel.office' else user.role
        data['user'] = {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'full_name': user.get_full_name(),
            'role': response_role,
            'actual_role': user.role,
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
        from apps.housekeeping.models import HKArea, HKUserArea, HKWorker
        from apps.housekeeping.api_views import _is_old_academic_area, _is_new_academic_area

        if area_ids is None:
            return

        existing_ids = set(HKArea.objects.filter(id__in=area_ids).values_list('id', flat=True))
        requested_ids = set(area_ids)
        missing = sorted(requested_ids - existing_ids)
        if missing:
            raise serializers.ValidationError({'area_ids': [f'Invalid area ids: {missing}']})

        # Preserve any existing staff hidden reliever areas currently assigned to user
        for link in user.hk_areas.all():
            if link.area and link.area.name in STAFF_HIDDEN_AREA_NAMES:
                requested_ids.add(link.area_id)

        # Auto-include academic reliever areas if user has or receives academic blocks
        assigned_areas = list(HKArea.objects.filter(id__in=requested_ids, is_active=True))
        if any(_is_old_academic_area(a) for a in assigned_areas):
            old_reliever = HKArea.objects.filter(name='Old Academic Reliever', is_active=True).first()
            if old_reliever:
                requested_ids.add(old_reliever.id)
                HKWorker.objects.filter(area=old_reliever, is_active=True).update(supervisor=user)

        if any(_is_new_academic_area(a) for a in assigned_areas):
            new_reliever = HKArea.objects.filter(name='New Academic Reliever', is_active=True).first()
            if new_reliever:
                requested_ids.add(new_reliever.id)
                HKWorker.objects.filter(area=new_reliever, is_active=True).update(supervisor=user)

        HKUserArea.objects.filter(user=user).exclude(area_id__in=requested_ids).delete()
        for area_id in requested_ids:
            HKUserArea.objects.get_or_create(user=user, area_id=area_id)
        HKWorker.objects.filter(area_id__in=requested_ids, is_active=True).update(supervisor=user)

    def update(self, instance, validated_data):
        _validate_removed_role(validated_data)
        area_ids = validated_data.pop('area_ids', None)
        password = validated_data.pop('password', None)
        if 'username' in validated_data:
            validated_data['username'] = _update_username(validated_data, instance)

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
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'role', 'phone', 'pay_code', 'password', 'area_ids']
        read_only_fields = ['id']
        extra_kwargs = {
            'username': {'required': False, 'allow_blank': True},
            'email': {'required': False, 'allow_blank': True},
            'first_name': {'required': False, 'allow_blank': True},
            'last_name': {'required': False, 'allow_blank': True},
            'phone': {'required': False, 'allow_blank': True},
            'pay_code': {'required': False, 'allow_blank': True},
        }

    def create(self, validated_data):
        _validate_removed_role(validated_data)
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

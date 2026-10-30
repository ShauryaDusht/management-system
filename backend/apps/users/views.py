from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, SAFE_METHODS
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User
from .serializers import CustomTokenObtainPairSerializer, UserSerializer, UserCreateSerializer
from .permissions import IsAdminOrHousekeepingUserManager

DEPRECATED_MANAGER_USERNAMES = ['housekeeping.manager', 'hostel.manager', 'inventory.manager']


def _is_hk_inventory_request(user):
    return bool(
        user
        and (
            getattr(user, 'is_hk_inventory_manager', False)
        )
    )


def _is_protected_admin_user(user):
    return bool(user and (getattr(user, 'is_admin', False) or getattr(user, 'is_superuser', False)))


def _is_hostel_office_request(user):
    return bool(user and getattr(user, 'is_hostel_office', False))


def _hostel_office_area_q():
    from django.db.models import Q

    return (
        Q(area_type__in=['hostel', 'jrha'])
        | Q(name__iexact='Hostel Common Area')
        | Q(name__iexact='Hostels Reliever')
        | Q(name__icontains='JRHA')
        | Q(name__icontains='Jeet Hostel')
    )


def _get_managed_operator_roles(user):
    if not user or not user.is_authenticated:
        return set()
    if user.is_admin or getattr(user, 'is_hk_inventory_manager', False) or user.is_superuser or getattr(user, 'role', '') == User.Role.TECHNICAL_ASSISTANT:
        return None  # None indicates full users list access
    allowed = set()
    role = getattr(user, 'role', '')
    if role == User.Role.PLANT_ENGINEER:
        allowed.update([User.Role.ELECTRICAL_OPERATOR, User.Role.WTP_OPERATOR])
    elif role == User.Role.ELECTRICAL_SUPERVISOR:
        allowed.add(User.Role.ELECTRICAL_OPERATOR)
    elif role == User.Role.WTP_SUPERVISOR:
        allowed.add(User.Role.WTP_OPERATOR)
    elif role in [User.Role.HVAC_ENGINEER, User.Role.HVAC_SUPERVISOR]:
        allowed.add(User.Role.HVAC_OPERATOR)
    return allowed


def _is_operations_supervisor_or_admin(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_admin or getattr(user, 'is_hk_inventory_manager', False) or user.is_superuser:
        return True
    return bool(_get_managed_operator_roles(user))


def _deny_hk_inventory_admin_mutation(request_user, target_user=None, incoming_role=None):
    if not _is_hk_inventory_request(request_user):
        return
    if _is_protected_admin_user(target_user):
        raise PermissionDenied('Managers cannot edit or delete admin users.')
    if incoming_role == User.Role.ADMIN:
        raise ValidationError({'role': ['Managers cannot create or promote admin users.']})


class LoginView(TokenObtainPairView):
    """
    POST /api/auth/login/
    Returns access token, refresh token, and user info.
    """
    serializer_class = CustomTokenObtainPairSerializer


class LogoutView(APIView):
    """
    POST /api/auth/logout/
    Blacklists the refresh token.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data['refresh']
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response({'detail': 'Successfully logged out.'}, status=status.HTTP_200_OK)
        except Exception:
            return Response({'detail': 'Invalid token.'}, status=status.HTTP_400_BAD_REQUEST)


class MeView(APIView):
    """
    GET /api/auth/me/
    Returns current logged-in user's info.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user, context={'request': request})
        data = dict(serializer.data)
        if request.user.username == 'hostel.office':
            data['actual_role'] = data.get('role')
            data['role'] = User.Role.HK_INVENTORY_MANAGER
        return Response(data)


class UserListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/auth/users/   — Admin & Supervisors: list users
    POST /api/auth/users/   — Admin & Supervisors: create new operator/user
    """
    def get_permissions(self):
        user = getattr(self.request, 'user', None)
        if self.request.method not in SAFE_METHODS and getattr(user, 'role', '') == User.Role.TECHNICAL_ASSISTANT and not getattr(user, 'can_edit', False):
            raise PermissionDenied('Technical Assistant has read-only access. Contact admin for edit rights.')
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = User.objects.prefetch_related(
            'hk_areas__area',
            'horticulture_supervised_zones',
        ).exclude(username__in=DEPRECATED_MANAGER_USERNAMES).exclude(role='housekeeping_manager').order_by('role', 'first_name')

        managed_roles = _get_managed_operator_roles(self.request.user)
        if managed_roles is not None:
            if not managed_roles:
                raise PermissionDenied('You do not have permission to view users.')
            qs = qs.filter(role__in=managed_roles)

        if _is_hostel_office_request(self.request.user):
            from apps.housekeeping.models import HKArea

            hostel_area_ids = list(
                HKArea.objects.filter(is_active=True)
                .filter(_hostel_office_area_q())
                .values_list('id', flat=True)
            )
            qs = qs.filter(
                role__in=[User.Role.SUPERVISOR, User.Role.CARETAKER],
                hk_areas__area_id__in=hostel_area_ids,
            ).distinct()
        role = self.request.query_params.get('role')
        if role:
            qs = qs.filter(role=role)
        return qs

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return UserCreateSerializer
        return UserSerializer

    def perform_create(self, serializer):
        if getattr(self.request.user, 'role', '') == User.Role.TECHNICAL_ASSISTANT and not getattr(self.request.user, 'can_edit', False):
            raise PermissionDenied('Technical Assistant has read-only access. Contact admin for edit rights.')
        managed_roles = _get_managed_operator_roles(self.request.user)
        if managed_roles is not None:
            incoming_role = serializer.validated_data.get('role')
            if incoming_role not in managed_roles:
                raise PermissionDenied(f'Supervisors can only add operators for their department: {", ".join(managed_roles)}')
        else:
            _deny_hk_inventory_admin_mutation(
                self.request.user,
                incoming_role=serializer.validated_data.get('role'),
            )
        serializer.save()


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET/PUT/PATCH/DELETE /api/auth/users/<id>/
    Admin & Department Supervisors.
    """
    queryset = User.objects.prefetch_related('hk_areas__area', 'horticulture_supervised_zones').all()
    serializer_class = UserSerializer

    def get_permissions(self):
        user = getattr(self.request, 'user', None)
        if self.request.method not in SAFE_METHODS and getattr(user, 'role', '') == User.Role.TECHNICAL_ASSISTANT and not getattr(user, 'can_edit', False):
            raise PermissionDenied('Technical Assistant has read-only access. Contact admin for edit rights.')
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = User.objects.prefetch_related('hk_areas__area', 'horticulture_supervised_zones').all()
        managed_roles = _get_managed_operator_roles(self.request.user)
        if managed_roles is not None:
            qs = qs.filter(role__in=managed_roles)
        return qs

    def perform_update(self, serializer):
        if getattr(self.request.user, 'role', '') == User.Role.TECHNICAL_ASSISTANT and not getattr(self.request.user, 'can_edit', False):
            raise PermissionDenied('Technical Assistant has read-only access. Contact admin for edit rights.')
        managed_roles = _get_managed_operator_roles(self.request.user)
        if managed_roles is not None:
            if serializer.instance.role not in managed_roles:
                raise PermissionDenied('Supervisors can only update operators for their department.')
            incoming_role = serializer.validated_data.get('role')
            if incoming_role and incoming_role not in managed_roles:
                raise PermissionDenied('Supervisors cannot reassign operators outside their department.')
            serializer.save()
            return

        if _is_hostel_office_request(self.request.user):
            incoming_keys = set(self.request.data.keys())
            allowed_keys = {'first_name', 'last_name', 'email', 'phone', 'pay_code', 'is_active', 'area_ids'}
            if incoming_keys - allowed_keys:
                raise PermissionDenied('Hostel Office can update only supervisor/caretaker details and area assignments.')
            if serializer.instance.role not in {User.Role.SUPERVISOR, User.Role.CARETAKER}:
                raise PermissionDenied('Hostel Office can update only supervisor/caretaker assignments.')

            from apps.housekeeping.models import HKArea

            allowed_area_ids = set(
                HKArea.objects.filter(is_active=True)
                .filter(_hostel_office_area_q())
                .values_list('id', flat=True)
            )
            current_area_ids = set(serializer.instance.hk_areas.values_list('area_id', flat=True))
            if not (current_area_ids & allowed_area_ids):
                raise PermissionDenied('Hostel Office can update only hostel/JRHA supervisor/caretaker staff.')
            if 'area_ids' in self.request.data:
                area_ids = self.request.data.get('area_ids') or []
                try:
                    requested_area_ids = {int(area_id) for area_id in area_ids}
                except (TypeError, ValueError):
                    raise PermissionDenied('Invalid area assignment.')
                current_non_hostel_ids = current_area_ids - allowed_area_ids
                requested_non_hostel_ids = requested_area_ids - allowed_area_ids
                if requested_non_hostel_ids != current_non_hostel_ids:
                    raise PermissionDenied('Hostel Office can change hostel/JRHA area assignments only.')
            serializer.save()
            return
        _deny_hk_inventory_admin_mutation(
            self.request.user,
            target_user=serializer.instance,
            incoming_role=serializer.validated_data.get('role'),
        )
        serializer.save()

    def perform_destroy(self, instance):
        if getattr(self.request.user, 'role', '') == User.Role.TECHNICAL_ASSISTANT and not getattr(self.request.user, 'can_edit', False):
            raise PermissionDenied('Technical Assistant has read-only access. Contact admin for edit rights.')
        managed_roles = _get_managed_operator_roles(self.request.user)
        if managed_roles is not None:
            if instance.role not in managed_roles:
                raise PermissionDenied('Supervisors can only remove operators for their department.')
            instance.delete()
            return
        _deny_hk_inventory_admin_mutation(self.request.user, target_user=instance)
        instance.delete()


class ChangePasswordView(APIView):
    """
    POST /api/auth/change-password/
    Change password for the currently authenticated user.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        current = request.data.get('current_password')
        new_pass = request.data.get('new_password')

        if not user.check_password(current):
            return Response(
                {'error': 'Current password incorrect'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not new_pass or len(new_pass) < 6:
            return Response(
                {'error': 'Password too short'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(new_pass)
        user.save(update_fields=['password'])
        return Response({'detail': 'Password changed successfully'})

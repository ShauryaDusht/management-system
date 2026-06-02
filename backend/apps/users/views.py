from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User
from .serializers import CustomTokenObtainPairSerializer, UserSerializer, UserCreateSerializer
from .permissions import IsAdminOrHKInventoryManager

DEPRECATED_MANAGER_USERNAMES = ['housekeeping.manager', 'inventory.manager']


def _is_hk_inventory_request(user):
    return bool(user and getattr(user, 'is_hk_inventory_manager', False))


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


def _deny_hk_inventory_admin_mutation(request_user, target_user=None, incoming_role=None):
    if not _is_hk_inventory_request(request_user):
        return
    if _is_protected_admin_user(target_user):
        raise PermissionDenied('HK Inventory Manager cannot edit or delete admin users.')
    if incoming_role == User.Role.ADMIN:
        raise ValidationError({'role': ['HK Inventory Manager cannot create or promote admin users.']})


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
    GET  /api/auth/users/   — Admin: list all users
    POST /api/auth/users/   — Admin: create new user
    """
    def get_permissions(self):
        if self.request.method == 'GET' and _is_hostel_office_request(self.request.user):
            return [IsAuthenticated()]
        return [IsAdminOrHKInventoryManager()]

    def get_queryset(self):
        qs = User.objects.prefetch_related(
            'hk_areas__area',
            'horticulture_supervised_zones',
        ).exclude(username__in=DEPRECATED_MANAGER_USERNAMES).order_by('role', 'first_name')
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
        _deny_hk_inventory_admin_mutation(
            self.request.user,
            incoming_role=serializer.validated_data.get('role'),
        )
        serializer.save()


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET/PUT/PATCH/DELETE /api/auth/users/<id>/
    Admin only.
    """
    queryset = User.objects.prefetch_related('hk_areas__area', 'horticulture_supervised_zones').all()
    serializer_class = UserSerializer
    def get_permissions(self):
        if self.request.method == 'PATCH' and _is_hostel_office_request(self.request.user):
            return [IsAuthenticated()]
        return [IsAdminOrHKInventoryManager()]

    def perform_update(self, serializer):
        if _is_hostel_office_request(self.request.user):
            incoming_keys = set(self.request.data.keys())
            if incoming_keys != {'area_ids'}:
                raise PermissionDenied('Hostel Office can update area assignments only.')
            if serializer.instance.role not in {User.Role.SUPERVISOR, User.Role.CARETAKER}:
                raise PermissionDenied('Hostel Office can update only supervisor/caretaker assignments.')

            from apps.housekeeping.models import HKArea

            area_ids = self.request.data.get('area_ids') or []
            allowed_area_ids = set(
                HKArea.objects.filter(is_active=True)
                .filter(_hostel_office_area_q())
                .values_list('id', flat=True)
            )
            try:
                requested_area_ids = {int(area_id) for area_id in area_ids}
            except (TypeError, ValueError):
                raise PermissionDenied('Invalid area assignment.')
            current_area_ids = set(serializer.instance.hk_areas.values_list('area_id', flat=True))
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

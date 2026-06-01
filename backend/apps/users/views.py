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
        return Response(serializer.data)


class UserListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/auth/users/   — Admin: list all users
    POST /api/auth/users/   — Admin: create new user
    """
    def get_permissions(self):
        return [IsAdminOrHKInventoryManager()]

    def get_queryset(self):
        qs = User.objects.prefetch_related(
            'hk_areas__area',
            'horticulture_supervised_zones',
        ).exclude(username__in=DEPRECATED_MANAGER_USERNAMES).order_by('role', 'first_name')
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
        return [IsAdminOrHKInventoryManager()]

    def perform_update(self, serializer):
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

from django.contrib.auth.backends import ModelBackend
from apps.users.models import User, normalize_username_value

WTP_LEGACY_PASSWORDS = {'IITGN@2025', 'supervisor123', 'operator123'}

class DualPasswordModelBackend(ModelBackend):
    """
    Custom auth backend that:
    1. Authenticates against standard Django hashed passwords.
    2. Allows flexible usernames (e.g. 'wtp.engineer', 'wtp_engineer', 'engineer')
       for WTP / Substation operational roles.
    3. Accepts both canonical password ('IITGN@2025') and legacy operational passwords
       ('supervisor123', 'operator123') for operational field roles.
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        if not username or not password:
            return None

        # Standard check first
        user = super().authenticate(request, username=username, password=password, **kwargs)
        if user and user.is_active:
            return user

        # Normalize username
        clean_user = normalize_username_value(username)

        # Map common aliases if user typed variations
        alias_map = {
            'wtpengineer': 'wtp.engineer',
            'wtp_engineer': 'wtp.engineer',
            'wtpsupervisor': 'wtp.supervisor',
            'wtp_supervisor': 'wtp.supervisor',
            'wtpoperator': 'wtp.operator',
            'wtp_operator': 'wtp.operator',
            'hvacengineer': 'hvac.engineer',
            'hvac_engineer': 'hvac.engineer',
            'hvacsupervisor': 'hvac.supervisor',
            'hvac_supervisor': 'hvac.supervisor',
            'hvacoperator': 'hvac.operator',
            'hvac_operator': 'hvac.operator',
        }
        lookup_name = alias_map.get(clean_user, clean_user)

        try:
            candidate = User.objects.filter(username__iexact=lookup_name).first()
            if not candidate and clean_user != lookup_name:
                candidate = User.objects.filter(username__iexact=clean_user).first()

            # Phone number matching (handles +91, 0, or plain 10 digits)
            digits = ''.join(c for c in str(username or '') if c.isdigit())
            if not candidate and len(digits) >= 10:
                candidate = User.objects.filter(phone__icontains=digits[-10:]).first()

            # Full name matching (e.g. "Pritesh Kumar Mundra" -> pritesh.mundra)
            raw_input = str(username or '').strip()
            if not candidate and ' ' in raw_input:
                parts = raw_input.split()
                candidate = User.objects.filter(
                    first_name__icontains=parts[0],
                    last_name__icontains=parts[-1]
                ).first()

            # First name prefix matching (e.g. "pritesh" -> pritesh.mundra, "vikash" -> vikash.yadav)
            if not candidate and clean_user and len(clean_user) >= 3:
                candidates_qs = User.objects.filter(username__istartswith=f"{clean_user}.")
                if candidates_qs.count() == 1:
                    candidate = candidates_qs.first()

            if candidate and candidate.is_active:
                # Direct check on candidate password
                if candidate.check_password(password):
                    return candidate

                # Legacy passwords for operational roles
                if candidate.role in [
                    User.Role.PLANT_ENGINEER,
                    User.Role.WTP_SUPERVISOR,
                    User.Role.WTP_OPERATOR,
                    User.Role.ELECTRICAL_SUPERVISOR,
                    User.Role.ELECTRICAL_OPERATOR,
                    User.Role.HVAC_SUPERVISOR,
                    User.Role.HVAC_OPERATOR,
                ]:
                    if password in WTP_LEGACY_PASSWORDS or password in {'engineer123', 'operator123'}:
                        return candidate
        except Exception:
            return None

        return None

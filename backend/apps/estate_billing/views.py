import datetime
import re
from decimal import Decimal, ROUND_HALF_UP
from django.db import models, transaction
from django.db.models import F, Max
from django.db.models.functions import Cast
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    EstateSettings,
    BillingCycle,
    Shop,
    ShopDemandNote,
    Contractor,
    ContractorDemandNote,
    HousingUnit,
    HousingAllotment,
    HousingClearance,
)
from .serializers import (
    EstateSettingsSerializer,
    BillingCycleSerializer,
    ShopDemandNoteSerializer,
    ContractorDemandNoteSerializer,
    HousingUnitSerializer,
    LightHousingUnitSerializer,
    HousingAllotmentSerializer,
    HousingClearanceSerializer,
)
from .housing_master_data import MASTER_HOUSING_UNITS
from .billing_master_data import (
    ensure_master_shops_and_contractors,
    CONTRACTOR_DEFAULT_METERS,
)
from .notifications import (
    send_handover_alert,
    send_test_email,
    EVENT_ESTATE_TO_CIVIL,
    EVENT_CIVIL_TO_ELECTRICAL,
    EVENT_ELECTRICAL_TO_HK,
    EVENT_HK_TO_ESTATE,
    EVENT_ESTATE_ALLOTTED,
)




def is_estate_allowed(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or user.role == 'admin':
        return True
    if getattr(user, 'role', '') == 'estate_office':
        return True
    return False


def is_estate_write_allowed(user):
    if not user or not user.is_authenticated:
        return False
    # Admin has edit capability when edit mode is toggled, and estate_office has write access
    if user.is_superuser or user.role == 'admin':
        return True
    if getattr(user, 'role', '') == 'estate_office':
        return True
    return False


def is_clearance_allowed(user):
    """Allows viewing clearance pipeline for admin, estate_office, civil_team, electrical_team, housekeeping."""
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or getattr(user, 'role', '') == 'admin':
        return True
    role = getattr(user, 'role', '')
    if role in ('estate_office', 'civil_team', 'electrical_team', 'hk_inventory_manager', 'supervisor', 'caretaker'):
        return True
    return False


def is_clearance_master(user):
    """Returns True if the user has full master privileges over clearances (Admin and Estate Office)."""
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or getattr(user, 'role', '') == 'admin':
        return True
    return getattr(user, 'role', '') == 'estate_office'



def get_today_iso():
    return datetime.date.today().isoformat()


def get_prev_month(iso_str=None):
    if not iso_str:
        today = datetime.date.today()
    else:
        try:
            parts = [int(p) for p in iso_str.split('-')[:2]]
            today = datetime.date(parts[0], parts[1], 1)
        except Exception:
            today = datetime.date.today()
    if today.month == 1:
        return f"{today.year - 1}-12"
    return f"{today.year}-{today.month - 1:02d}"


def calculate_shop_total(units_str, rate, water, fixed, extras=None):
    rate_val = Decimal(str(rate or 0))
    water_val = Decimal(str(water or 0))
    extras_total = Decimal('0')
    if extras and isinstance(extras, list):
        for ex in extras:
            try:
                amt = Decimal(str(ex.get('amount') or 0))
                extras_total += amt
            except Exception:
                pass

    if fixed:
        return (water_val + extras_total).quantize(Decimal('1'), rounding=ROUND_HALF_UP)

    try:
        u = Decimal(str(units_str).strip())
        elec = (u * rate_val).quantize(Decimal('1'), rounding=ROUND_HALF_UP)
    except Exception:
        elec = Decimal('0')

    return elec + water_val + extras_total


def calculate_contractor_total(meters):
    total = Decimal('0')
    if not meters or not isinstance(meters, list):
        return total
    for m in meters:
        try:
            curr_str = str(m.get('current', '')).strip()
            prev_str = str(m.get('previous', '')).strip()
            if curr_str and prev_str:
                curr = Decimal(curr_str)
                prev = Decimal(prev_str)
                rate = Decimal(str(m.get('rate') or 0))
                if curr >= prev:
                    units = curr - prev
                    amt = (units * rate).quantize(Decimal('1'), rounding=ROUND_HALF_UP)
                    total += amt
        except Exception:
            continue
    return total


def get_cycle_first_note_no(cycle_month):
    """
    Returns the starting note number for shops in the given cycle_month.
    If an earlier cycle exists in the same financial year (same prefix), continues
    from the maximum numeric note_no of active, non-cancelled shops in that previous cycle + 1.
    Otherwise, starts at settings.first_note_no.
    """
    settings = EstateSettings.get_settings()
    prefix = settings.get_effective_prefix(cycle_month)

    prev_cycle = (
        BillingCycle.objects.filter(month__lt=cycle_month, is_active=True)
        .order_by('-month')
        .first()
    )
    if not prev_cycle:
        return settings.first_note_no

    prev_prefix = settings.get_effective_prefix(prev_cycle.month)
    if prev_prefix != prefix:
        return settings.first_note_no

    prev_notes = ShopDemandNote.objects.filter(
        cycle_month=prev_cycle.month,
        shop__is_active=True,
        is_cancelled=False,
    ).exclude(note_no__in=['', 'CANCELLED'])

    max_num = None
    for n in prev_notes:
        m = re.search(r'(\d+)$', n.note_no or '')
        if m:
            val = int(m.group(1))
            if max_num is None or val > max_num:
                max_num = val

    if max_num is not None:
        return max_num + 1

    return settings.first_note_no


def resequence_shop_note_numbers(cycle_month):
    """
    Re-assigns note_no (e.g. IWD/26-27/196, 197...) sequentially to all active,
    non-cancelled shop demand notes in this billing cycle so there are no number gaps.
    Skips any note numbers already claimed by contractor demand notes in this cycle.
    Cancelled notes have note_no = 'CANCELLED'.
    """
    settings = EstateSettings.get_settings()
    prefix = settings.get_effective_prefix(cycle_month)
    first_no = get_cycle_first_note_no(cycle_month)

    # Avoid collisions with note numbers used by contractors in the same cycle
    contractor_note_nos = set(
        ContractorDemandNote.objects.filter(cycle_month=cycle_month)
        .exclude(note_no__in=['', None])
        .values_list('note_no', flat=True)
    )

    active_notes = (
        ShopDemandNote.objects.filter(cycle_month=cycle_month, shop__is_active=True, is_cancelled=False)
        .select_related('shop')
        .order_by('shop__sl', 'id')
    )

    curr_no = first_no
    for n in active_notes:
        expected_no = f"{prefix}{curr_no}"
        while expected_no in contractor_note_nos:
            curr_no += 1
            expected_no = f"{prefix}{curr_no}"

        if n.note_no != expected_no:
            n.note_no = expected_no
            n.save(update_fields=['note_no'])
        curr_no += 1

    cancelled_notes = ShopDemandNote.objects.filter(
        cycle_month=cycle_month, shop__is_active=True, is_cancelled=True
    )
    for cn in cancelled_notes:
        if cn.note_no != 'CANCELLED':
            cn.note_no = 'CANCELLED'
            cn.save(update_fields=['note_no'])


def resequence_all_cycles_from(cycle_month):
    """Resequences cycle_month and any subsequent cycles in chronological order."""
    cycle_months = set(
        BillingCycle.objects.filter(month__gte=cycle_month, is_active=True).values_list('month', flat=True)
    )
    cycle_months.update(
        ShopDemandNote.objects.filter(cycle_month__gte=cycle_month).values_list('cycle_month', flat=True)
    )
    for m in sorted(cycle_months):
        resequence_shop_note_numbers(m)


def ensure_cycle_notes(cycle_month):
    ensure_master_shops_and_contractors()
    settings = EstateSettings.get_settings()
    prefix = settings.get_effective_prefix(cycle_month)
    first_no = get_cycle_first_note_no(cycle_month)
    today_str = get_today_iso()
    prev_m = get_prev_month(today_str)

    # Ensure BillingCycle object exists
    BillingCycle.objects.get_or_create(
        month=cycle_month,
        defaults={'label': cycle_month, 'is_active': True}
    )

    # 1. Shops
    shops = list(Shop.objects.filter(is_active=True).order_by('sl', 'id'))
    existing_shop_notes = {
        n.shop_id: n for n in ShopDemandNote.objects.filter(cycle_month=cycle_month)
    }
    for shop in shops:
        if shop.id not in existing_shop_notes:
            note_no = f"{prefix}{first_no + shop.sl - 1}"
            ShopDemandNote.objects.create(
                shop=shop,
                cycle_month=cycle_month,
                date=today_str,
                month=prev_m,
                month_to='',
                note_no=note_no,
                units='',
                rate=shop.default_rate,
                water=shop.default_water,
                fixed=shop.fixed,
                extras=[],
                total_amount=shop.default_water if shop.fixed else Decimal('0'),
                expiry_date='',
            )
        elif settings.auto_financial_year:
            n = existing_shop_notes[shop.id]
            m = re.match(r'^IWD/\d{2}-\d{2}/(\d+)$', n.note_no or '')
            if m:
                expected_note_no = f"{prefix}{m.group(1)}"
                if n.note_no != expected_note_no:
                    n.note_no = expected_note_no
                    n.save(update_fields=['note_no'])

    resequence_shop_note_numbers(cycle_month)

    # 2. Contractors
    contractors = list(Contractor.objects.filter(is_active=True).order_by('sl', 'id'))
    existing_contractor_notes = {
        n.contractor_id: n for n in ContractorDemandNote.objects.filter(cycle_month=cycle_month)
    }
    shops_count = len(shops)
    for contractor in contractors:
        if contractor.id not in existing_contractor_notes:
            # Contractor note numbers are assigned manually by Estate Office
            note_no = ''
            # Copy meters template from previous cycle or defaults
            prev_note = ContractorDemandNote.objects.filter(contractor=contractor).order_by('-cycle_month').first()
            if prev_note and prev_note.meters:
                meters_template = [
                    {'label': m.get('label', ''), 'current': '', 'previous': '', 'rate': m.get('rate', 9.55)}
                    for m in prev_note.meters
                ]
            else:
                default_tmpl = CONTRACTOR_DEFAULT_METERS.get(
                    contractor.sl,
                    [{'label': '', 'current': '', 'previous': '', 'rate': 9.55}]
                )
                meters_template = [
                    {'label': m.get('label', ''), 'current': '', 'previous': '', 'rate': m.get('rate', 9.55)}
                    for m in default_tmpl
                ]

            ContractorDemandNote.objects.create(
                contractor=contractor,
                cycle_month=cycle_month,
                period_type='month',
                date=today_str,
                month=prev_m,
                month_to='',
                note_no=note_no,
                meters=meters_template,
                total_amount=Decimal('0'),
            )
        elif settings.auto_financial_year:
            n = existing_contractor_notes[contractor.id]
            m = re.match(r'^IWD/\d{2}-\d{2}/(\d+)$', n.note_no or '')
            if m:
                expected_note_no = f"{prefix}{m.group(1)}"
                if n.note_no != expected_note_no:
                    n.note_no = expected_note_no
                    n.save(update_fields=['note_no'])


def get_current_cycle(request):
    cycle = request.query_params.get('cycle')
    if cycle and len(cycle) == 7:
        ensure_cycle_notes(cycle)
        return cycle

    latest = BillingCycle.objects.filter(is_active=True).first()
    if latest:
        cycle = latest.month
    else:
        cycle = datetime.date.today().strftime('%Y-%m')

    ensure_cycle_notes(cycle)
    return cycle


class ShopListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_estate_allowed(request.user):
            return Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        cycle = get_current_cycle(request)
        notes = (
            ShopDemandNote.objects.filter(cycle_month=cycle, shop__is_active=True)
            .select_related('shop')
            .order_by('shop__sl', 'id')
        )
        serializer = ShopDemandNoteSerializer(notes, many=True)
        return Response(serializer.data)

    def post(self, request):
        if not is_estate_write_allowed(request.user):
            return Response({'error': 'Admin has view-only access. Only Estate Office can create shops.'}, status=status.HTTP_403_FORBIDDEN)

        name = (request.data.get('name') or '').strip()
        if not name:
            return Response({'error': 'name is required'}, status=status.HTTP_400_BAD_REQUEST)

        address = request.data.get('address') or 'Academic Block No-1,\nIIT Gandhinagar Campus,\nPalaj, Gandhinagar - 382 355'
        fixed = bool(request.data.get('fixed', False))
        rate = Decimal(str(request.data.get('rate') or '9.55'))
        water = Decimal(str(request.data.get('water') or '320.00'))
        expiry_date = str(request.data.get('expiryDate') or request.data.get('expiry_date') or '').strip()

        cycle = request.data.get('cycle') or get_current_cycle(request)

        with transaction.atomic():
            max_sl = Shop.objects.aggregate(m=Max('sl'))['m'] or 0
            shop = Shop.objects.create(
                sl=max_sl + 1,
                name=name,
                address=address,
                fixed=fixed,
                default_rate=rate,
                default_water=water,
                expiry_date=expiry_date,
                is_active=True,
            )

            settings = EstateSettings.get_settings()
            prefix = settings.get_effective_prefix(cycle)
            note_no = f"{prefix}{settings.first_note_no + shop.sl - 1}"
            today_str = get_today_iso()
            prev_m = get_prev_month(today_str)

            note, created = ShopDemandNote.objects.get_or_create(
                shop=shop,
                cycle_month=cycle,
                defaults={
                    'date': today_str,
                    'month': prev_m,
                    'note_no': note_no,
                    'units': '',
                    'rate': rate,
                    'water': water,
                    'fixed': fixed,
                    'extras': [],
                    'total_amount': water if fixed else Decimal('0'),
                    'expiry_date': expiry_date,
                }
            )
            resequence_all_cycles_from(cycle)
            note.refresh_from_db()

        return Response(ShopDemandNoteSerializer(note).data, status=status.HTTP_201_CREATED)

    def patch(self, request):
        """Bulk update date / billing month for all shops in the cycle."""
        if not is_estate_write_allowed(request.user):
            return Response({'error': 'Admin has view-only access. Only Estate Office can modify billing notes.'}, status=status.HTTP_403_FORBIDDEN)

        cycle = get_current_cycle(request)
        updates = {}
        if 'date' in request.data:
            updates['date'] = request.data['date']
        if 'month' in request.data:
            updates['month'] = request.data['month']
        if 'monthTo' in request.data:
            updates['month_to'] = request.data['monthTo']
        if 'expiryDate' in request.data:
            updates['expiry_date'] = str(request.data['expiryDate'] or '').strip()
        elif 'expiry_date' in request.data:
            updates['expiry_date'] = str(request.data['expiry_date'] or '').strip()

        if not updates:
            return Response({'error': 'No update fields provided'}, status=status.HTTP_400_BAD_REQUEST)

        count = ShopDemandNote.objects.filter(cycle_month=cycle, shop__is_active=True).update(**updates)
        return Response({'ok': True, 'modified': count})


class ShopDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if not is_estate_write_allowed(request.user):
            return Response({'error': 'Admin has view-only access. Only Estate Office can modify shop details.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            note = ShopDemandNote.objects.select_related('shop').get(pk=pk)
        except ShopDemandNote.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        data = request.data
        if 'name' in data and data['name'].strip():
            note.shop.name = data['name'].strip()
            note.shop.save(update_fields=['name'])
        if 'address' in data:
            note.shop.address = data['address']
            note.shop.save(update_fields=['address'])
        if 'fixed' in data:
            note.fixed = bool(data['fixed'])
            note.shop.fixed = note.fixed
            note.shop.save(update_fields=['fixed'])
        if 'expiryDate' in data or 'expiry_date' in data:
            exp = str(data.get('expiryDate') if 'expiryDate' in data else data.get('expiry_date') or '').strip()
            note.expiry_date = exp
            note.save(update_fields=['expiry_date'])
        if 'shopExpiryDate' in data or 'shop_expiry_date' in data:
            s_exp = str(data.get('shopExpiryDate') if 'shopExpiryDate' in data else data.get('shop_expiry_date') or '').strip()
            note.shop.expiry_date = s_exp
            note.shop.save(update_fields=['expiry_date'])

        if 'units' in data:
            note.units = str(data['units']).strip()
        if 'rate' in data:
            note.rate = Decimal(str(data['rate'] or 0))
        if 'water' in data:
            note.water = Decimal(str(data['water'] or 0))
        if 'noteNo' in data:
            note.note_no = str(data['noteNo'])
        if 'date' in data:
            note.date = str(data['date'])
        if 'month' in data:
            note.month = str(data['month'])
        if 'monthTo' in data:
            note.month_to = str(data['monthTo'])
        if 'extras' in data and isinstance(data['extras'], list):
            note.extras = [
                {'label': str(x.get('label', '')), 'amount': str(x.get('amount', ''))}
                for x in data['extras']
            ]

        if 'isCancelled' in data or 'is_cancelled' in data:
            c_val = bool(data.get('isCancelled') if 'isCancelled' in data else data.get('is_cancelled'))
            note.is_cancelled = c_val
            if c_val:
                note.note_no = 'CANCELLED'
                note.total_amount = Decimal('0.00')
            else:
                note.total_amount = calculate_shop_total(
                    note.units, note.rate, note.water, note.fixed, note.extras
                )
            note.save(update_fields=['is_cancelled', 'note_no', 'total_amount'])
            resequence_all_cycles_from(note.cycle_month)
            note.refresh_from_db()

        if note.is_cancelled:
            note.total_amount = Decimal('0.00')
        else:
            note.total_amount = calculate_shop_total(
                note.units, note.rate, note.water, note.fixed, note.extras
            )
        note.save()

        return Response(ShopDemandNoteSerializer(note).data)

    def delete(self, request, pk):
        if not is_estate_write_allowed(request.user):
            return Response({'error': 'Admin has view-only access. Only Estate Office can delete shops.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            note = ShopDemandNote.objects.select_related('shop').get(pk=pk)
        except ShopDemandNote.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        shop = note.shop
        deleted_sl = shop.sl
        cycle_month = note.cycle_month
        shop.is_active = False
        shop.save(update_fields=['is_active'])

        if deleted_sl:
            Shop.objects.filter(is_active=True, sl__gt=deleted_sl).update(sl=F('sl') - 1)
            resequence_all_cycles_from(cycle_month)

        return Response({'ok': True})


class ContractorListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_estate_allowed(request.user):
            return Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        cycle = get_current_cycle(request)
        notes = (
            ContractorDemandNote.objects.filter(cycle_month=cycle, contractor__is_active=True)
            .select_related('contractor')
            .order_by('contractor__sl', 'id')
        )
        serializer = ContractorDemandNoteSerializer(notes, many=True)
        return Response(serializer.data)

    def post(self, request):
        if not is_estate_write_allowed(request.user):
            return Response({'error': 'Admin has view-only access. Only Estate Office can create contractors.'}, status=status.HTTP_403_FORBIDDEN)

        name = (request.data.get('name') or '').strip()
        if not name:
            return Response({'error': 'name is required'}, status=status.HTTP_400_BAD_REQUEST)

        to_line = (request.data.get('toLine') or '').strip()
        address = request.data.get('address') or 'IITGN Project Circle, Palaj\nGandhinagar-382355'
        intro = request.data.get('intro') or 'Reimbursement of power consumption charges borne by the Institute for utilization of the premises:'
        meters = request.data.get('meters') or [{'label': '', 'current': '', 'previous': '', 'rate': 9.55}]

        cycle = request.data.get('cycle') or get_current_cycle(request)

        with transaction.atomic():
            max_sl = Contractor.objects.aggregate(m=Max('sl'))['m'] or 0
            contractor = Contractor.objects.create(
                sl=max_sl + 1,
                name=name,
                to_line=to_line,
                address=address,
                intro=intro,
                is_active=True,
            )

            settings = EstateSettings.get_settings()
            prefix = settings.get_effective_prefix(cycle)
            shops_count = Shop.objects.filter(is_active=True).count()
            note_no = f"{prefix}{settings.first_note_no + shops_count + contractor.sl - 1}"
            today_str = get_today_iso()
            prev_m = get_prev_month(today_str)

            note, created = ContractorDemandNote.objects.get_or_create(
                contractor=contractor,
                cycle_month=cycle,
                defaults={
                    'period_type': 'month',
                    'date': today_str,
                    'month': prev_m,
                    'note_no': note_no,
                    'meters': meters,
                    'total_amount': calculate_contractor_total(meters),
                }
            )

        return Response(ContractorDemandNoteSerializer(note).data, status=status.HTTP_201_CREATED)

    def patch(self, request):
        """Bulk update date / billing month for all contractors in the cycle."""
        if not is_estate_write_allowed(request.user):
            return Response({'error': 'Admin has view-only access. Only Estate Office can modify billing notes.'}, status=status.HTTP_403_FORBIDDEN)

        cycle = get_current_cycle(request)
        updates = {}
        if 'date' in request.data:
            updates['date'] = request.data['date']
        if 'month' in request.data:
            updates['month'] = request.data['month']
        if 'monthTo' in request.data:
            updates['month_to'] = request.data['monthTo']

        if not updates:
            return Response({'error': 'No update fields provided'}, status=status.HTTP_400_BAD_REQUEST)

        count = ContractorDemandNote.objects.filter(cycle_month=cycle, contractor__is_active=True).update(**updates)
        return Response({'ok': True, 'modified': count})


class ContractorDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if not is_estate_write_allowed(request.user):
            return Response({'error': 'Admin has view-only access. Only Estate Office can modify contractor details.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            note = ContractorDemandNote.objects.select_related('contractor').get(pk=pk)
        except ContractorDemandNote.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        data = request.data
        if 'name' in data and data['name'].strip():
            note.contractor.name = data['name'].strip()
            note.contractor.save(update_fields=['name'])
        if 'toLine' in data:
            note.contractor.to_line = str(data['toLine']).strip()
            note.contractor.save(update_fields=['to_line'])
        if 'address' in data:
            note.contractor.address = data['address']
            note.contractor.save(update_fields=['address'])
        if 'intro' in data:
            note.contractor.intro = data['intro']
            note.contractor.save(update_fields=['intro'])

        if 'noteNo' in data:
            note.note_no = str(data['noteNo'])
        if 'date' in data:
            note.date = str(data['date'])
        if 'periodType' in data:
            note.period_type = str(data['periodType'])
        if 'month' in data:
            note.month = str(data['month'])
        if 'monthTo' in data:
            note.month_to = str(data['monthTo'])
        if 'from' in data or 'from_date' in data:
            note.from_date = str(data.get('from', data.get('from_date', '')))
        if 'to' in data or 'to_date' in data:
            note.to_date = str(data.get('to', data.get('to_date', '')))
        if 'meters' in data and isinstance(data['meters'], list):
            note.meters = data['meters']

        note.total_amount = calculate_contractor_total(note.meters)
        note.save()

        return Response(ContractorDemandNoteSerializer(note).data)

    def delete(self, request, pk):
        if not is_estate_write_allowed(request.user):
            return Response({'error': 'Admin has view-only access. Only Estate Office can delete contractors.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            note = ContractorDemandNote.objects.select_related('contractor').get(pk=pk)
        except ContractorDemandNote.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        contractor = note.contractor
        contractor.is_active = False
        contractor.save(update_fields=['is_active'])
        return Response({'ok': True})


class SettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_estate_allowed(request.user):
            return Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        settings = EstateSettings.get_settings()
        serializer = EstateSettingsSerializer(settings)
        return Response(serializer.data)

    def put(self, request):
        return self.update_settings(request)

    def patch(self, request):
        return self.update_settings(request)

    def update_settings(self, request):
        if not is_estate_write_allowed(request.user):
            return Response({'error': 'Admin has view-only access. Only Estate Office can update settings.'}, status=status.HTTP_403_FORBIDDEN)
        settings = EstateSettings.get_settings()
        serializer = EstateSettingsSerializer(settings, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class SettingsTestEmailView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not is_estate_allowed(request.user):
            return Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        email = (request.data.get('email') or request.data.get('testRecipientEmail') or '').strip()
        if not email:
            settings_obj = EstateSettings.get_settings()
            email = (settings_obj.test_recipient_email or '').strip()

        if not email:
            return Response({'error': 'Please enter a test email address first.'}, status=status.HTTP_400_BAD_REQUEST)

        ok, msg = send_test_email(email, triggered_by=request.user)
        if ok:
            return Response({'success': True, 'message': f'Test automated no-reply email queued for {email}.'})
        return Response({'error': msg}, status=status.HTTP_400_BAD_REQUEST)


class ToggleClearanceAlertsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_clearance_allowed(request.user):
            return Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        settings_obj = EstateSettings.get_settings()
        return Response({
            'enabled': settings_obj.enable_email_alerts,
            'testRecipientEmail': settings_obj.test_recipient_email,
        })

    def post(self, request):
        if not is_clearance_allowed(request.user):
            return Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        settings_obj = EstateSettings.get_settings()
        if 'enabled' in request.data:
            settings_obj.enable_email_alerts = bool(request.data['enabled'])
        else:
            settings_obj.enable_email_alerts = not settings_obj.enable_email_alerts
        settings_obj.save(update_fields=['enable_email_alerts'])
        return Response({
            'enabled': settings_obj.enable_email_alerts,
            'message': f"Automated email alerts {'ENABLED' if settings_obj.enable_email_alerts else 'DISABLED'} successfully."
        })


class BillingCycleListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_estate_allowed(request.user):
            return Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        cycles = BillingCycle.objects.all().order_by('-month')
        return Response(BillingCycleSerializer(cycles, many=True).data)

    def post(self, request):
        if not is_estate_write_allowed(request.user):
            return Response({'error': 'Admin has view-only access. Only Estate Office can create billing cycles.'}, status=status.HTTP_403_FORBIDDEN)
        month = (request.data.get('month') or '').strip()
        if not month or len(month) != 7:
            return Response({'error': 'Valid month formatted YYYY-MM is required'}, status=status.HTTP_400_BAD_REQUEST)

        label = request.data.get('label') or month
        cycle, created = BillingCycle.objects.get_or_create(
            month=month,
            defaults={'label': label, 'is_active': True}
        )
        ensure_cycle_notes(month)
        return Response(BillingCycleSerializer(cycle).data, status=status.HTTP_201_CREATED)


INITIAL_HOUSING_RECORDS = [
    {
        'sl': 1, 'house_type': 'A', 'house_no': '01/101',
        'occupant_name': 'Gaurav Srivastava', 'empl_code': '0136',
        'designation': 'Professor', 'email': 'gauravs@iitgn.ac.in',
        'date_of_occupation': '8-Jun-26', 'al_issue_date': '8-Jun-26',
        'date_of_expiry': 'PoE/Relocation, whichever is earlier',
    },
    {
        'sl': 2, 'house_type': 'A', 'house_no': '01/102',
        'occupant_name': 'S. P. Mehrotra', 'empl_code': 'C0101',
        'designation': 'Visiting Professor', 'email': 'spm@iitgn.ac.in',
        'date_of_occupation': '1-Mar-16', 'al_issue_date': '-',
        'date_of_expiry': 'On Cotract till 03-July-26',
    },
    {
        'sl': 3, 'house_type': 'A', 'house_no': '01/103',
        'occupant_name': 'Jaison A Manjaly', 'empl_code': '0006',
        'designation': 'Professor', 'email': 'jmanjaly@iitgn.ac.in',
        'date_of_occupation': '6-Apr-22', 'al_issue_date': '4-Apr-22',
        'date_of_expiry': 'PoE/Relocation, whichever is earlier',
    },
    {
        'sl': 4, 'house_type': 'A', 'house_no': '01/201',
        'occupant_name': 'Naran Manji Pindoriya', 'empl_code': '0045',
        'designation': 'Professor', 'email': 'naran@iitgn.ac.in',
        'date_of_occupation': '2-Jun-25', 'al_issue_date': '26-May-25',
        'date_of_expiry': 'PoE/Relocation, whichever is earlier',
    },
    {
        'sl': 5, 'house_type': 'A', 'house_no': '01/202',
        'occupant_name': 'Sriram Kanvah Gundimeda', 'empl_code': '0025',
        'designation': 'Professor', 'email': 'sriram@iitgn.ac.in',
        'date_of_occupation': '26-Dec-24', 'al_issue_date': '23-Dec-24',
        'date_of_expiry': 'PoE/Relocation, whichever is earlier',
    },
    {
        'sl': 6, 'house_type': 'A', 'house_no': '01/203',
        'occupant_name': 'Kasivisvanathan Chelvakumar', 'empl_code': 'C0223',
        'designation': 'Professor of Practice', 'email': 'chelva@iitgn.ac.in',
        'date_of_occupation': '17-Jan-25', 'al_issue_date': '15-Apr-25',
        'date_of_expiry': '16-Jan-27',
    },
    {
        'sl': 7, 'house_type': 'A', 'house_no': '01/301',
        'occupant_name': 'Atul Abhay Dixit', 'empl_code': '0213',
        'designation': 'Professor', 'email': 'adixit@iitgn.ac.in',
        'date_of_occupation': '30-Jan-26', 'al_issue_date': '30-Jan-26',
        'date_of_expiry': 'PoE/Relocation, whichever is earlier',
    },
    {
        'sl': 8, 'house_type': 'A', 'house_no': '01/302',
        'occupant_name': 'Harish PM', 'empl_code': '0079',
        'designation': 'Professor', 'email': 'harish@iitgn.ac.in',
        'date_of_occupation': '27-Dec-24', 'al_issue_date': '23-Dec-24',
        'date_of_expiry': 'PoE/Relocation, whichever is earlier',
    },
    {
        'sl': 9, 'house_type': 'A', 'house_no': '01/303',
        'occupant_name': 'Anand Kamal Pandey', 'empl_code': 'CPWD',
        'designation': 'SE & PD, CPWD', 'email': 'pandey.ak20@gov.in',
        'date_of_occupation': '1-Sep-25', 'al_issue_date': '18-Aug-25',
        'date_of_expiry': '31-Aug-26',
    },
    {
        'sl': 10, 'house_type': 'A', 'house_no': '02/101',
        'occupant_name': 'Prem Chand Pandey', 'empl_code': 'C0499',
        'designation': 'Visiting Professor', 'email': 'pcpandey@iitgn.ac.in',
        'date_of_occupation': '1-Jul-24', 'al_issue_date': '28-Jun-24',
        'date_of_expiry': 'On Cotract till 30-June-26',
    },
    {
        'sl': 11, 'house_type': 'A', 'house_no': '02/102',
        'occupant_name': 'Atul Bhargav', 'empl_code': '0063',
        'designation': 'Professor', 'email': 'atul.bhargav@iitgn.ac.in',
        'date_of_occupation': '22-Apr-22', 'al_issue_date': '6-Apr-22',
        'date_of_expiry': 'PoE/Relocation, whichever is earlier',
    },
    {
        'sl': 12, 'house_type': 'A', 'house_no': '02/103',
        'occupant_name': 'Vimal Mishra', 'empl_code': '0114',
        'designation': 'Professor', 'email': 'ymishra@iitgn.ac.in',
        'date_of_occupation': '19-Apr-22', 'al_issue_date': '21-Mar-22',
        'date_of_expiry': 'PoE/Relocation, whichever is earlier',
    },
    {
        'sl': 13, 'house_type': 'A', 'house_no': '02/201',
        'occupant_name': 'Tanka Bahadur Subba', 'empl_code': 'C0503',
        'designation': 'Visiting Professor', 'email': 'tanka.subba@iitgn.ac.in',
        'date_of_occupation': '19-Jul-24', 'al_issue_date': '09-Jul-24',
        'date_of_expiry': 'On Cotract till 18-July-27',
    },
]


def ensure_master_housing_inventory():
    """Seeds the fixed 435 quarters from Google Sheet and maps active allotments."""
    if not HousingUnit.objects.exists():
        units_to_create = []
        for item in MASTER_HOUSING_UNITS:
            h_type = item.get('house_type', 'A').strip().upper()
            h_no = item.get('house_no', '').strip()
            block_no = h_no.split('/')[0] if '/' in h_no else ''
            floor_val = h_no.split('/')[1][0] if '/' in h_no and len(h_no.split('/')[1]) > 0 else '1'
            units_to_create.append(
                HousingUnit(
                    house_type=h_type,
                    house_no=h_no,
                    block_no=block_no,
                    floor=floor_val,
                    status=HousingUnit.Status.VACANT,
                )
            )
        HousingUnit.objects.bulk_create(units_to_create, ignore_conflicts=True)

    # Seed initial official active allotments if no allotments exist
    if not HousingAllotment.objects.filter(is_active=True).exists():
        from .housing_allotments_data import OFFICIAL_HOUSING_REGISTER
        for item in OFFICIAL_HOUSING_REGISTER:
            if item.get('is_vacant'):
                continue
            h_type = item.get('house_type', 'A')
            h_no = item.get('house_no', '')
            unit = HousingUnit.objects.filter(house_type=h_type, house_no=h_no).first()
            data_to_save = {k: v for k, v in item.items() if k != 'is_vacant'}
            HousingAllotment.objects.create(
                unit=unit,
                is_current=True,
                status=HousingAllotment.Status.OCCUPIED,
                **data_to_save
            )
            if unit:
                unit.status = HousingUnit.Status.OCCUPIED
                unit.save(update_fields=['status'])
    else:
        # Link any existing unlinked allotments to their units
        for a in HousingAllotment.objects.filter(unit__isnull=True, is_active=True):
            unit = HousingUnit.objects.filter(house_type=a.house_type, house_no=a.house_no).first()
            if unit:
                a.unit = unit
                a.save(update_fields=['unit'])
                if a.is_current:
                    unit.status = HousingUnit.Status.OCCUPIED
                    unit.save(update_fields=['status'])


class HousingUnitListView(APIView):
    """Lists all fixed campus housing units with availability and current occupant."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (is_estate_allowed(request.user) or is_clearance_allowed(request.user)):
            return Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        ensure_master_housing_inventory()
        is_light = request.query_params.get('light', 'false').lower() == 'true'
        if is_light:
            qs = HousingUnit.objects.filter(is_active=True).order_by('house_type', 'house_no')
        else:
            qs = HousingUnit.objects.filter(is_active=True).prefetch_related('allotments').order_by('house_type', 'house_no')

        house_type = request.query_params.get('house_type')
        if house_type and house_type != 'all':
            qs = qs.filter(house_type__iexact=house_type)

        unit_status = request.query_params.get('status')
        if unit_status and unit_status != 'all':
            qs = qs.filter(status=unit_status)

        search = request.query_params.get('search')
        if search:
            s = search.strip()
            qs = qs.filter(
                models.Q(house_no__icontains=s) |
                models.Q(block_no__icontains=s) |
                models.Q(allotments__occupant_name__icontains=s, allotments__is_current=True) |
                models.Q(allotments__empl_code__icontains=s, allotments__is_current=True)
            ).distinct()

        if is_light:
            serializer = LightHousingUnitSerializer(qs, many=True)
        else:
            serializer = HousingUnitSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        if not is_estate_write_allowed(request.user):
            return Response({'error': 'Admin has view-only access. Only Estate Office can add houses.'}, status=status.HTTP_403_FORBIDDEN)
        ensure_master_housing_inventory()
        h_type = (request.data.get('houseType') or request.data.get('house_type') or 'A').strip().upper()
        h_no = (request.data.get('houseNo') or request.data.get('house_no') or '').strip()
        if not h_no:
            return Response({'error': 'House number is required.'}, status=status.HTTP_400_BAD_REQUEST)

        unit, created = HousingUnit.objects.get_or_create(
            house_type=h_type,
            house_no=h_no,
            defaults={
                'block_no': h_no.split('/')[0] if '/' in h_no else '',
                'floor': h_no.split('/')[1][0] if '/' in h_no and len(h_no.split('/')[1]) > 0 else '1',
                'status': HousingUnit.Status.VACANT,
            }
        )
        if not created:
            return Response({'error': f"House {h_type} {h_no} already exists in the list."}, status=status.HTTP_400_BAD_REQUEST)
        return Response(HousingUnitSerializer(unit).data, status=status.HTTP_201_CREATED)


def rebalance_active_priorities(target_obj=None, new_priority=None):
    """
    Ensures active in-progress clearances have a clean, collision-free,
    gapless 1..N priority sequence.
    Completed and cancelled clearances ALWAYS have priority = ''.
    """
    with transaction.atomic():
        # 1. Any officially allotted or cancelled clearance must have priority cleared
        HousingClearance.objects.filter(
            models.Q(is_allotted=True) | models.Q(status='cancelled')
        ).exclude(priority='').update(priority='')

        # 2. Fetch all active un-allotted clearances
        active_list = list(
            HousingClearance.objects.filter(
                is_active=True,
                is_allotted=False
            ).exclude(status='cancelled').order_by('id')
        )

        if not active_list:
            return

        # 3. Determine target numerical priority if target_obj is provided
        target_p = None
        if target_obj and new_priority is not None:
            raw_p = str(new_priority).strip()
            if raw_p.isdigit() and int(raw_p) > 0:
                target_p = int(raw_p)

        # Separate items that currently have priorities vs unprioritized
        prioritized = []
        unprioritized = []

        for c in active_list:
            if target_obj and c.id == target_obj.id:
                continue
            val = str(c.priority or '').strip()
            if val.isdigit() and int(val) > 0:
                prioritized.append((int(val), c))
            else:
                unprioritized.append(c)

        # Sort prioritized by numerical priority
        prioritized.sort(key=lambda x: x[0])

        new_ordered = []
        if target_obj and target_p is not None:
            # Insert target at target_p position
            inserted = False
            for p, item in prioritized:
                if not inserted and target_p <= p:
                    new_ordered.append(target_obj)
                    inserted = True
                new_ordered.append(item)
            if not inserted:
                new_ordered.append(target_obj)
        elif target_obj and target_p is None:
            # Explicitly removing target priority
            target_obj.priority = ''
            target_obj.save(update_fields=['priority'])
            new_ordered = [item for _, item in prioritized]
        else:
            new_ordered = [item for _, item in prioritized]

        # 4. Re-normalize to 1, 2, 3...
        for rank, item in enumerate(new_ordered, start=1):
            rank_str = str(rank)
            if item.priority != rank_str:
                item.priority = rank_str
                item.save(update_fields=['priority'])

        # 5. Clear priority on any remaining unprioritized items
        for item in unprioritized:
            if item.priority != '':
                item.priority = ''
                item.save(update_fields=['priority'])


class HousingListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_estate_allowed(request.user):
            return Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        ensure_master_housing_inventory()
        qs = HousingAllotment.objects.filter(is_active=True)

        include_vacated = request.query_params.get('include_vacated', 'false').lower() == 'true'
        if not include_vacated:
            qs = qs.filter(is_current=True)

        house_type = request.query_params.get('house_type')
        if house_type and house_type != 'all':
            qs = qs.filter(house_type__iexact=house_type)

        search = request.query_params.get('search')
        if search:
            s = search.strip()
            qs = qs.filter(
                models.Q(occupant_name__icontains=s) |
                models.Q(house_no__icontains=s) |
                models.Q(empl_code__icontains=s) |
                models.Q(designation__icontains=s) |
                models.Q(email__icontains=s)
            )

        qs = qs.order_by('sl', 'id')
        serializer = HousingAllotmentSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        if not is_estate_write_allowed(request.user):
            return Response({'error': 'Admin has view-only access. Only Estate Office can allot housing.'}, status=status.HTTP_403_FORBIDDEN)
        ensure_master_housing_inventory()
        data = request.data.copy()

        h_type = (data.get('houseType') or data.get('house_type') or 'A').strip().upper()
        h_no = (data.get('houseNo') or data.get('house_no') or '').strip()

        if not h_no:
            return Response({'error': 'House Number is required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Lookup the unit in fixed inventory
        unit, _ = HousingUnit.objects.get_or_create(
            house_type=h_type,
            house_no=h_no,
            defaults={
                'block_no': h_no.split('/')[0] if '/' in h_no else '',
                'floor': h_no.split('/')[1][0] if '/' in h_no and len(h_no.split('/')[1]) > 0 else '1',
                'status': HousingUnit.Status.VACANT,
            }
        )

        has_already_left = bool(
            data.get('hasAlreadyLeft') or
            data.get('has_already_left') or
            data.get('isEarlierRecord') or
            data.get('is_earlier_record') or
            False
        )
        date_of_vacation = data.get('dateOfVacation') or data.get('date_of_vacation') or ''

        # If entering a historical/earlier stay:
        if has_already_left:
            if 'sl' not in data or not data['sl']:
                max_sl = HousingAllotment.objects.aggregate(m=Max('sl'))['m'] or 0
                data['sl'] = max_sl + 1
            data['house_type'] = h_type
            data['house_no'] = h_no

            serializer = HousingAllotmentSerializer(data=data)
            if serializer.is_valid():
                with transaction.atomic():
                    allotment = serializer.save(
                        unit=unit,
                        is_current=False,
                        status=HousingAllotment.Status.VACATED,
                        date_of_vacation=date_of_vacation or datetime.date.today().strftime('%d-%b-%y')
                    )
                return Response(HousingAllotmentSerializer(allotment).data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # STRICT OCCUPATION RULE: unit must be vacant to be allotted!
        if unit.status == HousingUnit.Status.OCCUPIED:
            curr = unit.current_allotment
            curr_name = curr.occupant_name if curr else "another occupant"
            return Response(
                {'error': f"House {h_no} (Type {h_type}) is currently OCCUPIED by {curr_name}. A unit can only be allotted when it is vacant. Please vacate or relocate the existing occupant first."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if unit.status == HousingUnit.Status.UNDER_MAINTENANCE:
            return Response(
                {'error': f"House {h_no} (Type {h_type}) is currently UNDER MAINTENANCE and cannot be allotted."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if unit.status == HousingUnit.Status.UNDER_CLEARANCE:
            existing = HousingClearance.objects.filter(unit=unit, is_active=True, is_allotted=False).first()
            allottee = existing.allottee_name if existing else "an allottee"
            return Response(
                {'error': f"House {h_no} (Type {h_type}) is already under clearance for {allottee} in Housing Status pipeline."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Standard Campus Allotment Workflow -> Initiate Clearance Pipeline (Option A)
        with transaction.atomic():
            max_sr = HousingClearance.objects.aggregate(m=Max('sr_no'))['m'] or 0
            today_str = datetime.date.today().strftime('%d-%b-%Y')
            raw_t = h_type.replace('Type', '').strip()
            formatted_type = f"Type {raw_t}" if not h_type.startswith('Type') else h_type

            p_val = str(data.get('priority') or '').strip()
            key_date = str(data.get('keyHandedOverDate') or data.get('key_handed_over_date') or '').strip()
            occupant_name = str(data.get('occupantName') or data.get('occupant_name') or '').strip()
            empl_code = str(data.get('emplCode') or data.get('empl_code') or '').strip()
            desig = str(data.get('designation') or '').strip()
            email = str(data.get('email') or '').strip()
            date_of_expiry = str(data.get('dateOfExpiry') or data.get('date_of_expiry') or '').strip()
            al_issue = str(data.get('alIssueDate') or data.get('al_issue_date') or '').strip()
            time_stamp = al_issue if al_issue else today_str
            rem = f"Allotment initiated for {occupant_name}" + (f" ({desig})" if desig else "") + (". Key handed to Civil." if key_date else ". Awaiting key handover to Civil.")

            clearance = HousingClearance.objects.create(
                unit=unit,
                sr_no=max_sr + 1,
                house_type=formatted_type,
                house_no=h_no,
                allottee_name=occupant_name,
                empl_code=empl_code,
                designation=desig,
                email=email,
                date_of_expiry=date_of_expiry,
                time_stamp=time_stamp,
                key_handed_over_date=key_date,
                estate_date_1=al_issue,
                priority='',
                status=HousingClearance.Status.IN_PROGRESS,
                remarks=rem,
            )

            unit.status = HousingUnit.Status.UNDER_CLEARANCE
            unit.save(update_fields=['status'])

            if p_val:
                rebalance_active_priorities(clearance, p_val)
                clearance.refresh_from_db()

            msg_suffix = "Key handed to Civil team." if key_date else "Please hand over keys to Civil team in Housing Status when ready."
            return Response({
                'success': True,
                'is_pipeline': True,
                'message': f"Allotment pipeline initiated for {formatted_type} {h_no} to {occupant_name}. {msg_suffix}",
                'clearance': HousingClearanceSerializer(clearance, context={'request': request}).data
            }, status=status.HTTP_201_CREATED)


class HousingDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, pk):
        try:
            return HousingAllotment.objects.get(pk=pk, is_active=True)
        except HousingAllotment.DoesNotExist:
            return None

    def get(self, request, pk):
        if not is_estate_allowed(request.user):
            return Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Housing record not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(HousingAllotmentSerializer(obj).data)

    def patch(self, request, pk):
        if not is_estate_write_allowed(request.user):
            return Response({'error': 'Admin has view-only access. Only Estate Office can update housing records.'}, status=status.HTTP_403_FORBIDDEN)
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Housing record not found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = HousingAllotmentSerializer(obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        if not is_estate_write_allowed(request.user):
            return Response({'error': 'Admin has view-only access. Only Estate Office can delete housing records.'}, status=status.HTTP_403_FORBIDDEN)
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Housing record not found'}, status=status.HTTP_404_NOT_FOUND)
        with transaction.atomic():
            obj.is_active = False
            obj.is_current = False
            obj.save(update_fields=['is_active', 'is_current'])
            if obj.unit:
                has_other = obj.unit.allotments.filter(is_active=True, is_current=True).exists()
                if not has_other:
                    obj.unit.status = HousingUnit.Status.VACANT
                    obj.unit.save(update_fields=['status'])
        return Response({'success': True, 'message': 'Housing allotment removed'}, status=status.HTTP_200_OK)


class HousingVacateView(APIView):
    """Vacate an occupied house."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not is_estate_write_allowed(request.user):
            return Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            allotment = HousingAllotment.objects.get(pk=pk, is_active=True)
        except HousingAllotment.DoesNotExist:
            return Response({'error': 'Allotment not found'}, status=status.HTTP_404_NOT_FOUND)

        vacation_date = request.data.get('dateOfVacation') or request.data.get('date_of_vacation') or datetime.date.today().strftime('%d-%b-%y')
        reason = request.data.get('vacationReason') or request.data.get('vacation_reason') or 'Tenure Completed / Vacated'
        new_unit_status = request.data.get('newStatus', HousingUnit.Status.VACANT)
        create_clearance = request.data.get('createClearance', False)
        if isinstance(create_clearance, str):
            create_clearance = create_clearance.lower() in ('true', '1', 'yes')

        with transaction.atomic():
            allotment.is_current = False
            allotment.status = HousingAllotment.Status.VACATED
            allotment.date_of_vacation = vacation_date
            allotment.vacation_reason = reason
            allotment.save(update_fields=['is_current', 'status', 'date_of_vacation', 'vacation_reason'])

            if allotment.unit:
                unit_status = HousingUnit.Status.UNDER_CLEARANCE if create_clearance else new_unit_status
                allotment.unit.status = unit_status
                allotment.unit.save(update_fields=['status'])

                if create_clearance:
                    existing = HousingClearance.objects.filter(unit=allotment.unit, is_active=True, is_allotted=False).first()
                    if not existing:
                        max_sr = HousingClearance.objects.aggregate(m=Max('sr_no'))['m'] or 0
                        today_str = datetime.date.today().strftime('%d-%b-%Y')
                        HousingClearance.objects.create(
                            unit=allotment.unit,
                            sr_no=max_sr + 1,
                            house_type=allotment.house_type if 'Type' in allotment.house_type else f"Type {allotment.house_type}",
                            house_no=allotment.house_no,
                            time_stamp=today_str,
                            status=HousingClearance.Status.IN_PROGRESS,
                            remarks=f"Vacated by {allotment.occupant_name} on {vacation_date}. Awaiting Estate handover to Civil.",
                        )

        return Response({
            'success': True,
            'message': f"House {allotment.house_no} successfully marked vacated.",
            'allotment': HousingAllotmentSerializer(allotment).data
        })


class HousingRelocateView(APIView):
    """Relocate an occupant from current house to a vacant house."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not is_estate_write_allowed(request.user):
            return Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            old_allotment = HousingAllotment.objects.get(pk=pk, is_active=True)
        except HousingAllotment.DoesNotExist:
            return Response({'error': 'Allotment not found'}, status=status.HTTP_404_NOT_FOUND)

        target_type = (request.data.get('targetHouseType') or old_allotment.house_type).strip().upper()
        target_no = (request.data.get('targetHouseNo') or '').strip()
        relocation_date = request.data.get('relocationDate') or datetime.date.today().strftime('%d-%b-%y')
        remarks = request.data.get('remarks') or ''

        if not target_no:
            return Response({'error': 'Target House Number is required for relocation.'}, status=status.HTTP_400_BAD_REQUEST)

        target_unit = HousingUnit.objects.filter(house_type=target_type, house_no=target_no, is_active=True).first()
        if not target_unit:
            return Response({'error': f"Target house {target_type} {target_no} does not exist in master inventory."}, status=status.HTTP_400_BAD_REQUEST)

        if target_unit.status == HousingUnit.Status.OCCUPIED:
            curr = target_unit.current_allotment
            curr_name = curr.occupant_name if curr else "another occupant"
            return Response({'error': f"Target house {target_no} is already OCCUPIED by {curr_name}. Cannot relocate into an occupied house."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            # 1. Close current allotment
            old_allotment.is_current = False
            old_allotment.status = HousingAllotment.Status.RELOCATED
            old_allotment.date_of_vacation = relocation_date
            old_allotment.vacation_reason = f"Relocated to {target_type} {target_no}"
            old_allotment.save(update_fields=['is_current', 'status', 'date_of_vacation', 'vacation_reason'])

            if old_allotment.unit:
                old_allotment.unit.status = HousingUnit.Status.VACANT
                old_allotment.unit.save(update_fields=['status'])

            # 2. Create new allotment in target unit
            max_sl = HousingAllotment.objects.aggregate(m=Max('sl'))['m'] or 0
            new_allotment = HousingAllotment.objects.create(
                unit=target_unit,
                sl=max_sl + 1,
                house_type=target_type,
                house_no=target_no,
                occupant_name=old_allotment.occupant_name,
                empl_code=old_allotment.empl_code,
                designation=old_allotment.designation,
                email=old_allotment.email,
                date_of_occupation=relocation_date,
                al_issue_date=relocation_date,
                date_of_expiry=old_allotment.date_of_expiry,
                status=HousingAllotment.Status.OCCUPIED,
                remarks=f"Relocated from {old_allotment.house_type} {old_allotment.house_no}. {remarks}".strip(),
                is_current=True,
                is_active=True,
            )

            target_unit.status = HousingUnit.Status.OCCUPIED
            target_unit.save(update_fields=['status'])

        return Response({
            'success': True,
            'message': f"Successfully relocated {old_allotment.occupant_name} from {old_allotment.house_no} to {target_no}.",
            'newAllotment': HousingAllotmentSerializer(new_allotment).data,
        })


class HousingHistoryView(APIView):
    """
    Returns audit trail and timeline:
    - By employee (empl_code or occupant_name): shows all rooms lived in, total room changes count!
    - By house (house_no or unit_id): shows occupancy timeline, past occupants, and vacancy intervals!
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_estate_allowed(request.user):
            return Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        ensure_master_housing_inventory()

        empl_code = request.query_params.get('empl_code', '').strip()
        occupant_name = request.query_params.get('occupant_name', '').strip()
        house_no = request.query_params.get('house_no', '').strip()
        house_type = request.query_params.get('house_type', '').strip().upper()
        unit_id = request.query_params.get('unit_id', '').strip()

        # 1. Audit trail for an Employee
        if empl_code or occupant_name:
            qs = HousingAllotment.objects.filter(is_active=True)
            if empl_code:
                qs = qs.filter(empl_code__iexact=empl_code)
            if occupant_name:
                qs = qs.filter(occupant_name__icontains=occupant_name)

            qs = qs.order_by('created_at', 'id')
            records = HousingAllotmentSerializer(qs, many=True).data
            total_records = len(records)
            room_changes = max(0, total_records - 1)
            current_house = next((r for r in records if r.get('isCurrent')), None)

            return Response({
                'queryType': 'employee',
                'emplCode': empl_code,
                'occupantName': occupant_name or (records[0]['occupantName'] if records else ''),
                'totalAllotments': total_records,
                'roomChangesCount': room_changes,
                'currentHouse': current_house,
                'history': records,
            })

        # 2. Timeline for a House / Room
        if house_no or unit_id:
            qs = HousingAllotment.objects.filter(is_active=True)
            if unit_id:
                qs = qs.filter(unit_id=unit_id)
            elif house_no:
                qs = qs.filter(house_no__iexact=house_no)
                if house_type and house_type != 'ALL':
                    qs = qs.filter(house_type__iexact=house_type)

            qs = qs.order_by('created_at', 'id')
            records = HousingAllotmentSerializer(qs, many=True).data

            unit = None
            if unit_id:
                unit = HousingUnit.objects.filter(id=unit_id).first()
            elif house_no:
                unit_qs = HousingUnit.objects.filter(house_no__iexact=house_no)
                if house_type and house_type != 'ALL':
                    unit_qs = unit_qs.filter(house_type__iexact=house_type)
                unit = unit_qs.first()

            unit_data = HousingUnitSerializer(unit).data if unit else None

            return Response({
                'queryType': 'house',
                'houseNo': house_no or (unit.house_no if unit else ''),
                'houseType': house_type or (unit.house_type if unit else ''),
                'unit': unit_data,
                'totalOccupantsCount': len(records),
                'history': records,
            })

        # 3. General recent movement history across campus
        recent = HousingAllotment.objects.filter(is_active=True).order_by('-updated_at')[:50]
        return Response({
            'queryType': 'overview',
            'recentMovements': HousingAllotmentSerializer(recent, many=True).data,
        })


INITIAL_CLEARANCES = [
    {
        'sr_no': 1, 'house_type': 'Type B', 'house_no': '27/103',
        'allottee_name': 'Dr Ajay', 'time_stamp': '6-Jul-2026',
        'key_handed_over_date': '6-Jul-2026', 'priority': '',
        'civil_key_received_date': '6-Jul-2026', 'civil_status': 'completed', 'civil_completed_date': '7-Jul-2026',
        'electrical_key_received_date': '7-Jul-2026', 'electrical_status': 'Completed', 'electrical_completed_date': '7-Jul-2026',
        'hk_handover_date': '13/07/2026 at 10:00 hrs', 'hk_status': 'Complted', 'hk_completed_date': '14/07/2026 at 14:55 hrs',
        'estate_date_1': '14-Jul-26', 'estate_date_2': '16-Jul-26', 'estate_date_3': '16-Jul-26', 'estate_date_4': '21-Jul-26',
        'remarks': 'The allotment of HB-27/103 was approved with effect from 26 June 2026',
        'status': 'completed', 'is_allotted': True,
    },
    {
        'sr_no': 2, 'house_type': 'Type A', 'house_no': '02/303',
        'allottee_name': 'Dr. Pratik', 'time_stamp': '6-Jul-2026',
        'key_handed_over_date': '6-Jul-2026', 'priority': '',
        'civil_key_received_date': '6-Jul-2026', 'civil_status': 'completed', 'civil_completed_date': '7-Jul-2026',
        'electrical_key_received_date': '7-Jul-2026', 'electrical_status': 'Completed', 'electrical_completed_date': '7-Jul-2026',
        'hk_handover_date': '17/07/2026 at 15:05 hrs', 'hk_status': 'Complted', 'hk_completed_date': '21/07/2026 at 17: 20 hrs',
        'estate_date_1': '22-Jul-26', 'estate_date_2': '22-Jul-26', 'estate_date_3': '27-Jul-26', 'estate_date_4': '30-Jul-26',
        'remarks': 'The allotment of HB-02/303 was approved with effect from 13 July 2026',
        'status': 'completed', 'is_allotted': True,
    },
    {
        'sr_no': 3, 'house_type': 'Type C', 'house_no': '13/301',
        'allottee_name': '', 'time_stamp': '6-Jul-2026',
        'key_handed_over_date': '6-Jul-2026', 'priority': '',
        'civil_key_received_date': '6-Jul-2026', 'civil_status': 'completed', 'civil_completed_date': '15-Jul-2026',
        'electrical_key_received_date': '15-Jul-2026', 'electrical_status': 'Completed', 'electrical_completed_date': '15-Jul-2026',
        'hk_handover_date': '21/07/2026 at 15:35 hrs', 'hk_status': 'Complted', 'hk_completed_date': '23/07/2026 at 17:30 hrs',
        'estate_date_1': '', 'estate_date_2': '', 'estate_date_3': '', 'estate_date_4': '',
        'remarks': '',
        'status': 'in_progress', 'is_allotted': False,
    },
    {
        'sr_no': 4, 'house_type': 'Type C', 'house_no': '20/203',
        'allottee_name': 'Dr. Soumendu', 'time_stamp': '3-Aug-2026',
        'key_handed_over_date': '3-Aug-2026', 'priority': '',
        'civil_key_received_date': '3-Aug-2026', 'civil_status': 'completed', 'civil_completed_date': '9-Aug-2026',
        'electrical_key_received_date': '9-Aug-2026', 'electrical_status': 'Completed', 'electrical_completed_date': '9-Aug-2026',
        'hk_handover_date': '10/08/2026 at 12:40 hrs', 'hk_status': 'Complted', 'hk_completed_date': '12/08/2026 at 14:30 hrs',
        'estate_date_1': '12-Aug-26', 'estate_date_2': '14-Aug-26', 'estate_date_3': '14-Aug-26', 'estate_date_4': '19-Aug-26',
        'remarks': 'The allotment of RB-20/203 was approved with effect from 10th August 2026',
        'status': 'completed', 'is_allotted': True,
    },
    {
        'sr_no': 5, 'house_type': 'Type C', 'house_no': '19/101',
        'allottee_name': 'HMC office', 'time_stamp': '3-Aug-2026',
        'key_handed_over_date': '3-Aug-2026', 'priority': '',
        'civil_key_received_date': '3-Aug-2026', 'civil_status': 'completed', 'civil_completed_date': '5-Aug-2026',
        'electrical_key_received_date': '5-Aug-2026', 'electrical_status': 'Completed', 'electrical_completed_date': '5-Aug-2026',
        'hk_handover_date': '07/08/2026 at 10:00 hrs', 'hk_status': 'Completed', 'hk_completed_date': '10/08/2026 at 09:55 hrs',
        'estate_date_1': '5-Aug-26', 'estate_date_2': '11-Aug-26', 'estate_date_3': '11-Aug-26', 'estate_date_4': '12-Aug-26',
        'remarks': 'NA',
        'status': 'completed', 'is_allotted': True,
    },
    {
        'sr_no': 6, 'house_type': 'Type A', 'house_no': '30/103',
        'allottee_name': 'Prof. Sivpriya', 'time_stamp': '3-Aug-2026',
        'key_handed_over_date': '3-Aug-2026', 'priority': '',
        'civil_key_received_date': '3-Aug-2026', 'civil_status': 'completed', 'civil_completed_date': '9-Sep-2026',
        'electrical_key_received_date': '9-Sep-2026', 'electrical_status': 'completed', 'electrical_completed_date': '9-Sep-2026',
        'hk_handover_date': '12/09/2026 at 11:00 hrs', 'hk_status': 'Completed', 'hk_completed_date': '15/09/2026 at 14:00 hrs',
        'estate_date_1': '19-Aug-26', 'estate_date_2': '21-Aug-26', 'estate_date_3': '21-Aug-26', 'estate_date_4': '25-Aug-26',
        'remarks': 'The allotment of RB-30/103 was approved with effect from 19th August 2026',
        'status': 'completed', 'is_allotted': True,
    },
    {
        'sr_no': 7, 'house_type': 'Type B', 'house_no': '25/201',
        'allottee_name': 'Dr Praharsh', 'time_stamp': '17/08/26',
        'key_handed_over_date': '17/08/26', 'priority': '',
        'civil_key_received_date': '17/08/26', 'civil_status': 'completed', 'civil_completed_date': '21-Sep-2026',
        'electrical_key_received_date': '9-Sep-2026', 'electrical_status': 'completed', 'electrical_completed_date': '9-Sep-2026',
        'hk_handover_date': '24/09/2026 at 17:00 hrs', 'hk_status': 'Completed', 'hk_completed_date': '28/09/2026 at 10:40 hrs',
        'estate_date_1': '29-Sep-26', 'estate_date_2': '1-Oct-26', 'estate_date_3': '1-Oct-26', 'estate_date_4': '7-Oct-26',
        'remarks': 'The allotment of RB-25/201 was approved with effect from 25th August 2026',
        'status': 'completed', 'is_allotted': True,
    },
    {
        'sr_no': 8, 'house_type': 'Type B', 'house_no': '23/301',
        'allottee_name': 'Dr Aditya', 'time_stamp': '25/08/26',
        'key_handed_over_date': '25/08/26', 'priority': '',
        'civil_key_received_date': '25/08/26', 'civil_status': 'completed', 'civil_completed_date': '9-Sep-2026',
        'electrical_key_received_date': '9-Sep-2026', 'electrical_status': 'completed', 'electrical_completed_date': '9-Sep-2026',
        'hk_handover_date': '08/09/2026 at 17:30 hrs', 'hk_status': 'Completed', 'hk_completed_date': '10/09/2026 at 17:55 hrs',
        'estate_date_1': '11-Sep-26', 'estate_date_2': '11-Sep-26', 'estate_date_3': '11-Sep-26', 'estate_date_4': '17-Sep-26',
        'remarks': 'The allotment of RB-23/302 was approved with effect from 25th August 2026',
        'status': 'completed', 'is_allotted': True,
    },
    {
        'sr_no': 9, 'house_type': 'Type D', 'house_no': '33/405',
        'allottee_name': 'Pranav', 'time_stamp': '01/09/26',
        'key_handed_over_date': '01/09/26', 'priority': '',
        'civil_key_received_date': '01/09/26', 'civil_status': 'completed', 'civil_completed_date': '12-Sep-2026',
        'electrical_key_received_date': '12-Sep-2026', 'electrical_status': 'completed', 'electrical_completed_date': '12-Sep-2026',
        'hk_handover_date': '15/09/2026 at 14:10 hrs', 'hk_status': 'Completed', 'hk_completed_date': '17/09/2026 at 17:35 hrs',
        'estate_date_1': '18-Sep-26', 'estate_date_2': '18-Sep-26', 'estate_date_3': '18-Sep-26', 'estate_date_4': '25-Sep-26',
        'remarks': '',
        'status': 'completed', 'is_allotted': True,
    },
    {
        'sr_no': 10, 'house_type': 'Type B', 'house_no': '08/301',
        'allottee_name': 'Dr Hasan', 'time_stamp': '10/09/2026',
        'key_handed_over_date': '10/09/2026', 'priority': '2',
        'civil_key_received_date': '10/09/2026', 'civil_status': 'completed', 'civil_completed_date': '7-Oct-2026',
        'electrical_key_received_date': '21-Sep-2026', 'electrical_status': 'completed', 'electrical_completed_date': '21-Sep-2026',
        'hk_handover_date': '08/10/2026 at 10:40 hrs', 'hk_status': 'Completed', 'hk_completed_date': '12/10/2026 at 10:00 hrs',
        'estate_date_1': '12-Oct-26', 'estate_date_2': '15-Oct-26', 'estate_date_3': '15-Oct-26', 'estate_date_4': '19-Oct-26',
        'remarks': '',
        'status': 'completed', 'is_allotted': True,
    },
    {
        'sr_no': 11, 'house_type': 'Type B', 'house_no': '05/302',
        'allottee_name': 'Manuj Kumar Singh', 'time_stamp': '09/25/2026',
        'key_handed_over_date': '09/25/2026', 'priority': '',
        'civil_key_received_date': '09/25/2026', 'civil_status': 'completed', 'civil_completed_date': '19-Oct-2026',
        'electrical_key_received_date': '10-Sep-2026', 'electrical_status': 'completed', 'electrical_completed_date': '10-Sep-2026',
        'hk_handover_date': '21/10/2026 at 11:15 hrs', 'hk_status': 'Completed', 'hk_completed_date': '21/10/2026 at 17:30 hrs',
        'estate_date_1': '21-Oct-26', 'estate_date_2': '21-Oct-26', 'estate_date_3': '22-Oct-26', 'estate_date_4': '22-Oct-26',
        'remarks': '',
        'status': 'completed', 'is_allotted': True,
    },
    {
        'sr_no': 12, 'house_type': 'Type B', 'house_no': '06/301',
        'allottee_name': 'Vinod Ramakrishnan', 'time_stamp': '09/26/2026',
        'key_handed_over_date': '09/26/2026', 'priority': '',
        'civil_key_received_date': '09/26/2026', 'civil_status': 'completed', 'civil_completed_date': '19-Oct-2026',
        'electrical_key_received_date': '10-Sep-2026', 'electrical_status': 'completed', 'electrical_completed_date': '10-Sep-2026',
        'hk_handover_date': '21/10/2026 at 11:15 hrs', 'hk_status': 'Completed', 'hk_completed_date': '21/10/2026 at 17:45 hrs',
        'estate_date_1': '21-Oct-26', 'estate_date_2': '21-Oct-26', 'estate_date_3': '22-Oct-26', 'estate_date_4': '22-Oct-26',
        'remarks': '',
        'status': 'completed', 'is_allotted': True,
    },
]


def ensure_initial_clearances():
    if HousingClearance.objects.filter(is_active=True).exists():
        return
    for item in INITIAL_CLEARANCES:
        # Find matching unit
        raw_type = item['house_type'].replace('Type', '').strip()
        unit = HousingUnit.objects.filter(house_type__iexact=raw_type, house_no__iexact=item['house_no']).first()
        if not unit:
            unit = HousingUnit.objects.filter(house_no__iexact=item['house_no']).first()

        empl_code = ''
        designation = ''
        email = ''
        date_of_expiry = ''
        if unit and unit.current_allotment:
            occ = unit.current_allotment
            empl_code = occ.empl_code
            designation = occ.designation
            email = occ.email
            date_of_expiry = occ.date_of_expiry
        elif item.get('allottee_name'):
            clean_name = item['allottee_name'].replace('Dr.', '').replace('Dr', '').replace('Prof.', '').strip()
            match_allot = HousingAllotment.objects.filter(occupant_name__icontains=clean_name).first()
            if match_allot:
                empl_code = match_allot.empl_code
                designation = match_allot.designation
                email = match_allot.email
                date_of_expiry = match_allot.date_of_expiry

        HousingClearance.objects.create(
            unit=unit,
            sr_no=item['sr_no'],
            house_type=item['house_type'],
            house_no=item['house_no'],
            allottee_name=item['allottee_name'],
            empl_code=empl_code,
            designation=designation,
            email=email,
            date_of_expiry=date_of_expiry,
            time_stamp=item['time_stamp'],
            key_handed_over_date=item['key_handed_over_date'],
            priority=item['priority'],
            civil_key_received_date=item.get('civil_key_received_date', ''),
            civil_status=item['civil_status'],
            civil_completed_date=item['civil_completed_date'],
            electrical_key_received_date=item.get('electrical_key_received_date', ''),
            electrical_status=item['electrical_status'],
            electrical_completed_date=item['electrical_completed_date'],
            hk_handover_date=item['hk_handover_date'],
            hk_status=item['hk_status'],
            hk_completed_date=item['hk_completed_date'],
            estate_date_1=item['estate_date_1'],
            estate_date_2=item['estate_date_2'],
            estate_date_3=item['estate_date_3'],
            estate_date_4=item['estate_date_4'],
            remarks=item['remarks'],
            status=item['status'],
            is_allotted=item.get('is_allotted', False),
            civil_is_locked=bool(item.get('civil_completed_date') or (item.get('civil_status') or '').lower() == 'completed'),
            electrical_is_locked=bool(item.get('electrical_completed_date') or (item.get('electrical_status') or '').lower() == 'completed'),
            hk_is_locked=bool(item.get('hk_completed_date') or (item.get('hk_status') or '').lower() in ['completed', 'complted']),
        )


class HousingClearanceListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_clearance_allowed(request.user):
            return Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        ensure_initial_clearances()
        rebalance_active_priorities()

        qs = HousingClearance.objects.filter(is_active=True).select_related('unit')
        house_type = request.query_params.get('house_type')
        if house_type and house_type != 'all':
            raw = house_type.replace('Type', '').strip()
            qs = qs.filter(models.Q(house_type__icontains=raw) | models.Q(house_type__icontains=house_type))

        status_filter = request.query_params.get('status')
        if status_filter and status_filter != 'all':
            qs = qs.filter(status=status_filter)

        search = request.query_params.get('search')
        if search:
            search = search.strip()
            qs = qs.filter(
                models.Q(allottee_name__icontains=search) |
                models.Q(house_no__icontains=search) |
                models.Q(remarks__icontains=search)
            )

        qs = qs.annotate(
            has_priority=models.Case(
                models.When(priority='', then=models.Value(1)),
                models.When(priority__isnull=True, then=models.Value(1)),
                default=models.Value(0),
                output_field=models.IntegerField(),
            ),
            priority_num=models.Case(
                models.When(priority__regex=r'^\d+$', then=Cast('priority', output_field=models.IntegerField())),
                default=models.Value(999999),
                output_field=models.IntegerField(),
            )
        ).order_by('has_priority', 'priority_num', 'sr_no', 'id')

        serializer = HousingClearanceSerializer(qs, many=True, context={'request': request})
        return Response(serializer.data)

    def post(self, request):
        if not is_clearance_master(request.user):
            return Response({'error': 'Only Admin and Estate Office can create clearance records.'}, status=status.HTTP_403_FORBIDDEN)

        data = request.data.copy()
        if 'srNo' not in data or not data['srNo']:
            max_sr = HousingClearance.objects.aggregate(m=Max('sr_no'))['m'] or 0
            data['srNo'] = max_sr + 1

        h_no = str(data.get('houseNo') or '').strip()
        h_type = str(data.get('houseType') or 'Type A').strip()

        unit = None
        unit_id = data.get('unitId')
        if unit_id:
            unit = HousingUnit.objects.filter(id=unit_id).first()
        elif h_no:
            raw_t = h_type.replace('Type', '').strip()
            unit = HousingUnit.objects.filter(house_type__iexact=raw_t, house_no__iexact=h_no).first()
            if not unit:
                unit = HousingUnit.objects.filter(house_no__iexact=h_no).first()

        serializer = HousingClearanceSerializer(data=data, context={'request': request})
        if serializer.is_valid():
            with transaction.atomic():
                clearance = serializer.save(unit=unit)
                if unit and unit.status == HousingUnit.Status.VACANT:
                    unit.status = HousingUnit.Status.UNDER_CLEARANCE
                    unit.save(update_fields=['status'])
                req_p = data.get('priority')
                if req_p:
                    rebalance_active_priorities(clearance, req_p)
                    clearance.refresh_from_db()
            if clearance.key_handed_over_date:
                send_handover_alert(clearance, EVENT_ESTATE_TO_CIVIL, actor=request.user, custom_remarks=clearance.estate_remarks)
            return Response(HousingClearanceSerializer(clearance, context={'request': request}).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class HousingClearanceDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, pk):
        try:
            return HousingClearance.objects.select_related('unit').get(pk=pk, is_active=True)
        except HousingClearance.DoesNotExist:
            return None

    def get(self, request, pk):
        if not is_clearance_allowed(request.user):
            return Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(HousingClearanceSerializer(obj, context={'request': request}).data)

    def patch(self, request, pk):
        if not is_clearance_allowed(request.user):
            return Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        role = getattr(request.user, 'role', '')
        is_master = is_clearance_master(request.user)

        payload = request.data.copy()
        action = payload.get('action')

        today_str = datetime.date.today().strftime('%d-%b-%Y')

        # Master actions
        if is_master:
            if action == 'estate_handover':
                if role != 'estate_office' and not request.user.is_superuser and role != 'admin':
                    return Response({'error': 'Only Estate Office or Admin can hand over keys to Civil team.'}, status=status.HTTP_403_FORBIDDEN)
                with transaction.atomic():
                    obj.key_handed_over_date = today_str
                    obj.save(update_fields=['key_handed_over_date', 'updated_at'])
                send_handover_alert(obj, EVENT_ESTATE_TO_CIVIL, actor=request.user, custom_remarks=obj.estate_remarks)
                return Response(HousingClearanceSerializer(obj, context={'request': request}).data)

            elif action == 'priority_up':
                rebalance_active_priorities()
                active_p = list(
                    HousingClearance.objects.filter(
                        is_active=True,
                        is_allotted=False
                    ).exclude(status='cancelled').exclude(priority='').order_by('priority', 'id')
                )
                ids = [c.id for c in active_p]
                if obj.id in ids:
                    idx = ids.index(obj.id)
                    if idx > 0:
                        prev_c = active_p[idx - 1]
                        prev_p = prev_c.priority
                        curr_p = obj.priority
                        prev_c.priority = curr_p
                        obj.priority = prev_p
                        with transaction.atomic():
                            prev_c.save(update_fields=['priority'])
                            obj.save(update_fields=['priority'])
                rebalance_active_priorities()
                obj.refresh_from_db()
                return Response(HousingClearanceSerializer(obj, context={'request': request}).data)

            elif action == 'priority_down':
                rebalance_active_priorities()
                active_p = list(
                    HousingClearance.objects.filter(
                        is_active=True,
                        is_allotted=False
                    ).exclude(status='cancelled').exclude(priority='').order_by('priority', 'id')
                )
                ids = [c.id for c in active_p]
                if obj.id in ids:
                    idx = ids.index(obj.id)
                    if idx < len(active_p) - 1:
                        next_c = active_p[idx + 1]
                        next_p = next_c.priority
                        curr_p = obj.priority
                        next_c.priority = curr_p
                        obj.priority = next_p
                        with transaction.atomic():
                            next_c.save(update_fields=['priority'])
                            obj.save(update_fields=['priority'])
                rebalance_active_priorities()
                obj.refresh_from_db()
                return Response(HousingClearanceSerializer(obj, context={'request': request}).data)

            elif action == 'set_priority':
                target_p = payload.get('priority')
                rebalance_active_priorities(obj, target_p)
                obj.refresh_from_db()
                return Response(HousingClearanceSerializer(obj, context={'request': request}).data)

            elif action == 'finalize_allotment' or payload.get('isAllotted') or payload.get('is_allotted'):
                if role != 'estate_office' and not request.user.is_superuser and role != 'admin':
                    return Response({'error': 'Only Estate Office or Admin can allot houses.'}, status=status.HTTP_403_FORBIDDEN)
                civ_done = bool(obj.civil_completed_date or (obj.civil_status or '').strip().lower() == 'completed' or obj.civil_is_locked)
                elec_done = bool(obj.electrical_completed_date or (obj.electrical_status or '').strip().lower() == 'completed' or obj.electrical_is_locked)
                hk_done = bool(obj.hk_completed_date or (obj.hk_status or '').strip().lower() == 'completed' or obj.hk_is_locked)
                if not (civ_done and elec_done and hk_done):
                    return Response({'error': 'Cannot allot house yet. All departments (Civil, Electrical, Housekeeping) must complete clearance first.'}, status=status.HTTP_400_BAD_REQUEST)
                with transaction.atomic():
                    obj.is_allotted = True
                    obj.status = 'completed'
                    obj.priority = ''
                    allottee = (payload.get('allotteeName') or payload.get('allottee_name') or obj.allottee_name or '').strip()
                    if allottee:
                        obj.allottee_name = allottee
                    e_code = (payload.get('emplCode') or payload.get('empl_code') or obj.empl_code or '').strip()
                    if e_code:
                        obj.empl_code = e_code
                    e_desig = (payload.get('designation') or obj.designation or '').strip()
                    if e_desig:
                        obj.designation = e_desig
                    e_mail = (payload.get('email') or obj.email or '').strip()
                    if e_mail:
                        obj.email = e_mail
                    e_exp = (payload.get('dateOfExpiry') or payload.get('date_of_expiry') or obj.date_of_expiry or '').strip()
                    if e_exp:
                        obj.date_of_expiry = e_exp
                    obj.save(update_fields=['is_allotted', 'status', 'allottee_name', 'empl_code', 'designation', 'email', 'date_of_expiry', 'priority', 'updated_at'])

                    unit = obj.unit
                    if not unit and obj.house_no:
                        raw_t = (obj.house_type or 'A').replace('Type', '').strip()
                        unit = HousingUnit.objects.filter(house_type__iexact=raw_t, house_no__iexact=obj.house_no).first()

                    if unit:
                        unit.status = HousingUnit.Status.OCCUPIED
                        unit.save(update_fields=['status'])

                        # Automatically create or activate HousingAllotment in Staff Housing Register
                        active_allotment = HousingAllotment.objects.filter(unit=unit, is_active=True, is_current=True).first()
                        if not active_allotment:
                            max_sl = HousingAllotment.objects.aggregate(m=Max('sl'))['m'] or 0
                            raw_type = (obj.house_type or 'A').replace('Type', '').strip()
                            HousingAllotment.objects.create(
                                unit=unit,
                                sl=max_sl + 1,
                                house_type=raw_type,
                                house_no=obj.house_no,
                                occupant_name=obj.allottee_name or 'Allottee',
                                empl_code=obj.empl_code or '',
                                designation=obj.designation or '',
                                email=obj.email or '',
                                date_of_occupation=obj.estate_date_4 or obj.estate_date_3 or today_str,
                                al_issue_date=obj.estate_date_1 or obj.time_stamp or today_str,
                                date_of_expiry=obj.date_of_expiry or 'PoE/Relocation, whichever is earlier',
                                is_current=True,
                                status=HousingAllotment.Status.OCCUPIED,
                                remarks=obj.remarks or f"Allotted via Housing Status pipeline (Ref #{obj.sr_no})"
                            )
                        else:
                            # Update existing allotment fields if blank
                            update_cols = []
                            if not active_allotment.occupant_name and obj.allottee_name:
                                active_allotment.occupant_name = obj.allottee_name
                                update_cols.append('occupant_name')
                            if not active_allotment.empl_code and obj.empl_code:
                                active_allotment.empl_code = obj.empl_code
                                update_cols.append('empl_code')
                            if not active_allotment.designation and obj.designation:
                                active_allotment.designation = obj.designation
                                update_cols.append('designation')
                            if not active_allotment.email and obj.email:
                                active_allotment.email = obj.email
                                update_cols.append('email')
                            if not active_allotment.date_of_expiry and obj.date_of_expiry:
                                active_allotment.date_of_expiry = obj.date_of_expiry
                                update_cols.append('date_of_expiry')
                            if update_cols:
                                active_allotment.save(update_fields=update_cols)
                rebalance_active_priorities()
                send_handover_alert(obj, EVENT_ESTATE_ALLOTTED, actor=request.user, custom_remarks=obj.estate_remarks)
                return Response(HousingClearanceSerializer(obj, context={'request': request}).data)
        elif action:
            return Response({'error': 'You do not have permission to perform this action.'}, status=status.HTTP_403_FORBIDDEN)

        if is_master and 'priority' in payload:
            target_p = payload.pop('priority')
            rebalance_active_priorities(obj, target_p)
            obj.refresh_from_db()
            if not payload:
                return Response(HousingClearanceSerializer(obj, context={'request': request}).data)

        if role == 'estate_office':
            estate_allowed = {
                'houseType', 'house_type',
                'houseNo', 'house_no',
                'timeStamp', 'time_stamp',
                'keyHandedOverDate', 'key_handed_over_date',
                'priority',
                'allotteeName', 'allottee_name',
                'emplCode', 'empl_code',
                'designation',
                'email',
                'dateOfExpiry', 'date_of_expiry',
                'estateDate1', 'estate_date_1', 'allotmentLetterIssuedDate',
                'estateDate2', 'estate_date_2', 'userAcceptedDate',
                'estateDate3', 'estate_date_3', 'keyHandedOverToAllotteeDate',
                'estateDate4', 'estate_date_4', 'possessionDeadlineDate',
                'estateRemarks', 'estate_remarks',
                'remarks', 'status',
                'action',
                'id', 'srNo', 'sr_no', 'unitId', 'unit_id',
            }
            # Only keep allowed estate fields, stripping department-specific fields without throwing 403
            payload = {k: v for k, v in payload.items() if k in estate_allowed}

        if not is_master:
            if role == 'civil_team':
                # Check Estate Handover
                if not obj.key_handed_over_date:
                    return Response({'error': 'Estate Office has not handed over the key to Civil team yet.'}, status=status.HTTP_403_FORBIDDEN)
                # Check Lock
                if obj.civil_is_locked:
                    return Response({'error': 'Civil clearance is locked. Please contact Admin to unlock if modifications are needed.'}, status=status.HTTP_403_FORBIDDEN)

                allowed_fields = {
                    'civilKeyReceivedDate', 'civil_key_received_date',
                    'civilStatus', 'civil_status',
                    'civilKeyHandedOverDate', 'civil_key_handed_over_date',
                    'civilCompletedDate', 'civil_completed_date',
                    'civilRemarks', 'civil_remarks',
                    'remarks',
                }
                payload = {k: v for k, v in payload.items() if k in allowed_fields}

                # Auto-lock if completing Civil
                civ_status = (payload.get('civilStatus') or payload.get('civil_status') or '').strip().lower()
                civ_done = payload.get('civilCompletedDate') or payload.get('civil_completed_date')
                if civ_status == 'completed' or civ_done:
                    payload['civil_is_locked'] = True
                    if not civ_done:
                        payload['civil_completed_date'] = today_str
                    if not obj.civil_key_received_date and not payload.get('civil_key_received_date') and not payload.get('civilKeyReceivedDate'):
                        payload['civil_key_received_date'] = payload.get('civil_completed_date') or today_str

            elif role == 'electrical_team':
                # Check Civil completion
                civil_done = bool(obj.civil_completed_date or (obj.civil_status or '').strip().lower() == 'completed')
                if not civil_done:
                    return Response({'error': 'Civil team has not completed their clearance yet. Key not handed over to Electrical.'}, status=status.HTTP_403_FORBIDDEN)
                # Check Lock
                if obj.electrical_is_locked:
                    return Response({'error': 'Electrical clearance is locked. Please contact Admin to unlock if modifications are needed.'}, status=status.HTTP_403_FORBIDDEN)

                allowed_fields = {
                    'electricalKeyReceivedDate', 'electrical_key_received_date',
                    'electricalStatus', 'electrical_status',
                    'electricalKeyHandedOverDate', 'electrical_key_handed_over_date',
                    'electricalCompletedDate', 'electrical_completed_date',
                    'electricalRemarks', 'electrical_remarks',
                    'remarks',
                }
                payload = {k: v for k, v in payload.items() if k in allowed_fields}

                # Auto-lock if completing Electrical
                elec_status = (payload.get('electricalStatus') or payload.get('electrical_status') or '').strip().lower()
                elec_done = payload.get('electricalCompletedDate') or payload.get('electrical_completed_date')
                if elec_status == 'completed' or elec_done:
                    payload['electrical_is_locked'] = True
                    if not elec_done:
                        payload['electrical_completed_date'] = today_str
                    if not obj.electrical_key_received_date and not payload.get('electrical_key_received_date') and not payload.get('electricalKeyReceivedDate'):
                        payload['electrical_key_received_date'] = payload.get('electrical_completed_date') or today_str

            elif role in ('hk_inventory_manager', 'supervisor', 'caretaker'):
                # Check Electrical completion
                elec_done = bool(obj.electrical_completed_date or (obj.electrical_status or '').strip().lower() == 'completed')
                if not elec_done:
                    return Response({'error': 'Electrical team has not completed their clearance yet. Key not handed over to Housekeeping.'}, status=status.HTTP_403_FORBIDDEN)
                # Check Lock
                if obj.hk_is_locked:
                    return Response({'error': 'Housekeeping clearance is locked. Please contact Admin to unlock if modifications are needed.'}, status=status.HTTP_403_FORBIDDEN)

                allowed_fields = {
                    'hkKeyReceivedDate', 'hk_key_received_date',
                    'hkHandoverDate', 'hk_handover_date',
                    'hkStatus', 'hk_status',
                    'hkKeyHandedOverDate', 'hk_key_handed_over_date',
                    'hkCompletedDate', 'hk_completed_date',
                    'hkRemarks', 'hk_remarks',
                    'remarks',
                }
                payload = {k: v for k, v in payload.items() if k in allowed_fields}

                # Auto-lock if completing HK
                hk_stat = (payload.get('hkStatus') or payload.get('hk_status') or '').strip().lower()
                hk_done = payload.get('hkCompletedDate') or payload.get('hk_completed_date')
                if hk_stat == 'completed' or hk_done:
                    payload['hk_is_locked'] = True
                    if not hk_done:
                        payload['hk_completed_date'] = today_str
                    if not obj.hk_handover_date and not payload.get('hk_handover_date') and not payload.get('hkHandoverDate'):
                        payload['hk_handover_date'] = payload.get('hk_completed_date') or today_str
            else:
                return Response({'error': 'You do not have permission to modify clearance records.'}, status=status.HTTP_403_FORBIDDEN)

        # Universal Auto-Date & Custody Integrity Check
        new_civ_status = (payload.get('civilStatus') or payload.get('civil_status') or '').strip().lower()
        civ_done = payload.get('civilCompletedDate') or payload.get('civil_completed_date')
        if new_civ_status == 'completed' or (not new_civ_status and (obj.civil_status or '').strip().lower() == 'completed' and civ_done):
            payload['civil_status'] = 'Completed'
            payload['civil_is_locked'] = True
            if not civ_done and not obj.civil_completed_date:
                payload['civil_completed_date'] = today_str
            if not obj.civil_key_received_date and not payload.get('civil_key_received_date') and not payload.get('civilKeyReceivedDate'):
                payload['civil_key_received_date'] = payload.get('civil_completed_date') or obj.civil_completed_date or today_str
            if not obj.key_handed_over_date and not payload.get('key_handed_over_date') and not payload.get('keyHandedOverDate'):
                payload['key_handed_over_date'] = payload.get('civil_key_received_date') or obj.civil_key_received_date or today_str
        elif new_civ_status and new_civ_status != 'completed':
            payload['civil_is_locked'] = False
            if 'civilCompletedDate' in payload and not payload.get('civilCompletedDate'):
                payload['civil_completed_date'] = ''

        new_elec_status = (payload.get('electricalStatus') or payload.get('electrical_status') or '').strip().lower()
        elec_done = payload.get('electricalCompletedDate') or payload.get('electrical_completed_date')
        if new_elec_status == 'completed' or (not new_elec_status and (obj.electrical_status or '').strip().lower() == 'completed' and elec_done):
            payload['electrical_status'] = 'Completed'
            payload['electrical_is_locked'] = True
            if not elec_done and not obj.electrical_completed_date:
                payload['electrical_completed_date'] = today_str
            if not obj.electrical_key_received_date and not payload.get('electrical_key_received_date') and not payload.get('electricalKeyReceivedDate'):
                payload['electrical_key_received_date'] = payload.get('electrical_completed_date') or obj.electrical_completed_date or today_str
        elif new_elec_status and new_elec_status != 'completed':
            payload['electrical_is_locked'] = False
            if 'electricalCompletedDate' in payload and not payload.get('electricalCompletedDate'):
                payload['electrical_completed_date'] = ''

        new_hk_status = (payload.get('hkStatus') or payload.get('hk_status') or '').strip().lower()
        hk_done = payload.get('hkCompletedDate') or payload.get('hk_completed_date')
        if new_hk_status == 'completed' or (not new_hk_status and (obj.hk_status or '').strip().lower() == 'completed' and hk_done):
            payload['hk_status'] = 'Completed'
            payload['hk_is_locked'] = True
            if not hk_done and not obj.hk_completed_date:
                payload['hk_completed_date'] = today_str
            if not obj.hk_handover_date and not payload.get('hk_handover_date') and not payload.get('hkHandoverDate'):
                payload['hk_handover_date'] = payload.get('hk_completed_date') or obj.hk_completed_date or today_str
        elif new_hk_status and new_hk_status != 'completed':
            payload['hk_is_locked'] = False
            if 'hkCompletedDate' in payload and not payload.get('hkCompletedDate'):
                payload['hk_completed_date'] = ''

        old_key_handed = bool(obj.key_handed_over_date)
        old_civ_done = bool(obj.civil_completed_date or (obj.civil_status or '').strip().lower() == 'completed' or obj.civil_is_locked)
        old_elec_done = bool(obj.electrical_completed_date or (obj.electrical_status or '').strip().lower() == 'completed' or obj.electrical_is_locked)
        old_hk_done = bool(obj.hk_completed_date or (obj.hk_status or '').strip().lower() == 'completed' or obj.hk_is_locked)
        old_allotted = bool(obj.is_allotted)

        serializer = HousingClearanceSerializer(obj, data=payload, partial=True, context={'request': request})
        if serializer.is_valid():
            with transaction.atomic():
                updated = serializer.save()

            new_key_handed = bool(updated.key_handed_over_date)
            new_civ_done = bool(updated.civil_completed_date or (updated.civil_status or '').strip().lower() == 'completed' or updated.civil_is_locked)
            new_elec_done = bool(updated.electrical_completed_date or (updated.electrical_status or '').strip().lower() == 'completed' or updated.electrical_is_locked)
            new_hk_done = bool(updated.hk_completed_date or (updated.hk_status or '').strip().lower() == 'completed' or updated.hk_is_locked)
            new_allotted = bool(updated.is_allotted)

            if not old_allotted and new_allotted:
                send_handover_alert(updated, EVENT_ESTATE_ALLOTTED, actor=request.user, custom_remarks=updated.estate_remarks)
            elif not old_hk_done and new_hk_done:
                send_handover_alert(updated, EVENT_HK_TO_ESTATE, actor=request.user, custom_remarks=updated.hk_remarks)
            elif not old_elec_done and new_elec_done:
                send_handover_alert(updated, EVENT_ELECTRICAL_TO_HK, actor=request.user, custom_remarks=updated.electrical_remarks)
            elif not old_civ_done and new_civ_done:
                send_handover_alert(updated, EVENT_CIVIL_TO_ELECTRICAL, actor=request.user, custom_remarks=updated.civil_remarks)
            elif not old_key_handed and new_key_handed:
                send_handover_alert(updated, EVENT_ESTATE_TO_CIVIL, actor=request.user, custom_remarks=updated.estate_remarks)

            return Response(HousingClearanceSerializer(updated, context={'request': request}).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        if not is_clearance_master(request.user):
            return Response({'error': 'Only Admin and Estate Office can delete clearance records.'}, status=status.HTTP_403_FORBIDDEN)
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        with transaction.atomic():
            obj.is_active = False
            obj.priority = ''
            obj.save(update_fields=['is_active', 'priority'])
            rebalance_active_priorities()
            if obj.unit and obj.unit.status == HousingUnit.Status.UNDER_CLEARANCE:
                # If no other active clearance, reset unit to vacant
                has_other = obj.unit.clearances.filter(is_active=True, status='in_progress').exists()
                if not has_other and not obj.unit.current_allotment:
                    obj.unit.status = HousingUnit.Status.VACANT
                    obj.unit.save(update_fields=['status'])
        return Response({'success': True}, status=status.HTTP_200_OK)

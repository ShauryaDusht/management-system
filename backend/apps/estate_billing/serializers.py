from decimal import Decimal
from rest_framework import serializers
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



class EstateSettingsSerializer(serializers.ModelSerializer):
    noteNoPrefix = serializers.CharField(source='note_no_prefix')
    autoFinancialYear = serializers.BooleanField(source='auto_financial_year')
    firstNoteNo = serializers.IntegerField(source='first_note_no')
    paymentNote = serializers.CharField(source='payment_note')
    expiryAlertDays = serializers.IntegerField(source='expiry_alert_days', required=False)
    enableEmailAlerts = serializers.BooleanField(source='enable_email_alerts', required=False)
    testRecipientEmail = serializers.CharField(source='test_recipient_email', required=False, allow_blank=True)
    civilAlertEmail = serializers.CharField(source='civil_alert_email', required=False, allow_blank=True)
    electricalAlertEmail = serializers.CharField(source='electrical_alert_email', required=False, allow_blank=True)
    hkAlertEmail = serializers.CharField(source='hk_alert_email', required=False, allow_blank=True)
    estateAlertEmail = serializers.CharField(source='estate_alert_email', required=False, allow_blank=True)
    signatory = serializers.SerializerMethodField()

    class Meta:
        model = EstateSettings
        fields = [
            'headline',
            'noteNoPrefix',
            'autoFinancialYear',
            'firstNoteNo',
            'paymentNote',
            'bank',
            'expiryAlertDays',
            'enableEmailAlerts',
            'testRecipientEmail',
            'civilAlertEmail',
            'electricalAlertEmail',
            'hkAlertEmail',
            'estateAlertEmail',
            'signatory',
        ]

    def get_signatory(self, obj):
        return {
            'name': obj.signatory_name,
            'title': obj.signatory_title,
        }

    def update(self, instance, validated_data):
        signatory_data = self.initial_data.get('signatory')
        if isinstance(signatory_data, dict):
            if 'name' in signatory_data:
                instance.signatory_name = signatory_data['name']
            if 'title' in signatory_data:
                instance.signatory_title = signatory_data['title']

        if 'headline' in validated_data:
            instance.headline = validated_data['headline']
        if 'note_no_prefix' in validated_data:
            instance.note_no_prefix = validated_data['note_no_prefix']
        if 'auto_financial_year' in validated_data:
            instance.auto_financial_year = validated_data['auto_financial_year']
        if 'first_note_no' in validated_data:
            instance.first_note_no = validated_data['first_note_no']
        if 'payment_note' in validated_data:
            instance.payment_note = validated_data['payment_note']
        if 'bank' in validated_data:
            instance.bank = validated_data['bank']
        if 'expiry_alert_days' in validated_data:
            instance.expiry_alert_days = validated_data['expiry_alert_days']
        elif 'expiryAlertDays' in self.initial_data:
            try:
                instance.expiry_alert_days = int(self.initial_data['expiryAlertDays'])
            except (ValueError, TypeError):
                pass

        for field in [
            'enable_email_alerts',
            'test_recipient_email',
            'civil_alert_email',
            'electrical_alert_email',
            'hk_alert_email',
            'estate_alert_email',
        ]:
            if field in validated_data:
                setattr(instance, field, validated_data[field])

        instance.save()
        return instance


class BillingCycleSerializer(serializers.ModelSerializer):
    class Meta:
        model = BillingCycle
        fields = ['id', 'month', 'label', 'is_active', 'created_at']


class ShopDemandNoteSerializer(serializers.ModelSerializer):
    shopId = serializers.IntegerField(source='shop.id', read_only=True)
    sl = serializers.IntegerField(source='shop.sl', read_only=True)
    name = serializers.CharField(source='shop.name', read_only=True)
    address = serializers.CharField(source='shop.address', read_only=True)
    expiryDate = serializers.CharField(source='expiry_date', required=False, allow_blank=True)
    shopExpiryDate = serializers.CharField(source='shop.expiry_date', read_only=True)
    noteNo = serializers.CharField(source='note_no', required=False, allow_blank=True)
    monthTo = serializers.CharField(source='month_to', required=False, allow_blank=True)

    isCancelled = serializers.BooleanField(source='is_cancelled', required=False)

    class Meta:
        model = ShopDemandNote
        fields = [
            'id',
            'shopId',
            'sl',
            'name',
            'address',
            'expiryDate',
            'shopExpiryDate',
            'fixed',
            'units',
            'rate',
            'water',
            'noteNo',
            'date',
            'month',
            'monthTo',
            'extras',
            'total_amount',
            'cycle_month',
            'isCancelled',
        ]


class ContractorDemandNoteSerializer(serializers.ModelSerializer):
    contractorId = serializers.IntegerField(source='contractor.id', read_only=True)
    sl = serializers.IntegerField(source='contractor.sl', read_only=True)
    name = serializers.CharField(source='contractor.name', read_only=True)
    toLine = serializers.CharField(source='contractor.to_line', read_only=True)
    address = serializers.CharField(source='contractor.address', read_only=True)
    intro = serializers.CharField(source='contractor.intro', read_only=True)
    noteNo = serializers.CharField(source='note_no', required=False, allow_blank=True)
    periodType = serializers.CharField(source='period_type', required=False)
    monthTo = serializers.CharField(source='month_to', required=False, allow_blank=True)

    class Meta:
        model = ContractorDemandNote
        fields = [
            'id',
            'contractorId',
            'sl',
            'name',
            'toLine',
            'address',
            'intro',
            'noteNo',
            'date',
            'periodType',
            'month',
            'monthTo',
            'from_date',
            'to_date',
            'meters',
            'total_amount',
            'cycle_month',
        ]

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret['from'] = ret.get('from_date', '')
        ret['to'] = ret.get('to_date', '')
        return ret


class HousingUnitSerializer(serializers.ModelSerializer):
    houseType = serializers.CharField(source='house_type')
    houseNo = serializers.CharField(source='house_no')
    blockNo = serializers.CharField(source='block_no', read_only=True)
    floor = serializers.CharField(read_only=True)
    currentOccupant = serializers.SerializerMethodField()
    lastOccupant = serializers.SerializerMethodField()
    allotmentCount = serializers.SerializerMethodField()
    activeClearance = serializers.SerializerMethodField()

    class Meta:
        model = HousingUnit
        fields = [
            'id',
            'houseType',
            'houseNo',
            'blockNo',
            'floor',
            'status',
            'currentOccupant',
            'lastOccupant',
            'activeClearance',
            'allotmentCount',
            'is_active',
        ]

    def get_currentOccupant(self, obj):
        if hasattr(obj, '_prefetched_objects_cache') and 'allotments' in obj._prefetched_objects_cache:
            for a in obj.allotments.all():
                if a.is_active and a.is_current:
                    return {
                        'id': a.id,
                        'occupantName': a.occupant_name,
                        'emplCode': a.empl_code,
                        'designation': a.designation,
                        'email': a.email,
                        'dateOfOccupation': a.date_of_occupation,
                        'alIssueDate': a.al_issue_date,
                        'dateOfExpiry': a.date_of_expiry,
                        'status': a.status,
                    }
            return None
        curr = obj.current_allotment
        if not curr:
            return None
        return {
            'id': curr.id,
            'occupantName': curr.occupant_name,
            'emplCode': curr.empl_code,
            'designation': curr.designation,
            'email': curr.email,
            'dateOfOccupation': curr.date_of_occupation,
            'alIssueDate': curr.al_issue_date,
            'dateOfExpiry': curr.date_of_expiry,
            'status': curr.status,
        }

    def get_lastOccupant(self, obj):
        if hasattr(obj, '_prefetched_objects_cache') and 'allotments' in obj._prefetched_objects_cache:
            vacated = [a for a in obj.allotments.all() if a.is_active and not a.is_current]
            if not vacated:
                return None
            vacated.sort(key=lambda x: (str(x.date_of_vacation or ''), x.id), reverse=True)
            last = vacated[0]
            return {
                'id': last.id,
                'occupantName': last.occupant_name,
                'emplCode': last.empl_code,
                'designation': last.designation,
                'dateOfVacation': last.date_of_vacation,
                'dateOfOccupation': last.date_of_occupation,
                'vacationReason': last.vacation_reason,
            }
        last = obj.allotments.filter(is_active=True, is_current=False).order_by('-date_of_vacation', '-id').first()
        if not last:
            return None
        return {
            'id': last.id,
            'occupantName': last.occupant_name,
            'emplCode': last.empl_code,
            'designation': last.designation,
            'dateOfVacation': last.date_of_vacation,
            'dateOfOccupation': last.date_of_occupation,
            'vacationReason': last.vacation_reason,
        }

    def get_allotmentCount(self, obj):
        if hasattr(obj, '_prefetched_objects_cache') and 'allotments' in obj._prefetched_objects_cache:
            return len([a for a in obj.allotments.all() if a.is_active])
        return obj.allotments.filter(is_active=True).count()

    def get_activeClearance(self, obj):
        if hasattr(obj, '_prefetched_objects_cache') and 'clearances' in obj._prefetched_objects_cache:
            for c in obj.clearances.all():
                if c.is_active and not c.is_allotted:
                    return {
                        'id': c.id,
                        'srNo': c.sr_no,
                        'allotteeName': c.allottee_name,
                        'priority': c.priority,
                        'status': c.status,
                        'civilStatus': c.civil_status,
                        'civilKeyReceivedDate': c.civil_key_received_date,
                        'civilCompletedDate': c.civil_completed_date,
                        'electricalStatus': c.electrical_status,
                        'electricalKeyReceivedDate': c.electrical_key_received_date,
                        'electricalCompletedDate': c.electrical_completed_date,
                        'hkStatus': c.hk_status,
                        'hkHandoverDate': c.hk_handover_date,
                        'hkCompletedDate': c.hk_completed_date,
                        'keyHandedOverDate': c.key_handed_over_date,
                    }
            return None
        c = obj.clearances.filter(is_active=True, is_allotted=False).first()
        if c:
            return {
                'id': c.id,
                'srNo': c.sr_no,
                'allotteeName': c.allottee_name,
                'priority': c.priority,
                'status': c.status,
                'civilStatus': c.civil_status,
                'civilKeyReceivedDate': c.civil_key_received_date,
                'civilCompletedDate': c.civil_completed_date,
                'electricalStatus': c.electrical_status,
                'electricalKeyReceivedDate': c.electrical_key_received_date,
                'electricalCompletedDate': c.electrical_completed_date,
                'hkStatus': c.hk_status,
                'hkHandoverDate': c.hk_handover_date,
                'hkCompletedDate': c.hk_completed_date,
                'keyHandedOverDate': c.key_handed_over_date,
            }
        return None


class LightHousingUnitSerializer(serializers.ModelSerializer):
    """Fast serializer for dropdown selects without occupant queries."""
    houseType = serializers.CharField(source='house_type')
    houseNo = serializers.CharField(source='house_no')
    blockNo = serializers.CharField(source='block_no', read_only=True)

    class Meta:
        model = HousingUnit
        fields = [
            'id',
            'houseType',
            'houseNo',
            'blockNo',
            'status',
            'is_active',
        ]


class HousingAllotmentSerializer(serializers.ModelSerializer):
    unitId = serializers.IntegerField(source='unit_id', required=False, allow_null=True)
    houseType = serializers.CharField(source='house_type', required=False)
    houseNo = serializers.CharField(source='house_no')
    occupantName = serializers.CharField(source='occupant_name')
    emplCode = serializers.CharField(source='empl_code', required=False, allow_blank=True)
    designation = serializers.CharField(required=False, allow_blank=True)
    email = serializers.CharField(required=False, allow_blank=True)
    dateOfOccupation = serializers.CharField(source='date_of_occupation', required=False, allow_blank=True)
    alIssueDate = serializers.CharField(source='al_issue_date', required=False, allow_blank=True)
    dateOfExpiry = serializers.CharField(source='date_of_expiry', required=False, allow_blank=True)
    dateOfVacation = serializers.CharField(source='date_of_vacation', required=False, allow_blank=True)
    vacationReason = serializers.CharField(source='vacation_reason', required=False, allow_blank=True)
    isCurrent = serializers.BooleanField(source='is_current', required=False)
    isActive = serializers.BooleanField(source='is_active', required=False)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)

    class Meta:
        model = HousingAllotment
        fields = [
            'id',
            'unitId',
            'sl',
            'houseType',
            'houseNo',
            'occupantName',
            'emplCode',
            'designation',
            'email',
            'dateOfOccupation',
            'alIssueDate',
            'dateOfExpiry',
            'dateOfVacation',
            'vacationReason',
            'isCurrent',
            'status',
            'remarks',
            'isActive',
            'createdAt',
            'updatedAt',
        ]


class HousingClearanceSerializer(serializers.ModelSerializer):
    unitId = serializers.IntegerField(source='unit_id', required=False, allow_null=True)
    srNo = serializers.IntegerField(source='sr_no', required=False)
    houseType = serializers.CharField(source='house_type', required=False)
    houseNo = serializers.CharField(source='house_no')
    allotteeName = serializers.CharField(source='allottee_name', required=False, allow_blank=True)
    emplCode = serializers.CharField(source='empl_code', required=False, allow_blank=True)
    designation = serializers.CharField(required=False, allow_blank=True)
    email = serializers.CharField(required=False, allow_blank=True)
    dateOfExpiry = serializers.CharField(source='date_of_expiry', required=False, allow_blank=True)
    timeStamp = serializers.CharField(source='time_stamp', required=False, allow_blank=True)
    keyHandedOverDate = serializers.CharField(source='key_handed_over_date', required=False, allow_blank=True)
    priority = serializers.CharField(required=False, allow_blank=True)

    # Civil Team (Sheet Col H, I, J)
    civilKeyReceivedDate = serializers.CharField(source='civil_key_received_date', required=False, allow_blank=True)
    civilStatus = serializers.CharField(source='civil_status', required=False, allow_blank=True)
    civilKeyHandedOverDate = serializers.CharField(source='civil_completed_date', required=False, allow_blank=True)
    civilCompletedDate = serializers.CharField(source='civil_completed_date', required=False, allow_blank=True)

    # Electrical Team (Sheet Col K, L, M)
    electricalKeyReceivedDate = serializers.CharField(source='electrical_key_received_date', required=False, allow_blank=True)
    electricalStatus = serializers.CharField(source='electrical_status', required=False, allow_blank=True)
    electricalKeyHandedOverDate = serializers.CharField(source='electrical_completed_date', required=False, allow_blank=True)
    electricalCompletedDate = serializers.CharField(source='electrical_completed_date', required=False, allow_blank=True)

    # Housekeeping Team (Sheet Col N, O, P)
    hkKeyReceivedDate = serializers.CharField(source='hk_handover_date', required=False, allow_blank=True)
    hkHandoverDate = serializers.CharField(source='hk_handover_date', required=False, allow_blank=True)
    hkStatus = serializers.CharField(source='hk_status', required=False, allow_blank=True)
    hkKeyHandedOverDate = serializers.CharField(source='hk_completed_date', required=False, allow_blank=True)
    hkCompletedDate = serializers.CharField(source='hk_completed_date', required=False, allow_blank=True)

    # Estate Office (Sheet Col Q, R, S, T)
    allotmentLetterIssuedDate = serializers.CharField(source='estate_date_1', required=False, allow_blank=True)
    estateDate1 = serializers.CharField(source='estate_date_1', required=False, allow_blank=True)
    userAcceptedDate = serializers.CharField(source='estate_date_2', required=False, allow_blank=True)
    estateDate2 = serializers.CharField(source='estate_date_2', required=False, allow_blank=True)
    keyHandedOverToAllotteeDate = serializers.CharField(source='estate_date_3', required=False, allow_blank=True)
    estateDate3 = serializers.CharField(source='estate_date_3', required=False, allow_blank=True)
    possessionDeadlineDate = serializers.CharField(source='estate_date_4', required=False, allow_blank=True)
    estateDate4 = serializers.CharField(source='estate_date_4', required=False, allow_blank=True)

    civilRemarks = serializers.CharField(source='civil_remarks', required=False, allow_blank=True)
    electricalRemarks = serializers.CharField(source='electrical_remarks', required=False, allow_blank=True)
    hkRemarks = serializers.CharField(source='hk_remarks', required=False, allow_blank=True)
    estateRemarks = serializers.CharField(source='estate_remarks', required=False, allow_blank=True)

    remarks = serializers.CharField(required=False, allow_blank=True)
    status = serializers.CharField(required=False)
    isActive = serializers.BooleanField(source='is_active', required=False)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    unitStatus = serializers.SerializerMethodField()
    isAllotted = serializers.SerializerMethodField()

    civilIsLocked = serializers.BooleanField(source='civil_is_locked', required=False)
    electricalIsLocked = serializers.BooleanField(source='electrical_is_locked', required=False)
    hkIsLocked = serializers.BooleanField(source='hk_is_locked', required=False)
    adminUnlockReason = serializers.CharField(source='admin_unlock_reason', required=False, allow_blank=True)
    is_allotted = serializers.BooleanField(required=False)

    def to_internal_value(self, data):
        if hasattr(data, 'dict'):
            data = data.dict()
        else:
            data = dict(data)

        snake_to_camel = {
            'unit_id': 'unitId',
            'sr_no': 'srNo',
            'house_type': 'houseType',
            'house_no': 'houseNo',
            'allottee_name': 'allotteeName',
            'empl_code': 'emplCode',
            'date_of_expiry': 'dateOfExpiry',
            'time_stamp': 'timeStamp',
            'key_handed_over_date': 'keyHandedOverDate',
            'civil_key_received_date': 'civilKeyReceivedDate',
            'civil_status': 'civilStatus',
            'civil_completed_date': 'civilCompletedDate',
            'civil_key_handed_over_date': 'civilKeyHandedOverDate',
            'civil_is_locked': 'civilIsLocked',
            'civil_remarks': 'civilRemarks',
            'electrical_key_received_date': 'electricalKeyReceivedDate',
            'electrical_status': 'electricalStatus',
            'electrical_completed_date': 'electricalCompletedDate',
            'electrical_key_handed_over_date': 'electricalKeyHandedOverDate',
            'electrical_is_locked': 'electricalIsLocked',
            'electrical_remarks': 'electricalRemarks',
            'hk_key_received_date': 'hkKeyReceivedDate',
            'hk_handover_date': 'hkHandoverDate',
            'hk_status': 'hkStatus',
            'hk_completed_date': 'hkCompletedDate',
            'hk_key_handed_over_date': 'hkKeyHandedOverDate',
            'hk_is_locked': 'hkIsLocked',
            'hk_remarks': 'hkRemarks',
            'estate_date_1': 'estateDate1',
            'estate_date_2': 'estateDate2',
            'estate_date_3': 'estateDate3',
            'estate_date_4': 'estateDate4',
            'estate_remarks': 'estateRemarks',
            'admin_unlock_reason': 'adminUnlockReason',
            'is_active': 'isActive',
            'isAllotted': 'is_allotted',
        }
        for snake, camel in snake_to_camel.items():
            if snake in data and camel not in data:
                data[camel] = data[snake]

        return super().to_internal_value(data)

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        request = self.context.get('request')
        if request and hasattr(request, 'user') and request.user.is_authenticated:
            user = request.user
            role = (getattr(user, 'role', '') or '').lower()
            is_super = getattr(user, 'is_superuser', False) or role in ['admin', 'superadmin', 'super_admin']

            # Strict department isolation: departments only see their own internal remarks
            if not is_super:
                if role == 'civil_team':
                    ret['estateRemarks'] = ''
                    ret['electricalRemarks'] = ''
                    ret['hkRemarks'] = ''
                    ret['remarks'] = ret.get('civilRemarks', '')
                elif role == 'electrical_team':
                    ret['estateRemarks'] = ''
                    ret['civilRemarks'] = ''
                    ret['hkRemarks'] = ''
                    ret['remarks'] = ret.get('electricalRemarks', '')
                elif role in ['hk_inventory_manager', 'supervisor', 'caretaker']:
                    ret['estateRemarks'] = ''
                    ret['civilRemarks'] = ''
                    ret['electricalRemarks'] = ''
                    ret['remarks'] = ret.get('hkRemarks', '')
                # Admin and Estate Office retain access to all department remarks
        return ret

    def get_unitStatus(self, obj):
        if obj.unit:
            return obj.unit.status
        return ''

    def get_isAllotted(self, obj):
        if obj.is_allotted:
            return True
        unit = obj.unit
        if not unit and obj.house_no:
            from .models import HousingUnit
            raw_t = (obj.house_type or '').replace('Type', '').strip()
            unit = HousingUnit.objects.filter(house_type__iexact=raw_t, house_no__iexact=obj.house_no).first()
            if not unit:
                unit = HousingUnit.objects.filter(house_no__iexact=obj.house_no).first()
        if not unit:
            return False

        active_allotments = unit.allotments.filter(is_active=True, is_current=True)
        if not active_allotments.exists():
            return False

        if obj.allottee_name and obj.allottee_name.strip():
            name = obj.allottee_name.strip().lower()
            matches = [
                a for a in active_allotments
                if name in (a.occupant_name or '').lower() or (a.occupant_name or '').lower() in name
            ]
            if matches:
                return True
            return False

        return unit.status == 'occupied' and active_allotments.exists()

    class Meta:
        model = HousingClearance
        fields = [
            'id',
            'unitId',
            'unitStatus',
            'isAllotted',
            'is_allotted',
            'srNo',
            'houseType',
            'houseNo',
            'allotteeName',
            'emplCode',
            'designation',
            'email',
            'dateOfExpiry',
            'timeStamp',
            'keyHandedOverDate',
            'priority',
            # Civil
            'civilKeyReceivedDate',
            'civilStatus',
            'civilKeyHandedOverDate',
            'civilCompletedDate',
            'civilIsLocked',
            'civilRemarks',
            # Electrical
            'electricalKeyReceivedDate',
            'electricalStatus',
            'electricalKeyHandedOverDate',
            'electricalCompletedDate',
            'electricalIsLocked',
            'electricalRemarks',
            # Housekeeping
            'hkKeyReceivedDate',
            'hkHandoverDate',
            'hkStatus',
            'hkKeyHandedOverDate',
            'hkCompletedDate',
            'hkIsLocked',
            'hkRemarks',
            # Estate Office
            'allotmentLetterIssuedDate',
            'estateDate1',
            'userAcceptedDate',
            'estateDate2',
            'keyHandedOverToAllotteeDate',
            'estateDate3',
            'possessionDeadlineDate',
            'estateDate4',
            'estateRemarks',
            # Admin Unlock & Meta
            'adminUnlockReason',
            'remarks',
            'status',
            'isActive',
            'createdAt',
            'updatedAt',
        ]

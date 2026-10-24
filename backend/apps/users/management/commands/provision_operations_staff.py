from django.core.management.base import BaseCommand
from apps.users.models import User

DEFAULT_PASSWORD = 'IITGN@2025'

STAFF_DATA = [
    # 1. Executive / Combined Engineer (Substation & WTP/STP)
    {
        'username': 'pritesh.mundra',
        'first_name': 'Pritesh Kumar',
        'last_name': 'Mundra',
        'phone': '9462010595',
        'role': 'plant_engineer',
    },
    # 2. Substation Supervisor
    {
        'username': 'kaushik.khetani',
        'first_name': 'Kaushik Kumar P.',
        'last_name': 'Khetani',
        'phone': '9998991506',
        'role': 'electrical_supervisor',
    },
    # 3. Substation Operators
    {
        'username': 'mahesh.katara',
        'first_name': 'Maheshbhai Bachubhai',
        'last_name': 'Katara',
        'phone': '9978318871',
        'role': 'electrical_operator',
    },
    {
        'username': 'dilip.thakor',
        'first_name': 'Dilipkumar Gabhaji',
        'last_name': 'Thakor',
        'phone': '9723236037',
        'role': 'electrical_operator',
    },
    {
        'username': 'jaydip.gajjar',
        'first_name': 'Jaydipkumar Bansilal',
        'last_name': 'Gajjar',
        'phone': '8905166563',
        'role': 'electrical_operator',
    },
    {
        'username': 'pritesh.patel',
        'first_name': 'Priteshkumar Vinubhai',
        'last_name': 'Patel',
        'phone': '9904324188',
        'role': 'electrical_operator',
    },
    {
        'username': 'darshan.patel',
        'first_name': 'Darshankumar Bharatbhai',
        'last_name': 'Patel',
        'phone': '9173563689',
        'role': 'electrical_operator',
    },
    {
        'username': 'govind.baranda',
        'first_name': 'Govindbhai Virjibhai',
        'last_name': 'Baranda',
        'phone': '9537349472',
        'role': 'electrical_operator',
    },
    {
        'username': 'ramesh.dantani',
        'first_name': 'Rameshbhai',
        'last_name': 'Dantani',
        'phone': '9714804681',
        'role': 'electrical_operator',
    },
    # 4. WTP-STP Supervisor
    {
        'username': 'vikash.yadav',
        'first_name': 'Vikash Kumar',
        'last_name': 'Yadav',
        'phone': '9636041755',
        'role': 'wtp_supervisor',
    },
    # 5. WTP-STP Operators
    {
        'username': 'alpesh.wtp',
        'first_name': 'Alpesh',
        'last_name': 'Operator',
        'phone': '9016763191',
        'role': 'wtp_operator',
    },
    {
        'username': 'mahendra.wtp',
        'first_name': 'Mahendra',
        'last_name': 'Operator',
        'phone': '7046115679',
        'role': 'wtp_operator',
    },
    {
        'username': 'vijay.vaghela',
        'first_name': 'Vijay',
        'last_name': 'Vaghela',
        'phone': '9924825383',
        'role': 'wtp_operator',
    },
    {
        'username': 'pankaj.baranda',
        'first_name': 'Pankaj',
        'last_name': 'Baranda',
        'phone': '9687523328',
        'role': 'wtp_operator',
    },
    {
        'username': 'hardik.wtp',
        'first_name': 'Hardik',
        'last_name': 'Operator',
        'phone': '7203834760',
        'role': 'wtp_operator',
    },
    {
        'username': 'prakash.wtp',
        'first_name': 'Prakash',
        'last_name': 'Operator',
        'phone': '9737730892',
        'role': 'wtp_operator',
    },
    {
        'username': 'jaspal.wtp',
        'first_name': 'Jaspal',
        'last_name': 'Operator',
        'phone': '7698767806',
        'role': 'wtp_operator',
    },
    {
        'username': 'kamlesh.wtp',
        'first_name': 'Kamlesh',
        'last_name': 'Operator',
        'phone': '9879569273',
        'role': 'wtp_operator',
    },
    {
        'username': 'ishwar.wtp',
        'first_name': 'Ishwar',
        'last_name': 'Operator',
        'phone': '9723863251',
        'role': 'wtp_operator',
    },
    {
        'username': 'pravin.wtp',
        'first_name': 'Pravin',
        'last_name': 'Operator',
        'phone': '7874852060',
        'role': 'wtp_operator',
    },
    # 6. HVAC Engineer
    {
        'username': 'rajesh.mangwani',
        'first_name': 'Rajesh Kumar',
        'last_name': 'Mangwani',
        'phone': '9644945675',
        'role': 'hvac_engineer',
    },
    # 7. HVAC Supervisors
    {
        'username': 'kushal.patel',
        'first_name': 'Kushal',
        'last_name': 'Patel',
        'phone': '7622059360',
        'role': 'hvac_supervisor',
    },
    {
        'username': 'umesh.khetani',
        'first_name': 'Umesh',
        'last_name': 'Khetani',
        'phone': '8485932077',
        'role': 'hvac_supervisor',
    },
    # 8. HVAC Operators / Technicians
    {
        'username': 'sunil.makwana',
        'first_name': 'Sunil',
        'last_name': 'Makwana',
        'phone': '8347927646',
        'role': 'hvac_operator',
    },
    {
        'username': 'kuldeep.patel',
        'first_name': 'Kuldeep',
        'last_name': 'Patel',
        'phone': '8980668066',
        'role': 'hvac_operator',
    },
    {
        'username': 'manoj.dantani',
        'first_name': 'Manoj',
        'last_name': 'Dantani',
        'phone': '9724156013',
        'role': 'hvac_operator',
    },
    {
        'username': 'arun.bariya',
        'first_name': 'Arun',
        'last_name': 'Bariya',
        'phone': '8155070543',
        'role': 'hvac_operator',
    },
    {
        'username': 'mitesh.sharma',
        'first_name': 'Mitesh',
        'last_name': 'Sharma',
        'phone': '9909234092',
        'role': 'hvac_operator',
    },
    {
        'username': 'pankaj.chauhan',
        'first_name': 'Pankaj',
        'last_name': 'Chauhan',
        'phone': '9898808661',
        'role': 'hvac_operator',
    },
    {
        'username': 'vishal.makwana',
        'first_name': 'Vishal',
        'last_name': 'Makwana',
        'phone': '8141662948',
        'role': 'hvac_operator',
    },
    {
        'username': 'vipul.parmar',
        'first_name': 'Vipul',
        'last_name': 'Parmar',
        'phone': '9510465497',
        'role': 'hvac_operator',
    },
    {
        'username': 'kiran.dabhi',
        'first_name': 'Kiran',
        'last_name': 'Dabhi',
        'phone': '7041147485',
        'role': 'hvac_operator',
    },
    {
        'username': 'maruf.shekh',
        'first_name': 'Maruf',
        'last_name': 'Shekh',
        'phone': '7574008870',
        'role': 'hvac_operator',
    },
]

DUMMY_USERNAMES_TO_DEACTIVATE = [
    'ravi.patel',
    'suresh.kumar',
    'operator.electrical',
    'operator',
    'supervisor',
    'wtp.operator',
    'wtp.supervisor',
    'wtp.engineer',
    'engineer',
    'wtp_engineer',
    'wtp_supervisor',
    'wtp_operator',
    'engineer_test',
    'test_operator_hvac',
    'hvac.operator',
    'hvac_operator',
    'hvac.engineer',
    'hvac_engineer',
    'hvac.supervisor',
    'hvac_supervisor',
]

class Command(BaseCommand):
    help = 'Provision real staff for Substation, WTP-STP, and HVAC, and deactivate placeholder accounts.'

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE('=== Provisioning Real Staff Accounts ==='))

        created_count = 0
        updated_count = 0

        for item in STAFF_DATA:
            username = item['username']
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    'first_name': item['first_name'],
                    'last_name': item['last_name'],
                    'phone': item['phone'],
                    'role': item['role'],
                    'is_active': True,
                }
            )

            user.first_name = item['first_name']
            user.last_name = item['last_name']
            user.phone = item['phone']
            user.role = item['role']
            user.is_active = True
            user.set_password(DEFAULT_PASSWORD)
            user.save()

            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f"  + Created: {username} ({user.get_full_name()}) [{user.role}]"))
            else:
                updated_count += 1
                self.stdout.write(self.style.SUCCESS(f"  ~ Updated: {username} ({user.get_full_name()}) [{user.role}]"))

        # Deactivate dummy test accounts
        self.stdout.write(self.style.NOTICE('\n=== Deactivating Old Dummy Test Accounts ==='))
        deactivated_count = 0
        for dummy_uname in DUMMY_USERNAMES_TO_DEACTIVATE:
            try:
                dummy_user = User.objects.get(username=dummy_uname)
                if dummy_user.is_active:
                    dummy_user.is_active = False
                    dummy_user.save(update_fields=['is_active'])
                    deactivated_count += 1
                    self.stdout.write(self.style.WARNING(f"  - Deactivated: {dummy_uname}"))
            except User.DoesNotExist:
                pass

        self.stdout.write(self.style.SUCCESS(
            f"\nDone! Created: {created_count}, Updated: {updated_count}, Deactivated Dummies: {deactivated_count}"
        ))

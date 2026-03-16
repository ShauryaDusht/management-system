from django.core.management.base import BaseCommand
from django.db import transaction
from apps.users.models import User
from apps.housekeeping.models import HKWorker

class Command(BaseCommand):
    help = 'Update staff emails, phones, and pay codes, and specific worker names/pay codes.'

    def handle(self, *args, **kwargs):
        # ── 1. Update Staff Users ─────────────────────────────────────────────
        staff_updates = [
            {'name': 'Bharatkumar Solanki', 'pay_code': '465', 'email': 'bharat2545007@gmail.com'},
            {'name': 'Ashokbhai', 'pay_code': '2', 'email': 'ashok2969798@gmail.com'}, # RATHOD ASHOKBHAI ISHWARBHAI
            {'name': 'Narendra Shrimali', 'pay_code': '328', 'email': 'narendrashrimali36262@gmail.com'},
            {'name': 'Moulik Patel', 'pay_code': '7', 'email': 'moulikpatel81290@gmail.com'},
            {'name': 'Pradip', 'pay_code': '460', 'email': 'pradipchauhan783@gmail.com'}, # Adding gmail.com assuming user missed it
            {'name': 'Mukesh Vaghela', 'pay_code': '466', 'email': 'm.vaghela23@gmail.com'},
            {'name': 'Bipin Vaghela', 'pay_code': '350', 'email': 'bipin.vaghela4u@gmail.com'},
            {'name': 'Sailesh Prajapati', 'pay_code': '4', 'email': ''},
            {'name': 'Kaushik Parmar', 'pay_code': '396', 'email': 'kaushikparmar7673@gmail.com'},
            {'name': 'Jaimin', 'phone': '7600738945', 'pay_code': '318', 'email': 'hostel.caretaker@iitgn.ac.in'},
            {'name': 'Ram Singh Airi', 'phone': '9687460280', 'pay_code': '11', 'email': 'ramairi1198@gmail.com'},
            {'name': 'Priyanka', 'phone': '6353228604', 'pay_code': '237', 'email': 'priyankavijayparmar27@gmail.com'}, # Added gmail
            {'name': 'Anita', 'phone': '9512389739', 'pay_code': '10', 'email': 'anitavaghela98@gmail.com'},
            {'name': 'Pankaj', 'phone': '9904803975', 'pay_code': '293', 'email': 'pankajsingh2753@gmail.com'},
            {'name': 'Anil', 'phone': '8155037413', 'pay_code': '300', 'email': 'anil8155037413@gmail.com'},
            {'name': 'Nikul', 'phone': '9714730290', 'pay_code': '427', 'email': 'nikulsinghbhola862@gmail.com'}, # Added gmail
            {'name': 'Vishwajeet Mishra', 'phone': '9898037530', 'pay_code': 'A8', 'email': 'mishra.vishwajeet@iitgn.ac.in'}, # Actually pay code is "8" in ref list or A8
            {'name': 'Rushita', 'phone': '7083740424', 'pay_code': '294', 'email': ''}, # Rhushita Chavda
        ]

        # Additional matching terms to catch slight spelling differences
        name_matching = {
            'Ashokbhai': 'Ashok',
            'Narendra Shrimali': 'Narendra',
            'Moulik Patel': 'Maulik',
            'Pradip': 'Pradip',
            'Mukesh Vaghela': 'Mukesh',
            'Bipin Vaghela': 'Bipin',
            'Sailesh Prajapati': 'Sailesh',
            'Kaushik Parmar': 'Kaushik',
            'Jaimin': 'Jaimin',
            'Ram Singh Airi': 'Ram',
            'Priyanka': 'Priyanka',
            'Anita': 'Anita',
            'Pankaj': 'Pankaj',
            'Anil': 'Anil',
            'Nikul': 'Nikul',
            'Vishwajeet Mishra': 'Vishwajeet',
            'Rushita': 'Rushita',
            'Rhushita': 'Rushita',
            'Bharatkumar Solanki': 'Bharat'
        }
        
        # Override mis-typed A8 since users in ref list show "8" for Vishwajeet
        for u in staff_updates:
            if u['pay_code'] == 'A8':
                u['pay_code'] = '8'

        self.stdout.write("--- UPDATING USERS ---")
        try:
            with transaction.atomic():
                users = User.objects.all()
                found_count = 0
                for update in staff_updates:
                    match_key = name_matching.get(update['name'], update['name'].split()[0])
                    
                    user = next((u for u in users if match_key.lower() in u.get_full_name().lower() or match_key.lower() in u.username.lower()), None)
                    if not user and 'pay_code' in update:
                        # try matching by paycode
                         user = next((u for u in users if u.pay_code == update['pay_code']), None)

                    if user:
                        changed = False
                        if 'email' in update and update['email']:
                            user.email = update['email']
                            changed = True
                        if 'phone' in update and update['phone']:
                            user.phone = update['phone']
                            changed = True
                        if 'pay_code' in update and update['pay_code']:
                            user.pay_code = update['pay_code']
                            changed = True
                        
                        if changed:
                            user.save()
                            self.stdout.write(self.style.SUCCESS(f"Updated User: {user.get_full_name()} (PayCode: {user.pay_code})"))
                            found_count += 1
                    else:
                        self.stdout.write(self.style.WARNING(f"WARNING: Could not find user matching {update['name']}"))
                
                self.stdout.write(self.style.SUCCESS(f"Finished updating {found_count}/{len(staff_updates)} mapped users."))
                
                
                # ── 2. Update specific Housekeeping Workers ─────────────────────────────
                self.stdout.write("\n--- UPDATING HK WORKERS ---")
                
                worker_updates = [
                    # 1. Aiban hostel: kailashben parmar -> paycode 143 (update name according to xlsx)
                    # From the provided reference: 44 | 143 | KAILASHBEN PARMAR | HK
                    {'current_search': 'kailashben', 'new_pay_code': '143', 'new_name': 'KAILASHBEN PARMAR'},
                    
                    # 2. Hostel Emiet: solanki nikulbhai -> pay code 446 (check from xlsx)
                    # Reference: 141 | 446 | SOLANKI NIKULBHAI RAJESHBHAI | HK
                    {'current_search': 'solanki nikul', 'new_pay_code': '446', 'new_name': 'SOLANKI NIKULBHAI RAJESHBHAI'},
                    
                    # 3. Griwish hostel: pay code 363 to 115 and update name to jigneshbhai madhabhai tumbadiya
                    # Reference: 33 | 115 | JIGNESBHAI MADHABHAI TUMBADIYA | HK
                    {'current_search': '115|363|jignesh', 'new_pay_code': '115', 'new_name': 'JIGNESBHAI MADHABHAI TUMBADIYA'},
                    
                    # 4. Guest house new: pay code 542 change to 269 and name is anil harshadbhai thakor
                    # Reference: 77 | 269 | ANILKUMAR BHUPATJI THAKOR | HK
                    {'current_search': '269|542|anil thakor', 'new_pay_code': '269', 'new_name': 'ANILKUMAR BHUPATJI THAKOR'},
                    
                    # 5. Guest house new: pay code 123 change this to 291 and name is gofulbhai vaghela
                    # Reference: 83 | 291 | HITESHKUMAR GAFULBHAI VAGHELA | HK
                    {'current_search': '291|123|gafulbhai', 'new_pay_code': '291', 'new_name': 'HITESHKUMAR GAFULBHAI VAGHELA'},
                    
                    # 6. Director banglow: pay code 82 change to 311 and name is sailesh ugarbhai vaghela
                    # Reference: 92 | 311 | VAGHELA SHAILESHKUMAR | HK
                    {'current_search': '311|82|sailesh', 'new_pay_code': '311', 'new_name': 'VAGHELA SHAILESHKUMAR'},
                    
                    # 7. Research park: pay code 266 change to 82 and name update according to pay code match
                    # Reference: 11 | 82 | VAGHELA SHAILESHBHAI | HK
                    {'current_search': '82|266|shaileshk', 'new_pay_code': '82', 'new_name': 'VAGHELA SHAILESHBHAI'},
                ]
                
                workers = HKWorker.objects.all()
                
                for update in worker_updates:
                    search_terms = update['current_search'].split('|')
                    found_worker = None
                    
                    # Try to locate the worker by intersecting name and paycode search patterns
                    for worker in workers:
                        worker_name_lower = worker.name.lower()
                        worker_pay_lower = worker.pay_code.lower()
                        for term in search_terms:
                            t = term.lower()
                            if t in worker_name_lower or t == worker_pay_lower:
                                found_worker = worker
                                break
                        if found_worker:
                            break
                    
                    if found_worker:
                        old_name = found_worker.name
                        old_pc = found_worker.pay_code
                        found_worker.name = update['new_name']
                        found_worker.pay_code = update['new_pay_code']
                        found_worker.save()
                        self.stdout.write(self.style.SUCCESS(f"Updated HK Worker: '{old_name}' (PC: {old_pc}) -> '{found_worker.name}' (PC: {found_worker.pay_code})"))
                    else:
                        self.stdout.write(self.style.WARNING(f"WARNING: Could not locate HK worker with search terms match: {update['current_search']}"))

        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Transaction failed: {str(e)}"))

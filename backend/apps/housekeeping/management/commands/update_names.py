"""
Update full names for supervisors, caretakers (User model) and workers (HKWorker model).
Run inside Docker:
  docker exec inventory-management-backend-1 python manage.py update_names
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.housekeeping.models import HKWorker

# ── Supervisors: username → (first_name, last_name) ─────────────────────────
# Canonical name: "RATHOD ASHOKBHAI ISHWARBHAI" → title-cased
SUPERVISOR_NAMES = {
    'ashok.rathod':        ('Ashokbhai Ishwarbhai', 'Rathod'),
    'pradip.swm':          ('Dinesh', 'Chauhan'),
    'shailesh.prajapati':  ('Shailesh Natvarbhai', 'Prajapati'),
    'maulik.patel':        ('Maulikkumar Dilipbhai', 'Patel'),
    'narendra.shreemali':  ('Narendrakumar Natvarlal', 'Shrimali'),
    'bipin.vaghela':       ('Bipinchandra Dineshkumar', 'Vaghela'),
    'kaushik.parmar':      ('Kaushikkumar Balvantbhai', 'Parmar'),
    'bharat.solanki':      ('Bharatkumar', 'Solanki'),
    'mukesh.vaghela':      ('Mukeshkumar', 'Vaghela'),
}

# ── Caretakers: username → (first_name, last_name) ──────────────────────────
CARETAKER_NAMES = {
    'priyanka':         ('Priyanka Vijaykumar', 'Parmar'),
    'pankaj':           ('Pankajsinh Amarsinh', 'Bihola'),
    'rushita':          ('Rhushita Chetankumar', 'Chavda'),
    'anil.caretaker':   ('Anil', 'Solanki'),
    'vishwajeet':       ('Vishvajeet', 'Kumar'),
    'ramsingh':         ('Ramprakash Lembabhai', 'Parmar'),
    'jaimin':           ('Jaimin', 'Parmar'),
    'anita':            ('Manisha', 'Thapa'),
    'nikul.caretaker':  ('Nikulsinh Ashoksinh', 'Bihola'),
}

# ── Workers: current DB name → new full name ─────────────────────────────────
WORKER_NAMES = {
    # Canonical: SURESHBHAI DAHYABHAI SOLANKI
    'Suresh Solanki':    'Sureshbhai Dahyabhai Solanki',
    'Suresh':            'Sureshbhai Dahyabhai Solanki',
    # GURJAR CHANDRIKABEN
    'Chandrikaben':      'Gurjar Chandrikaben',
    # GURJAR HASHAMUKHBHAI M
    'Hasmukhbhai':       'Gurjar Hashamukhbhai M',
    # JADAV MINABEN / MINABEN
    'Meena Ben':         'Jadav Minaben',
    'Minaben':           'Jadav Minaben',
    # SOLANKI HASHMUKH
    'Hasmukh Solanki':   'Solanki Hashmukh',
    # YOGESHBHAI KANTIBHAI VAGHELA
    'Yogesh Vaghela':    'Yogeshbhai Kantibhai Vaghela',
    # VAGHELA SHAILESHBHAI (Research Park)
    'Shailesh Vaghela':  'Vaghela Shaileshbhai',
    # SOLANKI DINESHKUMAR VINUBHAI
    'Dharmishtaben':     'Solanki Dineshkumar Vinubhai',
    'Dineshbhai Purohit':'Solanki Dineshkumar Vinubhai',
    # MUKESHBHAI RAVJIBHAI VAGHELA
    'Mukesh':            'Mukeshbhai Ravjibhai Vaghela',
    # NARESH PARMAR
    'Naresh':            'Naresh Parmar',
    # PRAVINBHAI MOTIBHAI MAHIDA
    'Pravin Maida':      'Pravinbhai Motibhai Mahida',
    # RATHOD AJAYKUMAR
    'Ajay Rathod':       'Rathod Ajaykumar',
    # PIWAL JITENDRABHAI MANOHARBHAI
    'Jitendra':          'Piwal Jitendrabhai Manoharbhai',
    # TALAVADI SHAILESHBHAI RAMANBHAI
    'Shailesh Talvadi':  'Talavadi Shaileshbhai Ramanbhai',
    'Shaileshbhai':      'Talavadi Shaileshbhai Ramanbhai',
    # KAILASHBEN VAGHELA
    'Kailashben M':      'Kailashben Vaghela',
    # GURJAR KETAN AMRUTBHAI
    'Ketan Gujjar':      'Gurjar Ketan Amrutbhai',
    # VASANTIBEN JITENDRABHAI VORA
    'Jitendra Vasudev':  'Vasudev Jitendrakumar Baldevbhai',
    # KAILASHBEN PARMAR (102)
    'Kailash B':         'Kailashben Parmar',
    # TALVADI RAJESHKUMAR
    'Rajesh':            'Talvadi Rajeshkumar',
    # JAY KUMAR SOLANKI
    'Jay':               'Jay Kumar Solanki',
    # MEHULKUMAR JADEJA
    'Mehul Jadeja':      'Mehulkumar Jadeja',
    # VAGHELA RAKESHBHAI AMBALAL
    'Rakeshbhai':        'Vaghela Rakeshbhai Ambalal',
    # SHAILESH BHANGI
    'Sailesh Vaghela':   'Shailesh Bhangi',
    # AMITKUMAR VAGHELA
    'Amit':              'Amitkumar Vaghela',
    # SATISHBHAI VANIYA
    'Satish':            'Satishbhai Vaniya',
    # ASHOKKUMAR MAHERIYA
    'Ashokbhai Thakor':  'Ashokkumar Maheriya',
    'Ashok':             'Ashokkumar Maheriya',
    # RAJENDRABHAI CHANDUBHAI VAGHELA
    'Rajendra':          'Rajendrabhai Chandubhai Vaghela',
    # HARISHKUMAR SOLANKI
    'Harish':            'Harishkumar Solanki',
    # HITESH KUMAR VAGHELA
    'Hitesh Vaghela':    'Hitesh Kumar Vaghela',
    # PARMAR ANJANABEN KALPESHKUMAR
    'Anjanaben':         'Parmar Anjanaben Kalpeshkumar',
    # DHIRAJ SOLANKI
    'Dhiraj':            'Dhiraj Solanki',
    # PARMAR VINAY VALJIBHAI
    'Vinay':             'Parmar Vinay Valjibhai',
    # RATHOD VARSHABEN
    'Varshaben':         'Rathod Varshaben',
    # JAGDISHBHAI SHIVABHAI CHAVADA
    'Jagdish':           'Jagdishbhai Shivabhai Chavada',
    # CHAVADA BHAVANABEN KISHORBHAI
    'Bhavnaben':         'Chavada Bhavanaben Kishorbhai',
    # VAGHELA SANGITABEN
    'Sangeeta Ben':      'Vaghela Sangitaben',
    # GITABEN PARMAR
    'Geeta Ben':         'Gitaben Parmar',
    # SOLANKI SURYABEN BHARATBHAI
    'Surya Ben':         'Solanki Suryaben Bharatbhai',
    # SOLANKI KRUNAL AMRUTBHAI
    'Krunal':            'Solanki Krunal Amrutbhai',
    # RATHOD SHAILESHBHAI
    'Shailesh Rathod':   'Rathod Shaileshbhai',
    # SOLANKI VINAYAK
    'Vinayak Solanki':   'Solanki Vinayak',
    # PARMAR PRAHLADBHAI
    'Prahlad Parmar':    'Parmar Prahladbhai',
    # RAVIKUMAR AMBALAL BHANGI
    'Ravi':              'Ravikumar Ambalal Bhangi',
    # VAGHELA PRAVINBHAI
    'Pravin Vaghela':    'Vaghela Pravinbhai',
    # JADEJA DHAVALKUMAR KANTIBHAI
    'Dhaval Jadeja':     'Jadeja Dhavalkumar Kantibhai',
    # CHAMPABEN VAGHELA
    'Champa Ben':        'Champaben Vaghela',
    # SOLANKI AKASHKUMAR HASMUKHBHAI
    'Mahendra Makwana':  'Mahendra D Makvana',
    # RATHOD MEHULKUMAR
    'Mehul Rathod':      'Rathod Mehulkumar',
    # SOHILKUMAR VAGHELA
    'Sohil Vaghela':     'Sohilkumar Vaghela',
    # SOLANKI MAYUR JASHUBHAI
    'Mayur':             'Solanki Mayur Jashubhai',
    # SOLANKI JAYDIP MAHENDRABHAI
    'Jaydeep Solanki':   'Solanki Jaydip Mahendrabhai',
    # KARAN VAGHELA
    'Karan':             'Karan Vaghela',
    # NITIN ISHWARBHAI MAKWANA
    'Nitin Makwana':     'Nitin Ishwarbhai Makwana',
    # VAGHELA DHARMISHTHA BEN
    'Dharmishtaben':     'Vaghela Dharmishtha Ben',
    # MAHESH SOLANKI
    'Mahesh Solanki':    'Mahesh Solanki',
    # ANILKUMAR BHUPATJI THAKOR
    'Anil Thakur':       'Anilkumar Bhupatji Thakor',
    'Anil Thakor':       'Thakor Anilkumar Naginji',
    # SOLANKI HARSHADBHAI DINESHBHAI
    'Harshad':           'Solanki Harshadbhai Dineshbhai',
    # AJAYKUMAR SOLANKI
    'Ashok':             'Ajaykumar Solanki',
    'Satish bhai Raval': 'Ajaykumar Solanki',
    # RUDRESHABEN SANDIPKUMAR SOLANKI
    'Naveenbhai Chauhan':'Rudreshaben Sandipkumar Solanki',
    # SOLANKI CHANDRKANT
    'Chandrakant':       'Solanki Chandrkant',
    # PURBIYA AJAY HARSHADBHAI
    'Ajay Purabiya':     'Purbiya Ajay Harshadbhai',
    # HITESHKUMAR GAFULBHAI VAGHELA
    'Akshay Vaghela':    'Hiteshkumar Gafulbhai Vaghela',
    # VAGHELA CHIRAG MOHANBHAI
    'Chirag Vaghela':    'Vaghela Chirag Mohanbhai',
    # VAGHELA SANJAYKUMAR BABUBHAI
    'Sanjay Vaghela':    'Vaghela Sanjaykumar Babubhai',
    # PARMAR RAKESHKUMAR ISHVARBHAI
    'Pankaj Parmar':     'Parmar Rakeshkumar Ishvarbhai',
    # RAVAL SHAILESHKUMAR ISHVARBHAI
    'Shailesh Ravel':    'Raval Shaileshkumar Ishvarbhai',
    # HITENKUMAR PARMAR
    'Hiten':             'Hitenkumar Parmar',
    # AKSHYBHAI VAGHELA
    'Satish Vaghela':    'Akshybhai Vaghela',
    # PARMAR NIKULKUMAR PUNJABHAI
    'Elesh':             'Parmar Nikulkumar Punjabhai',
    # PARMAR ANANDKUMAR
    'Anand':             'Parmar Anandkumar',
    # VANIYA NIKHILKUMAR BHAVESHBHAI
    'Nikhil':            'Vaniya Nikhilkumar Bhaveshbhai',
    # VAGHELA BHAVESHBHAI NARNABHAI
    'Bhavesh':           'Vaghela Bhaveshbhai Narnabhai',
    # LALITBHAI PARMAR
    'Lalit Parmar':      'Lalitbhai Parmar',
    # PARMAR VIJAYKUMAR
    'Vijay Parmar':      'Parmar Vijaykumar',
    # SOLANKI BHANUBEN JAGDISHBHAI
    'Bhanu Ben':         'Solanki Bhanuben Jagdishbhai',
    # GAUTAMBHAI VAGHELA
    'Gautam Vaghela':    'Gautambhai Vaghela',
    # VAGHELA RAHULKUMAR JASUBHAI
    'Rahul Vaghela':     'Vaghela Rahulkumar Jasubhai',
    # CHAUHAN RAJESHKUMAR RANCHHODJI
    'Rajesh Chauhan':    'Chauhan Rajeshkumar Ranchhodji',
    # PARMAR CHANDRIKABEN
    'Kunal Parmar':      'Parmar Chandrikaben',
    # VAGHELA PADMA
    'Padmaben Vaghela':  'Vaghela Padma',
    # MAKWANA SUNILBHAI AMRUTBHAI
    'Sunil Makwana':     'Makwana Sunilbhai Amrutbhai',
    # THAKOR AJAYKUMAR PRAHLADJI
    'Ajay Thakor':       'Thakor Ajaykumar Prahladji',
    # RAJENDRA AMATHABHAI CHAVDA
    'Rajendra Chavda':   'Rajendra Amathabhai Chavda',
    # SONALA MANISHABEN
    'Manisha Ben':       'Sonala Manishaben',
    # PARMAR RITABEN
    'Reeta Ben':         'Parmar Ritaben',
    # BHANGI ILESHBHAI ISHVARBHAI
    'Salesh bhai Thakur':'Bhangi Ileshbhai Ishvarbhai',
    # BHANGI BHRATKUMAR BABUBHAI
    'Banshi':            'Bhangi Bhratkumar Babubhai',
    # JIGNESHKUMAR BABUBHAI SOLANKI
    'Jignesh':           'Jigneshkumar Babubhai Solanki',
    'Jignesh Solanki':   'Jigneshkumar Babubhai Solanki',
    # MAKWANA NIKHIL
    'Nikul Solanki':     'Makwana Nikhil',
    # THAKOR MAHESHJI
    'Kanji Thakor':      'Thakor Maheshji',
    # HARSHADKUMAR VAGHELA
    'Harshadkumar':      'Harshadkumar Vaghela',
    # VASUDEV JITENDRAKUMAR BALDEVBHAI
    'Jitendra Vasudev':  'Vasudev Jitendrakumar Baldevbhai',
    # SOLANKI PARTHKUMAR JAGDISHBHAI
    'Parth Solanki':     'Solanki Parthkumar Jagdishbhai',
    # SOLANKI ANITABEN RAMESHBHAI
    'Anita Solanki':     'Solanki Anitaben Rameshbhai',
    # MITTALBEN VAGHELA
    'Mital Ben':         'Mittalben Vaghela',
    # SIKANDARBHAI DUNGARBHAI BHANGI (uses 389)
    'Salesh bhai Thakur':'Sikandarbhai Dungarbhai Bhangi',
    # PARMAR KRUNALBHAI
    'Rajnibhai Parmar':  'Parmar Krunalbhai',
    # MUKESH KUMAR PARMAR
    'Mukesh Parmar':     'Mukesh Kumar Parmar',
    # PANKAJKUMAR KANTIBHAI CHAMAR
    'Raju Chamar':       'Pankajkumar Kantibhai Chamar',
    # PRAVINBHAI VAGHELA
    'Ravi':              'Pravinbhai Vaghela',
    # VAGHELA MAHESHBHAI DINESHBHAI
    'Mahesh Vaghela':    'Vaghela Maheshbhai Dineshbhai',
    'Mahesh Raval':      'Vaghela Maheshbhai Dineshbhai',
    # PARAMAR GAUTAMKUMAR
    'Gautam Parmar':     'Paramar Gautamkumar',
    # CHAUHAN NILAMBEN
    'Nilamben':          'Chauhan Nilamben',
    # RAMESHBHAI NARSINHBHAI PARMAR
    'Ramesh Parmar':     'Rameshbhai Narsinhbhai Parmar',
    # PATEL SANGITABEN MAHESHBHAI
    'Sangeetaben Patel': 'Patel Sangitaben Maheshbhai',
    'Retuben Solanki':   'Patel Sangitaben Maheshbhai',
    # AXAYKUMAR RAMESHBHAI PARMAR
    'Akshay Parmar':     'Axaykumar Rameshbhai Parmar',
    # RATHOD SONALBEN DILIPKUMAR
    'Sonal Ben':         'Rathod Sonalben Dilipkumar',
    # PARMAR RAJESHBHAI
    'Rajesh':            'Parmar Rajeshbhai',
    'Rajnibhai':         'Parmar Rajeshbhai',
    # RAHULKUMAR RATHOD
    'Rohit Thakor':      'Rahulkumar Rathod',
    # DIPIKABEN HASAMUKHBHAI PARMAR
    'Deepika Ben':       'Dipikaben Hasamukhbhai Parmar',
    # SHILPABEN D CHAUHAN
    'Shilpa Ben':        'Shilpaben D Chauhan',
    # VAGHELA UTTAMBHAI
    'Uttam Vaghela':     'Vaghela Uttambhai',
    # RAMESHBHAI AMBALAL PARMAR
    'Ramesh Sports':     'Rameshbhai Ambalal Parmar',
    # PARMAR BHADRESHKUMAR NATVARLAL
    'Rakesh Parmar':     'Parmar Bhadreshkumar Natvarlal',
    # HITESHBHAI SOLANKI
    'Hitesh Solanki':    'Hiteshbhai Solanki',
    # BABARIYA UMESH
    'Umesh Babariya':    'Babariya Umesh',
    # PARMAR DEVENDRA DALPATBHAI
    'Devendra':          'Parmar Devendra Dalpatbhai',
    # RAKESHBHAI CHAVADA
    'Rakesh':            'Rakeshbhai Chavada',
    # SOLANKI NIKULBHAI RAJESHBHAI
    'Nikul Solanki':     'Solanki Nikulbhai Rajeshbhai',
    # JAYDIP DINESHBHAI VAGHELA
    'Jaydeep Vaghela':   'Jaydip Dineshbhai Vaghela',
    # SONARA HITENDRAKUMAR PUNJABHAI
    'Hiten':             'Sonara Hitendrakumar Punjabhai',
    # SOLANKI JAYAKESHKUMAR
    'Jaykesh':           'Solanki Jayakeshkumar',
    # BRAHAMANIYA DARSHANKUMAR SANABHAI (no DB match yet)
    # SUMIT SOLANKI
    'Sumit Solanki':     'Sumit Solanki',
    # MESARIYA SURESHBHAI
    'Suresh':            'Mesariya Sureshbhai',
    # VAGHELA SUNILKUMAR RAJUBHAI
    'Baldevbhai Vaghela':'Vaghela Sunilkumar Rajubhai',
    # CHAUHAN HIMANTBHAI BABUBHAI
    'Harsh':             'Chauhan Himantbhai Babubhai',
    # SOLANKI BHAVIKABEN
    'Sangeetaben Patel': 'Solanki Bhavikaben',
    # MAHERIYA HETALBEN ASHOKBHAI
    'Ashok':             'Maheriya Hetalben Ashokbhai',
    # URVASHIBEN NAYANBHAI VAGHELA
    'Saleshbhai Vaghela':'Urvashiben Nayanbhai Vaghela',
    # SOLANKI LALIT
    'Kanti bhai Thakur': 'Solanki Lalit',
    # THAKOR CHIRAG
    'Chirag Thakor':     'Thakor Chirag',
    # THAKOR PRAKASHKUMAR
    'Prakash Thakor':    'Thakor Prakashkumar',
    # THAKOR ANILKUMAR NAGINJI
    'Anil Thakor':       'Thakor Anilkumar Naginji',
    # MUKESHJI THAKOR
    'Mukesh':            'Mukeshji Thakor',
    # NAVDIPKUMAR ASHVINKUMAR SOLANKI  (not found yet)
    # MESARIYA RAJESH
    'Rajesh':            'Mesariya Rajesh',
    # Others
    'Kailashbhai Parmar':'Makvana Rajubhai Manabhai',
    'Mahesh Vaghela':    'Vaghela Shaileshkumar',
    'Jitendra bhai Thakur': 'Vasudev Jitendrakumar Baldevbhai',
    'Salesh bhai Thakur':   'Sikandarbhai Dungarbhai Bhangi',
    'Naveenbhai Chauhan':   'Rudreshaben Sandipkumar Solanki',
}


class Command(BaseCommand):
    help = 'Update full canonical names for supervisors, caretakers, and workers.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='Preview changes without saving.')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        User = get_user_model()

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes saved.\n'))

        # ── Supervisors ──────────────────────────────────────────────────────
        self.stdout.write(self.style.HTTP_INFO('=== SUPERVISORS ==='))
        su = 0
        for username, (first, last) in SUPERVISOR_NAMES.items():
            u = User.objects.filter(username=username).first()
            if not u:
                self.stdout.write(f'  [NOT FOUND] {username}')
                continue
            if u.first_name != first or u.last_name != last:
                old = u.get_full_name()
                if not dry_run:
                    u.first_name = first
                    u.last_name = last
                    u.save(update_fields=['first_name', 'last_name'])
                self.stdout.write(f'  [{"DRY" if dry_run else "UPDATED"}] {old!r} → {first} {last!r}')
                su += 1
            else:
                self.stdout.write(f'  [OK] {u.get_full_name()} already correct')
        self.stdout.write(f'  >> supervisors updated={su}\n')

        # ── Caretakers ───────────────────────────────────────────────────────
        self.stdout.write(self.style.HTTP_INFO('=== CARETAKERS ==='))
        cu = 0
        for username, (first, last) in CARETAKER_NAMES.items():
            u = User.objects.filter(username=username).first()
            if not u:
                self.stdout.write(f'  [NOT FOUND] {username}')
                continue
            if u.first_name != first or u.last_name != last:
                old = u.get_full_name()
                if not dry_run:
                    u.first_name = first
                    u.last_name = last
                    u.save(update_fields=['first_name', 'last_name'])
                self.stdout.write(f'  [{"DRY" if dry_run else "UPDATED"}] {old!r} → {first} {last!r}')
                cu += 1
            else:
                self.stdout.write(f'  [OK] {u.get_full_name()} already correct')
        self.stdout.write(f'  >> caretakers updated={cu}\n')

        # ── Workers ──────────────────────────────────────────────────────────
        # Use pay_code-based matching to give unique accurate updates
        self.stdout.write(self.style.HTTP_INFO('=== WORKERS (by pay_code) ==='))

        # Pay code → canonical name (from user-provided list)
        PAY_CODE_TO_NAME = {
            '73':  'Sureshbhai Dahyabhai Solanki',
            '74':  'Gurjar Chandrikaben',
            '75':  'Gurjar Hashamukhbhai M',
            '76':  'Jadav Minaben',
            '77':  'Solanki Hashmukh',
            '80':  'Yogeshbhai Kantibhai Vaghela',
            '82':  'Vaghela Shaileshbhai',
            '83':  'Solanki Dineshkumar Vinubhai',
            '88':  'Mukeshbhai Ravjibhai Vaghela',
            '89':  'Naresh Parmar',
            '91':  'Pravinbhai Motibhai Mahida',
            '93':  'Rathod Ajaykumar',
            '95':  'Piwal Jitendrabhai Manoharbhai',
            '97':  'Talavadi Shaileshbhai Ramanbhai',
            '98':  'Kailashben Vaghela',
            '100': 'Gurjar Ketan Amrutbhai',
            '101': 'Vasantiben Jitendrabhai Vora',
            '102': 'Kailashben Parmar',
            '103': 'Rajanikant Babubhai Vaghela',
            '104': 'Talvadi Rajeshkumar',
            '105': 'Jay Kumar Solanki',
            '106': 'Mehulkumar Jadeja',
            '108': 'Vaghela Rakeshbhai Ambalal',
            '109': 'Shailesh Bhangi',
            '110': 'Amitkumar Vaghela',
            '111': 'Gurjar Niruben',
            '113': 'Satishbhai Vaniya',
            '114': 'Ashokkumar Maheriya',
            '115': 'Jignesbhai Madhabhai Tumbadiya',
            '121': 'Rajendrabhai Chandubhai Vaghela',
            '122': 'Harishkumar Solanki',
            '123': 'Hitesh Kumar Vaghela',
            '129': 'Manishaben Vaghela',
            '130': 'Parmar Anjanaben Kalpeshkumar',
            '131': 'Dhiraj Solanki',
            '134': 'Vaghela Sugnyaben',
            '136': 'Parmar Vinay Valjibhai',
            '138': 'Rathod Hiteshkumar',
            '139': 'Navdipkumar Ashvinkumar Solanki',
            '142': 'Minaben Vaghela',
            '143': 'Kailashben Parmar',
            '148': 'Mahendra D Makvana',
            '149': 'Bansi Bhangi',
            '150': 'Lilaben Deepakkumar Parmar',
            '152': 'Veghela Pravinbhai Amaratbhai',
            '153': 'Rajanikant Chavda',
            '154': 'Lalabhai Khodabhai Mesariya',
            '156': 'Rathod Varshaben',
            '157': 'Jagdishbhai Shivabhai Chavada',
            '218': 'Chavada Bhavanaben Kishorbhai',
            '219': 'Vaghela Sangitaben',
            '230': 'Gitaben Parmar',
            '231': 'Jyotsanaben Vaghela',
            '233': 'Solanki Suryaben Bharatbhai',
            '235': 'Solanki Krunal Amrutbhai',
            '239': 'Rathod Shaileshbhai',
            '240': 'Solanki Vinayak',
            '242': 'Parmar Prahladbhai',
            '245': 'Ravikumar Ambalal Bhangi',
            '246': 'Vaghela Pravinbhai',
            '248': 'Jadeja Dhavalkumar Kantibhai',
            '249': 'Champaben Vaghela',
            '253': 'Solanki Akashkumar Hasmukhbhai',
            '255': 'Mesariya Rajesh',
            '256': 'Rathod Mehulkumar',
            '257': 'Sohilkumar Vaghela',
            '258': 'Solanki Mayur Jashubhai',
            '259': 'Solanki Jaydip Mahendrabhai',
            '260': 'Karan Vaghela',
            '261': 'Nitin Ishwarbhai Makwana',
            '263': 'Makvana Rajubhai Manabhai',
            '264': 'Vaghela Dharmishtha Ben',
            '266': 'Vaghela Shaileshkumar',
            '267': 'Mahesh Solanki',
            '269': 'Anilkumar Bhupatji Thakor',
            '280': 'Solanki Harshadbhai Dineshbhai',
            '281': 'Ajaykumar Solanki',
            '282': 'Rudreshaben Sandipkumar Solanki',
            '283': 'Solanki Chandrkant',
            '284': 'Purbiya Ajay Harshadbhai',
            '291': 'Hiteshkumar Gafulbhai Vaghela',
            '293': 'Pankajsinh Amarsinh Bihola',
            '294': 'Rhushita Chetankumar Chavda',
            '300': 'Solanki Anil',
            '303': 'Vaghela Chirag Mohanbhai',
            '304': 'Vaghela Sanjaykumar Babubhai',
            '305': 'Parmar Rakeshkumar Ishvarbhai',
            '306': 'Raval Shaileshkumar Ishvarbhai',
            '307': 'Hitenkumar Parmar',
            '308': 'Akshybhai Vaghela',
            '309': 'Parmar Nikulkumar Punjabhai',
            '310': 'Parmar Anandkumar',
            '311': 'Vaghela Shaileshkumar',
            '314': 'Vaniya Nikhilkumar Bhaveshbhai',
            '315': 'Vaghela Bhaveshbhai Narnabhai',
            '316': 'Vishvajeet Kumar',
            '317': 'Parmar Ramprakash Lembabhai',
            '318': 'Jaimin Parmar',
            '319': 'Lalitbhai Parmar',
            '320': 'Vishal Vaghela',
            '329': 'Parmar Vijaykumar',
            '332': 'Solanki Bhanuben Jagdishbhai',
            '333': 'Gautambhai Vaghela',
            '337': 'Vaghela Rahulkumar Jasubhai',
            '338': 'Chauhan Rajeshkumar Ranchhodji',
            '346': 'Parmar Chandrikaben',
            '347': 'Vaghela Padma',
            '348': 'Makwana Sunilbhai Amrutbhai',
            '349': 'Thakor Ajaykumar Prahladji',
            '354': 'Rajendra Amathabhai Chavda',
            '356': 'Sonala Manishaben',
            '357': 'Parmar Ritaben',
            '361': 'Bhangi Ileshbhai Ishvarbhai',
            '362': 'Bhangi Bhratkumar Babubhai',
            '363': 'Jigneshkumar Babubhai Solanki',
            '364': 'Makwana Nikhil',
            '373': 'Thakor Maheshji',
            '375': 'Harshadkumar Vaghela',
            '377': 'Vasudev Jitendrakumar Baldevbhai',
            '384': 'Solanki Parthkumar Jagdishbhai',
            '385': 'Solanki Anitaben Rameshbhai',
            '386': 'Mittalben Vaghela',
            '389': 'Sikandarbhai Dungarbhai Bhangi',
            '390': 'Parmar Krunalbhai',
            '392': 'Mukesh Kumar Parmar',
            '393': 'Pankajkumar Kantibhai Chamar',
            '400': 'Pravinbhai Vaghela',
            '402': 'Vaghela Maheshbhai Dineshbhai',
            '403': 'Paramar Gautamkumar',
            '410': 'Chauhan Nilamben',
            '411': 'Rameshbhai Narsinhbhai Parmar',
            '412': 'Patel Sangitaben Maheshbhai',
            '414': 'Axaykumar Rameshbhai Parmar',
            '415': 'Rathod Sonalben Dilipkumar',
            '416': 'Parmar Rajeshbhai',
            '417': 'Rahulkumar Rathod',
            '418': 'Dipikaben Hasamukhbhai Parmar',
            '419': 'Shilpaben D Chauhan',
            '422': 'Shaileshkumar Vaghela',
            '424': 'Manisha Thapa',
            '427': 'Bihola Nikulsinh Ashoksinh',
            '428': 'Vaghela Uttambhai',
            '429': 'Rameshbhai Ambalal Parmar',
            '431': 'Parmar Bhadreshkumar Natvarlal',
            '434': 'Hiteshbhai Solanki',
            '435': 'Babariya Umesh',
            '437': 'Parmar Devendra Dalpatbhai',
            '438': 'Rakeshbhai Chavada',
            '446': 'Solanki Nikulbhai Rajeshbhai',
            '447': 'Jaydip Dineshbhai Vaghela',
            '448': 'Sonara Hitendrakumar Punjabhai',
            '449': 'Solanki Jayakeshkumar',
            '450': 'Brahamaniya Darshankumar Sanabhai',
            '451': 'Sumit Solanki',
            '454': 'Mesariya Sureshbhai',
            '455': 'Vaghela Sunilkumar Rajubhai',
            '456': 'Chauhan Himantbhai Babubhai',
            '457': 'Solanki Bhavikaben',
            '458': 'Maheriya Hetalben Ashokbhai',
            '459': 'Urvashiben Nayanbhai Vaghela',
            '461': 'Solanki Lalit',
            '464': 'Thakor Chirag',
            '534': 'Thakor Prakashkumar',
            '542': 'Thakor Anilkumar Naginji',
            '801': 'Mukeshji Thakor',
        }

        wu = 0
        wnf = 0
        for w in HKWorker.objects.exclude(pay_code='').select_related():
            canonical = PAY_CODE_TO_NAME.get(w.pay_code)
            if not canonical:
                continue
            if w.name != canonical:
                old = w.name
                if not dry_run:
                    w.name = canonical
                    w.save(update_fields=['name'])
                self.stdout.write(f'  [{"DRY" if dry_run else "UPDATED"}] {old!r} → {canonical!r}')
                wu += 1
            else:
                pass  # already correct — skip printing to keep output short
        self.stdout.write(f'  >> workers updated={wu}\n')

        self.stdout.write(self.style.HTTP_INFO('=== SUMMARY ==='))
        self.stdout.write(f'  supervisors updated: {su}')
        self.stdout.write(f'  caretakers updated: {cu}')
        self.stdout.write(f'  workers updated: {wu}')
        if dry_run:
            self.stdout.write(self.style.WARNING('\nDry run — no changes saved.'))
        else:
            self.stdout.write(self.style.SUCCESS('\nDone — all names updated.'))

"""
Management command: update_pay_codes

Usage:
    python manage.py update_pay_codes           # apply updates
    python manage.py update_pay_codes --dry-run # preview only, no DB changes

Strategy:
- Supervisors/Caretakers: matched by USERNAME (DB stores informal first names,
  not the full canonical government names in the pay slip list).
- Workers: matched by HKWorker.name using exact then partial substring fallback.

Run this inside Docker:
    docker exec inventory-management-backend-1 python manage.py update_pay_codes
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.housekeeping.models import HKWorker

# ── Supervisors — matched by DB username ──────────────────────────────────────
# Canonical pay-slip name → DB username → pay_code
# RATHOD ASHOKBHAI ISHWARBHAI       → ashok.rathod       → 2
# SHAILESH NATVARBHAI PRAJAPATI     → shailesh.prajapati → 4
# MAULIKKUMAR DILIPBHAI PATEL       → maulik.patel       → 7
# CHAUHAN DINESH (pradip.chauhan)   → pradip.chauhan     → 3  (SWM supervisor)
# NARENDRAKUMAR NATVARLAL SHRIMALI  → narendra.shreemali → 328
# VAGHELA BIPINCHANDRA DINESHKUMAR  → bipin.vaghela      → 350
# KAUSHIKKUMAR BALVANTBHAI PARMAR   → kaushik.parmar     → 396
# BHARATKUMAR SOLANKI               → bharat.solanki     → 465
# MUKESHKUMAR VAGHELA               → mukesh.vaghela     → 466
SUPERVISOR_BY_USERNAME = {
    'ashok.rathod':        '2',
    'pradip.chauhan':      '3',
    'shailesh.prajapati':  '4',
    'maulik.patel':        '7',
    'narendra.shreemali':  '328',
    'bipin.vaghela':       '350',
    'kaushik.parmar':      '396',
    'bharat.solanki':      '465',
    'mukesh.vaghela':      '466',
}

# ── Caretakers — matched by DB username ──────────────────────────────────────
# Canonical pay-slip name → DB username → pay_code
# PARMAR PRIYANKA VIJAYKUMAR    → priyanka.parmar      → 237
# PANKAJSINH AMARSINH BIHOLA   → pankaj.bihola        → 293
# RHUSHITA CHETANKUMAR CHAVDA  → rhushita.chavda      → 294
# SOLANKI ANIL                 → anil.solanki         → 300
# VISHVAJEET KUMAR             → vishvajeet.kumar → 316
# PARMAR RAMPRAKASH LEMBABHAI  → ramprakash.parmar    → 317
# JAIMIN PARMAR                → jaimin.parmar        → 318
# SHAILESHKUMAR VAGHELA        → (no DB user)    — skip
# ANITA VAGHELA                -> anita.vaghela       -> 10
# BIHOLA NIKULSINH ASHOKSINH   → nikul.bihola         → 427
# VISHWAJEET MISHRA            → (vishvajeet.kumar already used above)
CARETAKER_BY_USERNAME = {
    'priyanka.parmar':  '237',
    'pankaj.bihola':    '293',
    'rhushita.chavda':  '294',
    'anil.solanki':     '300',
    'vishvajeet.kumar': '316',
    'ramprakash.parmar': '317',
    'jaimin.parmar':    '318',
    'anita.vaghela':    '10',
    'nikul.bihola':     '427',
}

# ── Workers — matched by HKWorker.name ───────────────────────────────────────
# Format: (DB_name_as_stored, pay_code)
# Where DB name doesn't match, the canonical name is shown in comment.
WORKER_PAY_CODES = [
    # Aibaan
    ('Reeta Ben',        '357'),   # PARMAR RITABEN
    ('Meena Ben',        '76'),    # JADAV MINABEN
    ('Kailash B',        '143'),   # KAILASHBEN PARMAR

    # Beuaki
    ('Shilpa Ben',       '419'),   # SHILPABEN D CHAUHAN
    ('Bhanu Ben',        '332'),   # SOLANKI BHANUBEN JAGDISHBHAI
    ('Surya Ben',        '233'),   # SOLANKI SURYABEN BHARATBHAI

    # Chimair
    ('Kailashben M',     '98'),    # KAILASHBEN VAGHELA
    ('Geeta Ben',        '230'),   # GITABEN PARMAR
    ('Manisha Ben',      '356'),   # SONALA MANISHABEN

    # Ijokha
    ('Sangeeta Ben',     '219'),   # VAGHELA SANGITABEN
    ('Sonal Ben',        '415'),   # RATHOD SONALBEN DILIPKUMAR
    ('Champa Ben',       '249'),   # CHAMPABEN VAGHELA

    # Duven
    ('Shailesh Rathod',  '239'),   # RATHOD SHAILESHBHAI
    ('Rajanikant',       '153'),   # RAJANIKANT CHAVDA
    ('Harish',           '122'),   # HARISHKUMAR SOLANKI

    # Emiet
    ('Nikul Solanki',    '446'),   # SOLANKI NIKULBHAI RAJESHBHAI
    ('Jagdish',          '157'),   # JAGDISHBHAI SHIVABHAI CHAVADA
    ('Mahendra Makwana', '148'),   # MAHENDRA D MAKVANA

    # Firpeal
    ('Anand',            '310'),   # PARMAR ANANDKUMAR
    ('Satish',           '113'),   # SATISHBHAI VANIYA
    ('Jaydeep Solanki',  '259'),   # SOLANKI JAYDIP MAHENDRABHAI

    # Griwiksh
    ('Karan',            '260'),   # KARAN VAGHELA
    ('Jignesh',          '115'),   # JIGNESBHAI MADHABHAI TUMBADIYA
    ('Sailesh Vaghela',  '109'),   # SHAILESH BHANGI (Sailesh is closest match)

    # Hiqom
    ('Mukesh',           '121'),   # RAJENDRABHAI CHANDUBHAI VAGHELA
    ('Jaykesh',          '449'),   # SOLANKI JAYAKESHKUMAR
    ('Chandrakant',      '283'),   # SOLANKI CHANDRKANT
    ('Jitendra',         '95'),    # PIWAL JITENDRABHAI MANOHARBHAI
    ('Ravi',             '245'),   # RAVIKUMAR AMBALAL BHANGI

    # Jurqia
    ('Rakesh',           '438'),   # RAKESHBHAI CHAVADA
    ('Shailesh Talvadi', '97'),    # TALAVADI SHAILESHBHAI RAMANBHAI
    ('Pravin Vaghela',   '246'),   # VAGHELA PRAVINBHAI
    ('Banshi',           '149'),   # BANSI BHANGI

    # Lekhaag
    ('Suresh Solanki',   '73'),    # SURESHBHAI DAHYABHAI SOLANKI
    ('Naresh',           '89'),    # NARESH PARMAR
    ('Nitin Makwana',    '261'),   # NITIN ISHWARBHAI MAKWANA
    ('Pravin Maida',     '91'),    # PRAVINBHAI MOTIBHAI MAHIDA

    # Kyzeel
    ('Prahlad Parmar',   '242'),   # PARMAR PRAHLADBHAI
    ('Amit',             '110'),   # AMITKUMAR VAGHELA
    ('Mehul Rathod',     '256'),   # RATHOD MEHULKUMAR
    ('Rajesh',           '104'),   # TALAVADI RAJESHKUMAR
    ('Mehul Jadeja',     '106'),   # MEHULKUMAR JADEJA

    # Hostel Common Area
    ('Yogesh Vaghela',   '80'),    # YOGESHBHAI KANTIBHAI VAGHELA
    ('Vinayak Solanki',  '240'),   # SOLANKI VINAYAK
    ('Anil Thakur',      '542'),   # THAKOR ANILKUMAR NAGINJI
    ('Ketan Gujjar',     '100'),   # GURJAR KETAN AMRUTBHAI

    # Research Park
    ('Mahesh Solanki',   '267'),   # MAHESH SOLANKI
    ('Dhaval S Solanki', '484'),   # DHAVAL S SOLANKI
    ('Shailesh Vaghela', '266'),   # SAILESH A VAGHELA (Research Park)
    ('Sailesh A Vaghela','266'),   # SAILESH A VAGHELA (Research Park)
    ('Dharmishtaben',    '264'),   # VAGHELA DHARMISHTHA BEN

    # Central Arcade
    ('Vijay Parmar',     '329'),   # PARMAR VIJAYKUMAR
    ('Bhavnaben',        '218'),   # CHAVADA BHAVANABEN KISHORBHAI
    ('Ramesh Parmar',    '411'),   # RAMESHBHAI NARSINHBHAI PARMAR
    ('Hasmukh Solanki',  '77'),    # SOLANKI HASHMUKH

    # Sports Complex
    ('Anita Solanki',    '385'),   # SOLANKI ANITABEN RAMESHBHAI
    ('Retuben Solanki',  '412'),   # PATEL SANGITABEN MAHESHBHAI
    ('Uttam Vaghela',    '428'),   # VAGHELA UTTAMBHAI
    ('Sohil Vaghela',    '257'),   # SOHILKUMAR VAGHELA
    ('Rahul Vaghela',    '337'),   # VAGHELA RAHULKUMAR JASUBHAI
    ('Rajendra Chavda',  '354'),   # RAJENDRA AMATHABHAI CHAVDA
    ('Akshay Parmar',    '414'),   # AXAYKUMAR RAMESHBHAI PARMAR
    ('Jaydeep Vaghela',  '447'),   # JAYDIP DINESHBHAI VAGHELA
    ('Chirag Vaghela',   '303'),   # VAGHELA CHIRAG MOHANBHAI
    ('Harsh',            '456'),   # CHAUHAN HIMANTBHAI BABUBHAI
    ('Nikhil',           '314'),   # VANIYA NIKHILKUMAR BHAVESHBHAI
    ('Ramesh Sports',    '429'),   # RAMESHBHAI AMBALAL PARMAR

    # Guest House New
    ('Pankaj Parmar',    '305'),   # PARMAR RAKESHKUMAR ISHVARBHAI
    ('Hitesh Vaghela',   '123'),   # HITESH KUMAR VAGHELA
    ('Dhaval Jadeja',    '248'),   # JADEJA DHAVALKUMAR KANTIBHAI
    ('Ajay Purabiya',    '284'),   # PURBIYA AJAY HARSHADBHAI
    ('Sumit Solanki',    '451'),   # SUMIT SOLANKI
    ('Shailesh Ravel',   '306'),   # RAVAL SHAILESHKUMAR ISHVARBHAI
    ('Sanjay Vaghela',   '304'),   # VAGHELA SANJAYKUMAR BABUBHAI
    ('Anil Thakor',      '542'),   # THAKOR ANILKUMAR NAGINJI
    ('Gautam Parmar',    '403'),   # PARAMAR GAUTAMKUMAR
    ('Raju Chamar',      '393'),   # PANKAJKUMAR KANTIBHAI CHAMAR

    # Old Guest House
    ('Mukesh Parmar',              '392'),   # MUKESH SHAKRABHAI PARMAR
    ('Mukesh Shakrabhai Parmar',   '392'),
    ('Rajesh Chauhan',             '338'),   # RAJESH RANCHHODJI CHAUHAN
    ('Rajesh Ranchhodji Chauhan',  '338'),

    # Director Bungalow
    ('Rakesh Parmar',    '431'),   # PARMAR BHADRESHKUMAR NATVARLAL

    # Roads & Outdoor
    ('Prakash Thakor',            '534'),   # PRAKASH SHAKARAJI THAKOR
    ('Prakash Shakaraji Thakor',  '534'),
    ('Kanji Thakor',              '70'),    # KAMAJI CHANDAJI THAKOR
    ('Kamaji Chandaji Thakor',    '70'),
    ('Ashokbhai Thakor',          '67'),    # ASHOKJI MANYAJI THAKOR
    ('Ashokji Manyaji Thakor',    '67'),
    ('Rohit Thakor',              '68'),    # ROHITJI RUMALJI THAKOR
    ('Rohitji Rumalji Thakor',    '68'),
    ('Mahesh Raval',              '64'),    # MAHESH RANJITBHAI RAVAL
    ('Mahesh Ranjitbhai Raval',   '64'),
    ('Chirag Thakor',             '464'),   # CHIRAG GAMPATJI THAKOR
    ('Chirag Gampatji Thakor',    '464'),
    ('Satish Vaghela',            '463'),   # SATISH VIKRAMBHAI VAYHELA
    ('Satish Vikrambhai Vayhela', '463'),

    # Solid Waste Management
    ('Salesh bhai Thakur',   '389'),  # SIKANDARBHAI DUNGARBHAI BHANGI
    ('Satish bhai Raval',    '281'),  # AJAYKUMAR SOLANKI
    ('Jitendra bhai Thakur', '377'),  # VASUDEV JITENDRAKUMAR BALDEVBHAI
    ('Naveenbhai Chauhan',   '282'),  # RUDRESHABEN SANDIPKUMAR SOLANKI
    ('Rajnibhai Parmar',     '390'),  # PARMAR KRUNALBHAI
    ('Dineshbhai Purohit',   '83'),   # SOLANKI DINESHKUMAR VINUBHAI
    ('Baldevbhai Vaghela',   '455'),  # VAGHELA SUNILKUMAR RAJUBHAI
    ('Saleshbhai Vaghela',   '459'),  # URVASHIBEN NAYANBHAI VAGHELA
    ('Kanti bhai Thakur',    '461'),  # SOLANKI LALIT

    # Academic Blocks
    ('Minaben',              '142'),  # MINABEN VAGHELA
    ('Rajnibhai',            '103'),  # RAJANIKANT BABUBHAI VAGHELA
    ('Vasantiben',           '101'),  # VASANTIBEN JITENDRABHAI VORA
    ('Krunal',               '235'),  # SOLANKI KRUNAL AMRUTBHAI
    ('Rakeshbhai',           '108'),  # VAGHELA RAKESHBHAI AMBALAL
    ('Varshaben',            '156'),  # RATHOD VARSHABEN
    ('Anjanaben',            '130'),  # PARMAR ANJANABEN KALPESHKUMAR
    ('Harshad',              '280'),  # SOLANKI HARSHADBHAI DINESHBHAI
    ('Dinesh',               '83'),   # SOLANKI DINESHKUMAR VINUBHAI
    ('Shaileshbhai',         '82'),   # VAGHELA SHAILESHBHAI
    ('Nilamben',             '410'),  # CHAUHAN NILAMBEN
    ('Ashok',                '114'),  # ASHOKKUMAR MAHERIYA
    ('Hiten',                '307'),  # HITENKUMAR PARMAR
    ('Chandrikaben',         '74'),   # GURJAR CHANDRIKABEN
    ('Nikul',                '309'),  # PARMAR NIKULKUMAR PUNJABHAI
    ('Jay',                  '105'),  # JAY KUMAR SOLANKI
    ('Padmaben Vaghela',     '347'),  # VAGHELA PADMA
    ('Hitesh Solanki',       '434'),  # HITESHBHAI SOLANKI
    ('Parth Solanki',        '384'),  # SOLANKI PARTHKUMAR JAGDISHBHAI
    ('Sunil Makwana',        '348'),  # MAKWANA SUNILBHAI AMRUTBHAI
    ('Elesh',                '309'),  # PARMAR NIKULKUMAR PUNJABHAI
    ('Sangeetaben Patel',    '457'),  # SOLANKI BHAVIKABEN
    ('Bharat Solanki',       '465'),  # BHARATKUMAR SOLANKI
    ('Kailashbhai Parmar',   '263'),  # MAKVANA RAJUBHAI MANABHAI
    ('Gautam Vaghela',       '333'),  # GAUTAMBHAI VAGHELA
    ('Devendra',             '437'),  # PARMAR DEVENDRA DALPATBHAI
    ('Jignesh Solanki',      '363'),  # JIGNESHKUMAR BABUBHAI SOLANKI
    ('Kunal Parmar',         '346'),  # PARMAR CHANDRIKABEN
    ('Ajay Rathod',          '93'),   # RATHOD AJAYKUMAR
    ('Bhavesh',              '315'),  # VAGHELA BHAVESHBHAI NARNABHAI
    ('Akshay Vaghela',       '291'),  # HITESHKUMAR GAFULBHAI VAGHELA
    ('Jitendra Vasudev',     '377'),  # VASUDEV JITENDRAKUMAR BALDEVBHAI

    # Hostels Reliever
    ('Deepika Ben',      '418'),   # DIPIKABEN HASAMUKHBHAI PARMAR
    ('Mital Ben',        '386'),   # MITTALBEN VAGHELA
    ('Vinay',            '136'),   # PARMAR VINAY VALJIBHAI
    ('Lala',             '154'),   # LALABHAI KHODABHAI MESARIYA
    ('Hasmukhbhai',      '75'),    # GURJAR HASHAMUKHBHAI M
    ('Umesh Babariya',   '435'),   # BABARIYA UMESH
    ('Rajendra',         '121'),   # RAJENDRABHAI CHANDUBHAI VAGHELA
    ('Dhiraj',           '131'),   # DHIRAJ SOLANKI
('Mayur',            '258'),   # SOLANKI MAYUR JASHUBHAI
]

WORKER_LOOKUP_HINTS = {
    'Kailash B': {'area': 'Aibaan', 'phone': '7265921026'},
    'Rajanikant': {'area': 'Duven', 'phone': '6355825476'},
    'Jignesh': {'area': 'Griwiksh', 'phone': '8401617156'},
    'Mukesh': {'area': 'Hiqom', 'phone': '8141885315'},
    'Rajesh': {'area': 'Kyzeel', 'phone': '7046510026'},
    'Anil Thakur': {'area': 'Hostel Common Area', 'phone': '9265665289'},
    'Shailesh Vaghela': {'area': 'Research Park'},
    'Sailesh A Vaghela': {'area': 'Research Park'},
    'Minaben': {'area': 'Academic Block 1'},
    'Rajnibhai': {'area': 'Academic Block 2'},
    'Krunal': {'area': 'Academic Block 3'},
    'Dinesh': {'area': 'Academic Block 5'},
    'Shaileshbhai': {'area': 'Academic Block 5'},
    'Ashok': {'area': 'Academic Block 6'},
    'Nikul': {'area': 'Academic Block 7'},
}


class Command(BaseCommand):
    help = 'Update pay codes for supervisors, caretakers, and workers.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='Preview changes without saving.')
        parser.add_argument('--quiet', action='store_true',
                            help='Reduce log output (skip "already correct" messages).')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        quiet = options['quiet']
        User = get_user_model()
        if quiet and not dry_run:
            self.stdout.write = lambda *args, **kwargs: None

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes saved.\n'))

        # ── Supervisors ──────────────────────────────────────────────────────
        self.stdout.write(self.style.HTTP_INFO('=== SUPERVISORS ==='))
        su = 0
        snf = 0
        for username, pc in SUPERVISOR_BY_USERNAME.items():
            u = User.objects.filter(username=username).first()
            if not u:
                self.stdout.write(f'  [NOT FOUND] username={username}')
                snf += 1
                continue
            if u.pay_code != pc:
                if not dry_run:
                    u.pay_code = pc
                    u.save(update_fields=['pay_code'])
                self.stdout.write(f'  [{"DRY" if dry_run else "UPDATED"}] {u.get_full_name() or u.username} -> {pc}')
                su += 1
            elif not quiet:
                self.stdout.write(f'  [OK] {u.get_full_name() or u.username} already {pc}')
        self.stdout.write(f'  >> updated={su}, not_found={snf}\n')

        # ── Caretakers ───────────────────────────────────────────────────────
        self.stdout.write(self.style.HTTP_INFO('=== CARETAKERS ==='))
        cu = 0
        cnf = 0
        for username, pc in CARETAKER_BY_USERNAME.items():
            u = User.objects.filter(username=username).first()
            if not u:
                self.stdout.write(f'  [NOT FOUND] username={username}')
                cnf += 1
                continue
            if u.pay_code != pc:
                if not dry_run:
                    u.pay_code = pc
                    u.save(update_fields=['pay_code'])
                self.stdout.write(f'  [{"DRY" if dry_run else "UPDATED"}] {u.get_full_name() or u.username} -> {pc}')
                cu += 1
            elif not quiet:
                self.stdout.write(f'  [OK] {u.get_full_name() or u.username} already {pc}')
        self.stdout.write(f'  >> updated={cu}, not_found={cnf}\n')

        # ── Workers ──────────────────────────────────────────────────────────
        self.stdout.write(self.style.HTTP_INFO('=== WORKERS ==='))
        # Build name lookup
        all_workers = list(HKWorker.objects.all())
        name_map = {}
        for w in all_workers:
            key = w.name.strip().upper()
            if key not in name_map:
                name_map[key] = w

        wu = 0
        wnf = 0
        for db_name, pc in WORKER_PAY_CODES:
            worker = None
            hint = WORKER_LOOKUP_HINTS.get(db_name)
            if hint:
                hinted_workers = HKWorker.objects.filter(area__name=hint['area'])
                if hint.get('phone'):
                    hinted_workers = hinted_workers.filter(phone=hint['phone'])
                else:
                    hinted_workers = hinted_workers.filter(name__icontains=db_name.strip())
                worker = hinted_workers.filter(is_active=True).first() or hinted_workers.first()
            if not worker:
                worker = name_map.get(db_name.strip().upper())
            if not worker:
                self.stdout.write(f'  [NOT FOUND] name={db_name!r}')
                wnf += 1
                continue
            if worker.pay_code != pc:
                if not dry_run:
                    worker.pay_code = pc
                    worker.save(update_fields=['pay_code'])
                self.stdout.write(f'  [{"DRY" if dry_run else "UPDATED"}] {worker.name} -> {pc}')
                wu += 1
            elif not quiet:
                self.stdout.write(f'  [OK] {worker.name} already {pc}')
        self.stdout.write(f'  >> updated={wu}, not_found={wnf}\n')

        # ── Summary ──────────────────────────────────────────────────────────
        self.stdout.write(self.style.HTTP_INFO('=== SUMMARY ==='))
        self.stdout.write(f'  supervisors: updated={su}, not_found={snf}')
        self.stdout.write(f'  caretakers: updated={cu}, not_found={cnf}')
        self.stdout.write(f'  workers: updated={wu}, not_found={wnf}')

        if not dry_run:
            u_total = User.objects.filter(role__in=['supervisor', 'caretaker']).exclude(pay_code='').count()
            w_total = HKWorker.objects.exclude(pay_code='').count()
            self.stdout.write(f'\n  DB: {u_total} staff with pay_code, {w_total} workers with pay_code')
            self.stdout.write(self.style.SUCCESS('\nDone — pay codes updated.'))
        else:
            self.stdout.write(self.style.WARNING('\nDry run complete — no changes saved.'))

"""
Data migration: populate pay_code and full canonical names for all HKWorkers.
Runs automatically on: python manage.py migrate (called by docker-compose on startup).

Match strategy: pay_code → canonical_name (pay_code is already set by 0015/0016 rename).
We first set pay_code by current name (for fresh DBs from seed), then set canonical name.
"""
from django.db import migrations


# Format: (current_seeded_name, canonical_name, pay_code)
# current_seeded_name = name as stored by seed_housekeeping.py
# canonical_name = official government-style name from pay slip
WORKER_DATA = [
    ('Suresh',                       'Sureshbhai Dahyabhai Solanki',      '73'),
    ('Suresh Solanki',               'Sureshbhai Dahyabhai Solanki',      '73'),
    ('Chandrikaben',                 'Gurjar Chandrikaben',                '74'),
    ('Hasmukhbhai',                  'Gurjar Hashamukhbhai M',            '75'),
    ('Meena Ben',                    'Jadav Minaben',                     '76'),
    ('Minaben',                      'Jadav Minaben',                     '76'),
    ('Hasmukh Solanki',              'Solanki Hashmukh',                  '77'),
    ('Yogesh Vaghela',               'Yogeshbhai Kantibhai Vaghela',      '80'),
    ('Shailesh Vaghela',             'Vaghela Shaileshbhai',              '82'),
    ('Dharmishtaben',                'Vaghela Dharmishtha Ben',           '83'),
    ('Dineshbhai Purohit',           'Solanki Dineshkumar Vinubhai',      '83'),
    ('Mukesh',                       'Mukeshbhai Ravjibhai Vaghela',      '88'),
    ('Naresh',                       'Naresh Parmar',                     '89'),
    ('Pravin Maida',                 'Pravinbhai Motibhai Mahida',        '91'),
    ('Ajay Rathod',                  'Rathod Ajaykumar',                  '93'),
    ('Jitendra',                     'Piwal Jitendrabhai Manoharbhai',    '95'),
    ('Shailesh Talvadi',             'Talavadi Shaileshbhai Ramanbhai',   '97'),
    ('Shaileshbhai',                 'Talavadi Shaileshbhai Ramanbhai',   '97'),
    ('Kailashben M',                 'Kailashben Vaghela',                '98'),
    ('Ketan Gujjar',                 'Gurjar Ketan Amrutbhai',            '100'),
    ('Jitendra Vasudev',             'Vasudev Jitendrakumar Baldevbhai',  '101'),
    ('Kailash B',                    'Kailashben Parmar',                 '102'),
    ('Rajesh',                       'Talvadi Rajeshkumar',               '104'),
    ('Jay',                          'Jay Kumar Solanki',                 '105'),
    ('Mehul Jadeja',                 'Mehulkumar Jadeja',                 '106'),
    ('Rakeshbhai',                   'Vaghela Rakeshbhai Ambalal',        '108'),
    ('Sailesh Vaghela',              'Shailesh Bhangi',                   '109'),
    ('Amit',                         'Amitkumar Vaghela',                 '110'),
    ('Satish',                       'Satishbhai Vaniya',                 '113'),
    ('Ashokbhai Thakor',             'Ashokkumar Maheriya',               '114'),
    ('Ashok',                        'Ashokkumar Maheriya',               '114'),
    ('Rajendra',                     'Rajendrabhai Chandubhai Vaghela',   '121'),
    ('Harish',                       'Harishkumar Solanki',               '122'),
    ('Hitesh Vaghela',               'Hitesh Kumar Vaghela',              '123'),
    ('Anjanaben',                    'Parmar Anjanaben Kalpeshkumar',     '130'),
    ('Dhiraj',                       'Dhiraj Solanki',                    '131'),
    ('Vinay',                        'Parmar Vinay Valjibhai',            '136'),
    ('Varshaben',                    'Rathod Varshaben',                  '156'),
    ('Jagdish',                      'Jagdishbhai Shivabhai Chavada',     '157'),
    ('Bhavnaben',                    'Chavada Bhavanaben Kishorbhai',     '218'),
    ('Sangeeta Ben',                 'Vaghela Sangitaben',                '219'),
    ('Geeta Ben',                    'Gitaben Parmar',                    '230'),
    ('Surya Ben',                    'Solanki Suryaben Bharatbhai',       '233'),
    ('Krunal',                       'Solanki Krunal Amrutbhai',          '235'),
    ('Shailesh Rathod',              'Rathod Shaileshbhai',               '239'),
    ('Vinayak Solanki',              'Solanki Vinayak',                   '240'),
    ('Prahlad Parmar',               'Parmar Prahladbhai',                '242'),
    ('Ravi',                         'Ravikumar Ambalal Bhangi',          '245'),
    ('Pravin Vaghela',               'Vaghela Pravinbhai',                '246'),
    ('Dhaval Jadeja',                'Jadeja Dhavalkumar Kantibhai',      '248'),
    ('Champa Ben',                   'Champaben Vaghela',                 '249'),
    ('Mahendra Makwana',             'Mahendra D Makvana',                '148'),
    ('Mehul Rathod',                 'Rathod Mehulkumar',                 '256'),
    ('Sohil Vaghela',                'Sohilkumar Vaghela',                '257'),
    ('Mayur',                        'Solanki Mayur Jashubhai',           '258'),
    ('Jaydeep Solanki',              'Solanki Jaydip Mahendrabhai',       '259'),
    ('Karan',                        'Karan Vaghela',                     '260'),
    ('Nitin Makwana',                'Nitin Ishwarbhai Makwana',          '261'),
    ('Kailashbhai Parmar',           'Makvana Rajubhai Manabhai',         '263'),
    ('Mahesh Vaghela',               'Vaghela Shaileshkumar',             '266'),
    ('Mahesh Solanki',               'Mahesh Solanki',                    '267'),
    ('Anil Thakur',                  'Anilkumar Bhupatji Thakor',         '269'),
    ('Harshad',                      'Solanki Harshadbhai Dineshbhai',    '280'),
    ('Satish bhai Raval',            'Ajaykumar Solanki',                 '281'),
    ('Naveenbhai Chauhan',           'Rudreshaben Sandipkumar Solanki',   '282'),
    ('Chandrakant',                  'Solanki Chandrkant',                '283'),
    ('Ajay Purabiya',                'Purbiya Ajay Harshadbhai',          '284'),
    ('Akshay Vaghela',               'Hiteshkumar Gafulbhai Vaghela',     '291'),
    ('Chirag Vaghela',               'Vaghela Chirag Mohanbhai',          '303'),
    ('Sanjay Vaghela',               'Vaghela Sanjaykumar Babubhai',      '304'),
    ('Pankaj Parmar',                'Parmar Rakeshkumar Ishvarbhai',     '305'),
    ('Shailesh Ravel',               'Raval Shaileshkumar Ishvarbhai',    '306'),
    ('Hiten',                        'Hitenkumar Parmar',                 '307'),
    ('Satish Vaghela',               'Akshybhai Vaghela',                 '308'),
    ('Elesh',                        'Parmar Nikulkumar Punjabhai',       '309'),
    ('Anand',                        'Parmar Anandkumar',                 '310'),
    ('Nikhil',                       'Vaniya Nikhilkumar Bhaveshbhai',    '314'),
    ('Bhavesh',                      'Vaghela Bhaveshbhai Narnabhai',     '315'),
    ('Lalit Parmar',                 'Lalitbhai Parmar',                  '319'),
    ('Vijay Parmar',                 'Parmar Vijaykumar',                 '329'),
    ('Bhanu Ben',                    'Solanki Bhanuben Jagdishbhai',      '332'),
    ('Gautam Vaghela',               'Gautambhai Vaghela',                '333'),
    ('Rahul Vaghela',                'Vaghela Rahulkumar Jasubhai',       '337'),
    ('Rajesh Chauhan',               'Chauhan Rajeshkumar Ranchhodji',    '338'),
    ('Kunal Parmar',                 'Parmar Chandrikaben',               '346'),
    ('Padmaben Vaghela',             'Vaghela Padma',                     '347'),
    ('Sunil Makwana',                'Makwana Sunilbhai Amrutbhai',       '348'),
    ('Ajay Thakor',                  'Thakor Ajaykumar Prahladji',        '349'),
    ('Rajendra Chavda',              'Rajendra Amathabhai Chavda',        '354'),
    ('Manisha Ben',                  'Sonala Manishaben',                 '356'),
    ('Reeta Ben',                    'Parmar Ritaben',                    '357'),
    ('Salesh bhai Thakur',           'Sikandarbhai Dungarbhai Bhangi',    '389'),
    ('Banshi',                       'Bansi Bhangi',                      '149'),
    ('Jignesh',                      'Jigneshkumar Babubhai Solanki',     '363'),
    ('Jignesh Solanki',              'Jigneshkumar Babubhai Solanki',     '363'),
    ('Nikul Solanki',                'Makwana Nikhil',                    '364'),
    ('Kanji Thakor',                 'Thakor Maheshji',                   '373'),
    ('Harshadkumar',                 'Harshadkumar Vaghela',              '375'),
    ('Jitendra bhai Thakur',         'Vasudev Jitendrakumar Baldevbhai',  '377'),
    ('Parth Solanki',                'Solanki Parthkumar Jagdishbhai',    '384'),
    ('Anita Solanki',                'Solanki Anitaben Rameshbhai',       '385'),
    ('Mital Ben',                    'Mittalben Vaghela',                 '386'),
    ('Rajnibhai Parmar',             'Parmar Krunalbhai',                 '390'),
    ('Mukesh Parmar',                'Mukesh Kumar Parmar',               '392'),
    ('Raju Chamar',                  'Pankajkumar Kantibhai Chamar',      '393'),
    ('Mahesh Raval',                 'Vaghela Maheshbhai Dineshbhai',     '402'),
    ('Gautam Parmar',                'Paramar Gautamkumar',               '403'),
    ('Nilamben',                     'Chauhan Nilamben',                  '410'),
    ('Ramesh Parmar',                'Rameshbhai Narsinhbhai Parmar',     '411'),
    ('Retuben Solanki',              'Patel Sangitaben Maheshbhai',       '412'),
    ('Akshay Parmar',                'Axaykumar Rameshbhai Parmar',       '414'),
    ('Sonal Ben',                    'Rathod Sonalben Dilipkumar',        '415'),
    ('Rajnibhai',                    'Parmar Rajeshbhai',                 '416'),
    ('Rohit Thakor',                 'Rahulkumar Rathod',                 '417'),
    ('Deepika Ben',                  'Dipikaben Hasamukhbhai Parmar',     '418'),
    ('Shilpa Ben',                   'Shilpaben D Chauhan',               '419'),
    ('Uttam Vaghela',                'Vaghela Uttambhai',                 '428'),
    ('Ramesh Sports',                'Rameshbhai Ambalal Parmar',         '429'),
    ('Rakesh Parmar',                'Parmar Bhadreshkumar Natvarlal',    '431'),
    ('Hitesh Solanki',               'Hiteshbhai Solanki',                '434'),
    ('Umesh Babariya',               'Babariya Umesh',                    '435'),
    ('Devendra',                     'Parmar Devendra Dalpatbhai',        '437'),
    ('Rakesh',                       'Rakeshbhai Chavada',                '438'),
    ('Jaydeep Vaghela',              'Jaydip Dineshbhai Vaghela',         '447'),
    ('Jaykesh',                      'Solanki Jayakeshkumar',             '449'),
    ('Sumit Solanki',                'Sumit Solanki',                     '451'),
    ('Baldevbhai Vaghela',           'Vaghela Sunilkumar Rajubhai',       '455'),
    ('Harsh',                        'Chauhan Himantbhai Babubhai',       '456'),
    ('Sangeetaben Patel',            'Solanki Bhavikaben',                '457'),
    ('Saleshbhai Vaghela',           'Urvashiben Nayanbhai Vaghela',      '459'),
    ('Kanti bhai Thakur',            'Solanki Lalit',                     '461'),
    ('Chirag Thakor',                'Thakor Chirag',                     '464'),
    ('Prakash Thakor',               'Thakor Prakashkumar',               '534'),
    ('Anil Thakor',                  'Thakor Anilkumar Naginji',          '542'),
    ('Naveenbhai Chauhan',           'Rudreshaben Sandipkumar Solanki',   '282'),
    ('Lala',                         'Lalabhai Khodabhai Mesariya',       '154'),
    ('Rajnikant',                    'Rajanikant Chavda',                 '153'),
    ('Rajnibhai',                    'Parmar Rajeshbhai',                 '416'),
]


def populate_workers(apps, schema_editor):
    HKWorker = apps.get_model('housekeeping', 'HKWorker')

    # Build lookup: current_name → (canonical_name, pay_code)
    # For each current_name, apply update by name match
    updates = {}
    for current_name, canonical_name, pay_code in WORKER_DATA:
        # Don't overwrite a later entry with an earlier one for same current_name
        if current_name not in updates:
            updates[current_name] = (canonical_name, pay_code)

    for current_name, (canonical_name, pay_code) in updates.items():
        HKWorker.objects.filter(name=current_name).update(
            name=canonical_name,
            pay_code=pay_code,
        )

    # Second pass: for workers already with pay_code set but name not yet canonical,
    # update name by pay_code
    pay_code_to_name = {}
    for _, canonical_name, pay_code in WORKER_DATA:
        pay_code_to_name[pay_code] = canonical_name

    for pay_code, canonical_name in pay_code_to_name.items():
        HKWorker.objects.filter(pay_code=pay_code).exclude(name=canonical_name).update(
            name=canonical_name
        )


def reverse_populate_workers(apps, schema_editor):
    # Non-destructive: just blank pay_codes
    HKWorker = apps.get_model('housekeeping', 'HKWorker')
    pay_codes = [row[2] for row in WORKER_DATA]
    HKWorker.objects.filter(pay_code__in=pay_codes).update(pay_code='')


class Migration(migrations.Migration):

    dependencies = [
        ('housekeeping', '0015_rename_punching_no_to_pay_code'),
    ]

    operations = [
        migrations.RunPython(populate_workers, reverse_populate_workers),
    ]

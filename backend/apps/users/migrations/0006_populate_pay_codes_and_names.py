"""
Data migration: populate pay_code and full names for supervisors and caretakers.
Runs automatically on: python manage.py migrate (called by docker-compose on startup).
"""
from django.db import migrations


# Matched by username (reliable, not by name which changes)
# Format: username → (first_name, last_name, pay_code)
SUPERVISOR_DATA = {
    'ashok.rathod':        ('Ashokbhai Ishwarbhai', 'Rathod',    '2'),
    'pradip.swm':          ('Dinesh',               'Chauhan',   '3'),
    'shailesh.prajapati':  ('Shailesh Natvarbhai',  'Prajapati', '4'),
    'maulik.patel':        ('Maulikkumar Dilipbhai','Patel',     '7'),
    'narendra.shreemali':  ('Narendrakumar Natvarlal','Shrimali','328'),
    'bipin.vaghela':       ('Bipinchandra Dineshkumar','Vaghela','350'),
    'kaushik.parmar':      ('Kaushikkumar Balvantbhai','Parmar', '396'),
    'bharat.solanki':      ('Bharatkumar',           'Solanki',  '465'),
    'mukesh.vaghela':      ('Mukeshkumar',           'Vaghela',  '466'),
}

CARETAKER_DATA = {
    'priyanka':         ('Priyanka Vijaykumar',     'Parmar',  '237'),
    'pankaj':           ('Pankajsinh Amarsinh',      'Bihola',  '293'),
    'rushita':          ('Rhushita Chetankumar',     'Chavda',  '294'),
    'anil.caretaker':   ('Anil',                     'Solanki', '300'),
    'vishwajeet':       ('Vishvajeet',               'Kumar',   '316'),
    'ramsingh':         ('Ramprakash Lembabhai',     'Parmar',  '317'),
    'jaimin':           ('Jaimin',                   'Parmar',  '318'),
    'anita':            ('Manisha',                  'Thapa',   '424'),
    'nikul.caretaker':  ('Nikulsinh Ashoksinh',      'Bihola',  '427'),
}


def populate_staff(apps, schema_editor):
    User = apps.get_model('users', 'User')
    for username, (first, last, pc) in SUPERVISOR_DATA.items():
        User.objects.filter(username=username, role='supervisor').update(
            first_name=first, last_name=last, pay_code=pc
        )
    for username, (first, last, pc) in CARETAKER_DATA.items():
        User.objects.filter(username=username, role='caretaker').update(
            first_name=first, last_name=last, pay_code=pc
        )


def reverse_populate_staff(apps, schema_editor):
    # Non-destructive reverse: just blank out pay_code
    User = apps.get_model('users', 'User')
    usernames = list(SUPERVISOR_DATA.keys()) + list(CARETAKER_DATA.keys())
    User.objects.filter(username__in=usernames).update(pay_code='')


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0005_user_pay_code'),
    ]

    operations = [
        migrations.RunPython(populate_staff, reverse_populate_staff),
    ]

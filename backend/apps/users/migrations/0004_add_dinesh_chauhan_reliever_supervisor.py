from django.contrib.auth.hashers import make_password
from django.db import migrations


def add_dinesh_chauhan(apps, schema_editor):
    User = apps.get_model('users', 'User')
    defaults = {
        'username': 'dinesh.chauhan',
        'first_name': 'Dinesh',
        'last_name': 'Chauhan',
        'email': 'dineshchauhan0257@gmail.com',
        'phone': '9925192578',
        'pay_code': '3',
        'role': 'supervisor',
        'is_active': True,
        'is_staff': False,
        'is_superuser': False,
    }
    user = (
        User.objects.filter(username='dinesh.chauhan').first()
        or User.objects.filter(email='dineshchauhan0257@gmail.com').first()
        or User.objects.filter(phone='9925192578').first()
    )
    if user is None:
        user = User(**defaults)
        user.password = make_password('IITGN@2025')
        user.save()
        return

    for field, value in defaults.items():
        setattr(user, field, value)
    user.password = make_password('IITGN@2025')
    user.save()


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0003_hk_inventory_manager_role'),
    ]

    operations = [
        migrations.RunPython(add_dinesh_chauhan, migrations.RunPython.noop),
    ]

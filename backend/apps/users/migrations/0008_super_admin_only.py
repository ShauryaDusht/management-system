from django.contrib.auth.hashers import make_password
from django.db import migrations


def keep_only_super_admin(apps, schema_editor):
    User = apps.get_model('users', 'User')
    super_admin, _ = User.objects.get_or_create(username='super.admin')
    super_admin.first_name = 'Super'
    super_admin.last_name = 'Admin'
    super_admin.email = 'pragnesh@iitgn.ac.in'
    super_admin.phone = '9727757096'
    super_admin.role = 'admin'
    super_admin.is_active = True
    super_admin.is_staff = True
    super_admin.is_superuser = True
    super_admin.password = make_password('IITGN@2025')
    super_admin.save()

    legacy_admins = list(
        User.objects
        .filter(username__in=['admin.user', 'admin'])
        .exclude(pk=super_admin.pk)
    )
    legacy_ids = [user.pk for user in legacy_admins]
    if not legacy_ids:
        return

    for model in apps.get_models():
        for field in model._meta.get_fields():
            if not getattr(field, 'many_to_one', False) and not getattr(field, 'one_to_one', False):
                continue
            if getattr(field, 'remote_field', None) and field.remote_field.model == User:
                model.objects.filter(**{f'{field.name}_id__in': legacy_ids}).update(
                    **{f'{field.name}_id': super_admin.pk}
                )

    User.objects.filter(pk__in=legacy_ids).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0007_restore_hk_inventory_manager_login'),
    ]

    operations = [
        migrations.RunPython(keep_only_super_admin, migrations.RunPython.noop),
    ]

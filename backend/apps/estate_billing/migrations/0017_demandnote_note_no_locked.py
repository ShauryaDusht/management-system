from django.db import migrations, models


class Migration(migrations.Migration):
    """A note number typed by hand is remembered, so the automatic numbering stops overwriting it."""

    dependencies = [
        ('estate_billing', '0016_housingclearance_deleted_at_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='shopdemandnote',
            name='note_no_locked',
            field=models.BooleanField(default=False, help_text='The note number was typed by hand: the automatic numbering never changes it.'),
        ),
        migrations.AddField(
            model_name='contractordemandnote',
            name='note_no_locked',
            field=models.BooleanField(default=False, help_text='The note number was typed by hand: the automatic numbering never changes it.'),
        ),
    ]

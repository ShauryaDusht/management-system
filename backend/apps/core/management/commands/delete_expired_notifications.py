from apps.core.management.commands.expire_notifications import Command as ExpireCommand


class Command(ExpireCommand):
    help = 'Permanently deletes expired notification records from the database using Django ORM.'


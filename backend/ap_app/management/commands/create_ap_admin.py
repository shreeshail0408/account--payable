from getpass import getpass

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Interactively create the first Accounts Payable administrator."

    def handle(self, *args, **options):
        User = get_user_model()
        if User.objects.filter(role=User.Roles.ADMIN, is_active=True).exists():
            raise CommandError("An active administrator already exists; create additional employees through the admin interface/API.")
        username = input("Administrator username: ").strip()
        email = input("Administrator email: ").strip()
        if not username or not email:
            raise CommandError("Username and email are required.")
        if User.objects.filter(username=username).exists():
            raise CommandError("That username already exists. Ask an active administrator to activate or change the existing account.")
        password = getpass("Administrator password: ")
        confirmation = getpass("Confirm password: ")
        if password != confirmation:
            raise CommandError("Passwords did not match.")
        user = User(username=username, email=email, role=User.Roles.ADMIN, is_active=True, is_staff=True, is_superuser=True)
        validate_password(password, user)
        user.set_password(password)
        user.save()
        self.stdout.write(self.style.SUCCESS("Administrator account created. Password was not displayed."))

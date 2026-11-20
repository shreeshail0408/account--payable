import os
from getpass import getpass

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = (
        "Create the first Accounts Payable administrator. Interactive by default; with --no-input it "
        "reads AP_ADMIN_USERNAME, AP_ADMIN_EMAIL and AP_ADMIN_PASSWORD from the environment (for hosts "
        "without a shell)."
    )

    def add_arguments(self, parser):
        parser.add_argument("--no-input", action="store_true", help="Read the account from AP_ADMIN_* environment variables.")
        parser.add_argument(
            "--if-missing",
            action="store_true",
            help="Exit quietly (status 0) when an active administrator already exists, e.g. on every deploy.",
        )

        parser.add_argument(
            "--reset",
            action="store_true",
            help=(
                "With --no-input: set AP_ADMIN_USERNAME's password to AP_ADMIN_PASSWORD and activate it, "
                "creating the administrator if it doesn't exist. Refuses to touch non-administrator accounts."
            ),
        )

    def handle(self, *args, **options):
        User = get_user_model()
        if options["reset"]:
            if not options["no_input"]:
                raise CommandError("--reset only works with --no-input (AP_ADMIN_* environment variables).")
            self.reset_from_environment(User)
            return
        if User.objects.filter(role=User.Roles.ADMIN, is_active=True).exists():
            if options["if_missing"]:
                self.stdout.write("An active administrator already exists; nothing to do.")
                return
            raise CommandError("An active administrator already exists; create additional employees through the admin interface/API.")

        if options["no_input"]:
            username = os.getenv("AP_ADMIN_USERNAME", "").strip()
            email = os.getenv("AP_ADMIN_EMAIL", "").strip()
            password = os.getenv("AP_ADMIN_PASSWORD", "")
            if not password:
                raise CommandError("Set AP_ADMIN_PASSWORD (and AP_ADMIN_USERNAME, AP_ADMIN_EMAIL) to create the administrator.")
            confirmation = password
        else:
            username = input("Administrator username: ").strip()
            email = input("Administrator email: ").strip()
            password = None
            confirmation = None

        if not username or not email:
            raise CommandError("Username and email are required.")
        if User.objects.filter(username=username).exists():
            raise CommandError("That username already exists. Ask an active administrator to activate or change the existing account.")
        if password is None:
            password = getpass("Administrator password: ")
            confirmation = getpass("Confirm password: ")
        if password != confirmation:
            raise CommandError("Passwords did not match.")
        user = User(username=username, email=email, role=User.Roles.ADMIN, is_active=True, is_staff=True, is_superuser=True)
        try:
            validate_password(password, user)
        except ValidationError as error:
            source = "AP_ADMIN_PASSWORD" if options["no_input"] else "The password"
            raise CommandError(f"{source} was rejected: {' '.join(error.messages)}") from error
        user.set_password(password)
        user.save()
        self.stdout.write(self.style.SUCCESS("Administrator account created. Password was not displayed."))

    def reset_from_environment(self, User):
        username = os.getenv("AP_ADMIN_USERNAME", "").strip()
        email = os.getenv("AP_ADMIN_EMAIL", "").strip()
        password = os.getenv("AP_ADMIN_PASSWORD", "")
        if not username or not password:
            raise CommandError("Set AP_ADMIN_USERNAME and AP_ADMIN_PASSWORD to reset the administrator.")
        user = User.objects.filter(username=username).first()
        if user is None:
            if not email:
                raise CommandError("Set AP_ADMIN_EMAIL to create the administrator.")
            user = User(username=username, email=email, role=User.Roles.ADMIN, is_staff=True, is_superuser=True)
        elif user.role != User.Roles.ADMIN:
            raise CommandError(f"'{username}' exists but is not an administrator; refusing to change it.")
        try:
            validate_password(password, user)
        except ValidationError as error:
            raise CommandError(f"AP_ADMIN_PASSWORD was rejected: {' '.join(error.messages)}") from error
        created = user.pk is None
        user.is_active = True
        user.set_password(password)
        user.save()
        verb = "created" if created else "password reset and account activated"
        self.stdout.write(self.style.SUCCESS(f"Administrator '{username}' {verb}. Password was not displayed."))


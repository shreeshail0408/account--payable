from django.core.management.base import BaseCommand

from ap_app.services import process_approval_deadlines


class Command(BaseCommand):
    help = "Create due-soon approval reminders and escalate overdue approvals."

    def handle(self, *args, **options):
        counts = process_approval_deadlines()
        self.stdout.write(self.style.SUCCESS(
            f"Created {counts['reminders']} reminder(s); escalated {counts['escalated']} approval(s)."
        ))

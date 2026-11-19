import logging
import smtplib

from django.conf import settings
from django.core.mail import send_mail
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from ap_app.models import APNotification

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Send pending AP notifications by email using configured SMTP settings."

    def handle(self, *args, **options):
        if not settings.EMAIL_HOST or not settings.EMAIL_HOST_USER or not settings.EMAIL_HOST_PASSWORD:
            raise CommandError("Set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD to send email notifications.")
        pending = APNotification.objects.filter(email_sent_at__isnull=True).select_related("recipient").order_by("created_at")
        sent = 0
        for notification in pending.iterator():
            if not notification.recipient.email:
                logger.warning("Notification %s was not emailed: recipient has no email.", notification.pk)
                continue
            try:
                send_mail(
                    subject=f"[AP Automation] {notification.title}",
                    message=notification.message,
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[notification.recipient.email],
                    fail_silently=False,
                )
            except (smtplib.SMTPException, OSError) as exc:
                logger.exception("Could not send AP notification %s.", notification.pk)
                raise CommandError(f"Unable to send notification {notification.pk}: {exc}") from exc
            notification.email_sent_at = timezone.now()
            notification.save(update_fields=["email_sent_at"])
            sent += 1
        self.stdout.write(self.style.SUCCESS(f"Sent {sent} notification email(s)."))

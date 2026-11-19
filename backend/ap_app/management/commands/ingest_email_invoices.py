import hashlib
import imaplib
import logging
import os
from datetime import date
from email import policy
from email.message import EmailMessage
from email.parser import BytesParser
from email.utils import parseaddr, parsedate_to_datetime
from decimal import Decimal
from pathlib import Path
from tempfile import NamedTemporaryFile

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from ap_app.models import InboundEmail, Invoice, InvoiceLine, Vendor
from ap_app.services import audit, extract_invoice_fields, extract_ocr, validate_and_match

logger = logging.getLogger(__name__)
SUPPORTED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".tif", ".tiff"}


class Command(BaseCommand):
    help = "Ingest unseen invoice attachments from a configured IMAP mailbox."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true", help="Process the inbox once, then exit.")
        parser.add_argument("--poll-seconds", type=int, default=60, help="Polling interval when running continuously.")

    def handle(self, *args, **options):
        host = os.getenv("IMAP_HOST", "").strip()
        username = os.getenv("IMAP_USER", "").strip()
        password = os.getenv("IMAP_PASSWORD", "")
        if not host or not username or not password:
            raise CommandError("Set IMAP_HOST, IMAP_USER, and IMAP_PASSWORD to enable email ingestion.")
        if options["poll_seconds"] < 5:
            raise CommandError("--poll-seconds must be at least 5.")

        while True:
            count = self._process_mailbox(host, username, password)
            self.stdout.write(f"Email invoice pass complete; processed {count} message(s).")
            if options["once"]:
                break
            import time
            time.sleep(options["poll_seconds"])

    def _process_mailbox(self, host, username, password):
        folder = os.getenv("IMAP_FOLDER", "INBOX")
        connection = imaplib.IMAP4_SSL(host, int(os.getenv("IMAP_PORT", "993")))
        try:
            connection.login(username, password)
            status, _ = connection.select(folder)
            if status != "OK":
                raise CommandError(f"Unable to select IMAP folder {folder}.")
            status, result = connection.uid("search", None, "UNSEEN")
            if status != "OK":
                raise CommandError("IMAP server could not search for unread messages.")
            message_uids = result[0].split()
            processed = 0
            for uid in message_uids:
                status, response = connection.uid("fetch", uid, "(RFC822)")
                if status != "OK" or not response or not response[0]:
                    logger.error("Could not fetch unread IMAP message UID %s", uid.decode(errors="replace"))
                    continue
                raw_message = response[0][1]
                message = BytesParser(policy=policy.default).parsebytes(raw_message)
                message_id = message.get("Message-ID") or hashlib.sha256(raw_message).hexdigest()
                existing = InboundEmail.objects.filter(message_id=message_id).first()
                if existing:
                    connection.uid("store", uid, "+FLAGS", r"(\Seen)")
                    continue
                event = self._ingest_message(message, raw_message, message_id)
                if event.status in (InboundEmail.Status.PROCESSED, InboundEmail.Status.IGNORED):
                    connection.uid("store", uid, "+FLAGS", r"(\Seen)")
                processed += event.status == InboundEmail.Status.PROCESSED
            return processed
        finally:
            try:
                connection.logout()
            except imaplib.IMAP4.error:
                logger.warning("IMAP logout was not clean.")

    def _ingest_message(self, message: EmailMessage, raw_message: bytes, message_id: str):
        sender = parseaddr(message.get("From", ""))[1].lower()
        subject = str(message.get("Subject", ""))[:255]
        try:
            received_at = parsedate_to_datetime(message.get("Date")) if message.get("Date") else timezone.now()
            if timezone.is_naive(received_at):
                received_at = timezone.make_aware(received_at)
        except (TypeError, ValueError, OverflowError):
            received_at = timezone.now()

        vendor = Vendor.objects.filter(email__iexact=sender).first()
        attachments = [
            part for part in message.iter_attachments()
            if Path(part.get_filename() or "").suffix.lower() in SUPPORTED_EXTENSIONS
        ]
        if not vendor:
            return InboundEmail.objects.create(
                message_id=message_id, sender=sender, subject=subject,
                status=InboundEmail.Status.IGNORED,
                details="No vendor has a matching email address.",
                received_at=received_at,
            )
        if not attachments:
            return InboundEmail.objects.create(
                message_id=message_id, sender=sender, subject=subject,
                status=InboundEmail.Status.IGNORED,
                details="No supported invoice attachment was found.",
                received_at=received_at,
            )

        user_model = get_user_model()
        username = os.getenv("EMAIL_INGEST_USER", "admin")
        actor = user_model.objects.filter(username=username, is_active=True).first()
        if not actor:
            raise CommandError(f"Email ingestion user '{username}' does not exist or is inactive.")

        created = []
        duplicates = []
        with transaction.atomic():
            for attachment in attachments:
                filename = Path(attachment.get_filename()).name
                payload = attachment.get_payload(decode=True) or b""
                if not payload or len(payload) > 25 * 1024 * 1024:
                    raise CommandError(f"Attachment {filename} is empty or exceeds 25 MB.")
                with NamedTemporaryFile(suffix=Path(filename).suffix) as temp_file:
                    temp_file.write(payload)
                    temp_file.flush()
                    text, confidence = extract_ocr(temp_file.name)
                fields = extract_invoice_fields(text)
                invoice_number = fields["invoice_number"] or None
                if Invoice.objects.filter(vendor=vendor, invoice_number=invoice_number).exists():
                    duplicates.append(invoice_number)
                    continue
                invoice_date = date.fromisoformat(fields["invoice_date"]) if fields["invoice_date"] else None
                due_date_value = fields["due_date"]
                invoice_date_value = fields["invoice_date"]
                due_date = (
                    date.fromisoformat(due_date_value)
                    if due_date_value and (not invoice_date_value or due_date_value >= invoice_date_value)
                    else invoice_date
                )
                subtotal = fields["subtotal"] or Decimal("0")
                tax_amount = fields["tax_amount"] or Decimal("0")
                total_amount = fields["total_amount"] or (subtotal + tax_amount)
                invoice = Invoice.objects.create(
                    invoice_number=invoice_number,
                    vendor=vendor,
                    invoice_date=invoice_date,
                    due_date=due_date,
                    subtotal=subtotal,
                    tax_amount=tax_amount,
                    total_amount=total_amount,
                    file=ContentFile(payload, name=filename),
                    original_filename=filename,
                    ocr_text=text,
                    ocr_accuracy=confidence,
                    ocr_suggestions=fields,
                    extracted_gstin=fields.get("gstin") or "",
                    capture_source="EMAIL",
                    created_by=actor,
                )
                for line in fields.get("line_items", []):
                    InvoiceLine.objects.create(invoice=invoice, **line)
                missing = [
                    field for field in ("invoice_number", "invoice_date", "due_date", "subtotal", "tax_amount", "total_amount")
                    if fields[field] is None
                ]
                validate_and_match(invoice)
                if missing:
                    invoice.exceptions = list(invoice.exceptions) + [
                        "Email OCR could not confidently identify: " + ", ".join(missing) + ". Review invoice details."
                    ]
                    invoice.status = Invoice.Status.VALIDATION_FAILED
                    invoice.save(update_fields=["exceptions", "status", "updated_at"])
                audit(actor, "invoice.email_ingested", invoice, {"sender": sender, "subject": subject})
                created.append(invoice)
            if not created:
                event_status = InboundEmail.Status.IGNORED
                details = "All supported attachments were duplicate invoices."
            else:
                event_status = InboundEmail.Status.PROCESSED
                details = f"Created {len(created)} invoice(s); skipped {len(duplicates)} duplicate(s)."
            return InboundEmail.objects.create(
                message_id=message_id,
                sender=sender,
                subject=subject,
                status=event_status,
                details=details,
                invoice=created[-1] if created else None,
                received_at=received_at,
            )

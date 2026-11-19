from django.core.serializers.json import DjangoJSONEncoder
from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, RegexValidator
from django.db import models
from django.utils import timezone
from decimal import Decimal


class User(AbstractUser):
    class Roles(models.TextChoices):
        ADMIN = "ADMIN", "Administrator"
        AP_CLERK = "AP_CLERK", "AP Clerk"
        APPROVER = "APPROVER", "Approver"
        ACCOUNTANT = "ACCOUNTANT", "Accountant"
        AUDITOR = "AUDITOR", "Auditor"
    role = models.CharField(max_length=20, choices=Roles.choices, default=Roles.AP_CLERK)


class Vendor(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending Onboarding"
        ACTIVE = "ACTIVE", "Active"
        BLOCKED = "BLOCKED", "Blocked"
    code = models.CharField(max_length=40, unique=True)
    name = models.CharField(max_length=200)
    email = models.EmailField()
    phone = models.CharField(max_length=30, blank=True)
    gstin = models.CharField(max_length=15, blank=True)
    pan = models.CharField(max_length=10, blank=True)
    bank_name = models.CharField(max_length=100, blank=True)
    bank_account = models.CharField(max_length=34, blank=True)
    ifsc = models.CharField(max_length=11, blank=True)
    gst_verification_status = models.CharField(max_length=20, default="UNVERIFIED")
    gst_verification_checked_at = models.DateTimeField(null=True, blank=True)
    bank_verification_status = models.CharField(max_length=20, default="UNVERIFIED")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    address = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        if self.gstin and (len(self.gstin) != 15 or not self.gstin.isalnum()):
            raise ValidationError({"gstin": "GSTIN must contain 15 alphanumeric characters."})

    def __str__(self):
        return f"{self.code} - {self.name}"


class VendorOnboarding(models.Model):
    class Status(models.TextChoices):
        SUBMITTED = "SUBMITTED", "Submitted"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
    vendor = models.OneToOneField(Vendor, on_delete=models.CASCADE, related_name="onboarding")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SUBMITTED)
    submitted_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="vendor_onboardings_submitted")
    decided_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="vendor_onboardings_decided")
    comments = models.TextField(blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)


class VendorBankChange(models.Model):
    vendor = models.ForeignKey(Vendor, on_delete=models.PROTECT, related_name="bank_changes")
    changed_by = models.ForeignKey(User, on_delete=models.PROTECT)
    previous_account_mask = models.CharField(max_length=34, blank=True)
    new_account_mask = models.CharField(max_length=34, blank=True)
    previous_bank_name = models.CharField(max_length=100, blank=True)
    new_bank_name = models.CharField(max_length=100, blank=True)
    previous_ifsc = models.CharField(max_length=11, blank=True)
    new_ifsc = models.CharField(max_length=11, blank=True)
    changed_at = models.DateTimeField(auto_now_add=True)


class PurchaseOrder(models.Model):
    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        CLOSED = "CLOSED", "Closed"
        CANCELLED = "CANCELLED", "Cancelled"
    number = models.CharField(max_length=50, unique=True)
    vendor = models.ForeignKey(Vendor, on_delete=models.PROTECT, related_name="purchase_orders")
    order_date = models.DateField()
    expected_date = models.DateField(null=True, blank=True)
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal("0"))])
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.number


class POLine(models.Model):
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name="lines")
    description = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=12, decimal_places=3)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    received_quantity = models.DecimalField(max_digits=12, decimal_places=3, default=0)

    @property
    def amount(self):
        return self.quantity * self.unit_price


class GoodsReceipt(models.Model):
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.PROTECT, related_name="grns")
    number = models.CharField(max_length=50, unique=True)
    received_date = models.DateField()
    received_by = models.ForeignKey(User, on_delete=models.PROTECT)
    notes = models.TextField(blank=True)


class GRNLine(models.Model):
    grn = models.ForeignKey(GoodsReceipt, on_delete=models.CASCADE, related_name="lines")
    po_line = models.ForeignKey(POLine, on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=12, decimal_places=3)


class Invoice(models.Model):
    class Status(models.TextChoices):
        CAPTURED = "CAPTURED", "Captured"
        VALIDATION_FAILED = "VALIDATION_FAILED", "Validation Failed"
        MATCH_PENDING = "MATCH_PENDING", "Match Pending"
        MATCHED = "MATCHED", "Matched"
        EXCEPTION = "EXCEPTION", "Exception"
        PENDING_APPROVAL = "PENDING_APPROVAL", "Pending Approval"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        PAID = "PAID", "Paid"
    invoice_number = models.CharField(max_length=80, blank=True, null=True)
    content_hash = models.CharField(max_length=64, null=True, blank=True)
    vendor = models.ForeignKey(Vendor, on_delete=models.PROTECT, related_name="invoices")
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.SET_NULL, null=True, blank=True)
    invoice_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    subtotal = models.DecimalField(max_digits=14, decimal_places=2)
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=14, decimal_places=2)
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.CAPTURED)
    match_type = models.CharField(max_length=10, choices=(("NONE", "None"), ("2WAY", "2-Way"), ("3WAY", "3-Way")), default="NONE")
    file = models.FileField(upload_to="invoices/%Y/%m/")
    original_filename = models.CharField(max_length=255, blank=True)
    ocr_text = models.TextField(blank=True)
    ocr_accuracy = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    # Extraction returns Decimal amounts; DjangoJSONEncoder stores them as strings.
    ocr_suggestions = models.JSONField(default=dict, blank=True, encoder=DjangoJSONEncoder)
    extracted_gstin = models.CharField(max_length=15, blank=True)
    extraction_reviewed_at = models.DateTimeField(null=True, blank=True)
    extraction_reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="invoices_extraction_reviewed")
    approval_completed_at = models.DateTimeField(null=True, blank=True)
    exceptions = models.JSONField(default=list, blank=True)
    capture_source = models.CharField(max_length=20, choices=(("UPLOAD", "Upload"), ("BULK", "Bulk"), ("EMAIL", "Email")), default="UPLOAD")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["vendor", "invoice_number"], name="unique_vendor_invoice"),
            models.UniqueConstraint(fields=["vendor", "content_hash"], condition=models.Q(content_hash__isnull=False), name="unique_vendor_invoice_content"),
        ]
        indexes = [models.Index(fields=["status", "due_date"]), models.Index(fields=["invoice_number"])]

    def clean(self):
        if self.due_date and self.invoice_date and self.due_date < self.invoice_date:
            raise ValidationError({"due_date": "Due date cannot be before invoice date."})
        if self.total_amount <= 0:
            raise ValidationError({"total_amount": "Total amount must be greater than zero."})


class InvoiceFieldVerification(models.Model):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="field_verifications")
    field_name = models.CharField(max_length=80)
    suggested_value = models.TextField(blank=True)
    verified_value = models.TextField(blank=True)
    suggestion_correct = models.BooleanField()
    verified_by = models.ForeignKey(User, on_delete=models.PROTECT)
    verified_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["invoice", "field_name"], name="unique_invoice_field_verification")]


class InvoiceLine(models.Model):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="lines")
    po_line = models.ForeignKey(POLine, on_delete=models.PROTECT, null=True, blank=True, related_name="invoice_lines")
    description = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=12, decimal_places=3)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=14, decimal_places=2)


class ApprovalRule(models.Model):
    name = models.CharField(max_length=100)
    min_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    max_amount = models.DecimalField(max_digits=14, decimal_places=2)
    role = models.ForeignKey("ap_app.User", on_delete=models.PROTECT, limit_choices_to={"role": "APPROVER"})
    sequence = models.PositiveSmallIntegerField(default=1)
    parallel = models.BooleanField(default=False)
    escalation_hours = models.PositiveIntegerField(default=24)


class Approval(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        ESCALATED = "ESCALATED", "Escalated"
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="approvals")
    approver = models.ForeignKey(User, on_delete=models.PROTECT)
    rule = models.ForeignKey(ApprovalRule, on_delete=models.PROTECT)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    sequence = models.PositiveSmallIntegerField(default=1)
    comments = models.TextField(blank=True)
    due_at = models.DateTimeField(null=True, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ("invoice", "approver", "sequence")


class Payment(models.Model):
    class Status(models.TextChoices):
        REQUESTED = "REQUESTED", "Requested"
        SCHEDULED = "SCHEDULED", "Scheduled"
        PROCESSING = "PROCESSING", "Processing"
        PAID = "PAID", "Paid"
        FAILED = "FAILED", "Failed"
    invoice = models.OneToOneField(Invoice, on_delete=models.PROTECT, related_name="payment")
    reference = models.CharField(max_length=80, unique=True)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.REQUESTED)
    bank_reference = models.CharField(max_length=100, blank=True)
    payment_method = models.CharField(max_length=30, choices=(
        ("BANK_TRANSFER", "Bank transfer"), ("CHEQUE", "Cheque"),
        ("UPI", "UPI"), ("OTHER", "Other"),
    ))
    advice = models.TextField(blank=True)
    requested_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)


class PaymentStatusEvent(models.Model):
    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name="status_events")
    previous_status = models.CharField(max_length=20, blank=True)
    new_status = models.CharField(max_length=20)
    note = models.CharField(max_length=500, blank=True)
    changed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    changed_at = models.DateTimeField(auto_now_add=True)


class AuditLog(models.Model):
    actor = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    action = models.CharField(max_length=100)
    entity_type = models.CharField(max_length=100)
    entity_id = models.PositiveIntegerField()
    details = models.JSONField(default=dict, blank=True)
    timestamp = models.DateTimeField(default=timezone.now)


class APNotification(models.Model):
    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name="ap_notifications")
    title = models.CharField(max_length=160)
    message = models.TextField()
    entity_type = models.CharField(max_length=80, blank=True)
    entity_id = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)
    email_sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["recipient", "read_at", "created_at"])]


class IntegrationDelivery(models.Model):
    class Provider(models.TextChoices):
        ERP = "ERP", "ERP"
        BANK = "BANK", "Bank"
    class Status(models.TextChoices):
        SUCCEEDED = "SUCCEEDED", "Succeeded"
        FAILED = "FAILED", "Failed"
    provider = models.CharField(max_length=10, choices=Provider.choices)
    entity_type = models.CharField(max_length=40)
    entity_id = models.PositiveIntegerField()
    idempotency_key = models.CharField(max_length=120, unique=True)
    status = models.CharField(max_length=20, choices=Status.choices)
    response_status = models.PositiveSmallIntegerField(null=True, blank=True)
    response_summary = models.CharField(max_length=500, blank=True)
    attempted_at = models.DateTimeField(auto_now_add=True)
    attempted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)

    class Meta:
        ordering = ["-attempted_at"]
        indexes = [models.Index(fields=["provider", "entity_type", "entity_id"])]


class InboundEmail(models.Model):
    class Status(models.TextChoices):
        PROCESSED = "PROCESSED", "Processed"
        IGNORED = "IGNORED", "Ignored"
        FAILED = "FAILED", "Failed"
    message_id = models.CharField(max_length=255, unique=True)
    sender = models.EmailField(blank=True)
    subject = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices)
    details = models.TextField(blank=True)
    invoice = models.ForeignKey(Invoice, on_delete=models.SET_NULL, null=True, blank=True, related_name="inbound_email_events")
    received_at = models.DateTimeField()
    processed_at = models.DateTimeField(auto_now_add=True)

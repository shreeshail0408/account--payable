import re
from rest_framework import serializers
from rest_framework.validators import UniqueTogetherValidator
from django.db import transaction
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from .models import *

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name", "last_name", "role")

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    class Meta:
        model = User
        fields = ("id", "username", "email", "password", "first_name", "last_name", "role")
        extra_kwargs = {"role": {"required": False}}
    def create(self, validated):
        raise serializers.ValidationError("Public registration is disabled. Ask an administrator to create your account.")


class EmployeeSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=12)

    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name", "last_name", "role", "is_active", "password")
        read_only_fields = ("id",)

    def create(self, validated_data):
        password = validated_data.pop("password")
        validate_password(password)
        validated_data["is_active"] = False
        return User.objects.create_user(password=password, **validated_data)


class ExtractionReviewSerializer(serializers.Serializer):
    """Parses `confirmed` the DRF way, so JSON true and form-encoded "true" both work."""
    confirmed = serializers.BooleanField(required=False, default=False)


class EmployeeActivationSerializer(serializers.Serializer):
    is_active = serializers.BooleanField()


def mask_last4(value):
    """Show only the last 4 characters, e.g. '123456789012' -> '••••••••9012'."""
    value = value or ""
    if not value:
        return ""
    return "•" * max(0, len(value) - 4) + value[-4:]


class VendorBankDetailsSerializer(serializers.Serializer):
    bank_name = serializers.CharField(max_length=100, allow_blank=True, required=False)
    bank_account = serializers.RegexField(r"^[A-Za-z0-9 -]{8,34}$", max_length=34, write_only=True)
    ifsc = serializers.RegexField(r"^[A-Za-z]{4}0[A-Za-z0-9]{6}$", max_length=11)

class VendorSerializer(serializers.ModelSerializer):
    onboarding_status = serializers.SerializerMethodField()
    bank_account = serializers.SerializerMethodField()
    ifsc = serializers.SerializerMethodField()
    class Meta:
        model = Vendor
        fields = "__all__"
        read_only_fields = ("status", "bank_name", "bank_account", "ifsc", "gst_verification_status", "gst_verification_checked_at", "bank_verification_status")
    def create(self, validated_data):
        validated_data["status"] = Vendor.Status.PENDING
        return super().create(validated_data)
    def validate_gstin(self, value):
        if value and not re.fullmatch(r"\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]", value.upper()):
            raise serializers.ValidationError("Enter a valid-format 15-character GSTIN.")
        return value.upper()

    # General responses never carry full bank values, for any role. Full values are only
    # served by the audited /vendors/{id}/full-bank-details/ endpoint (ADMIN, ACCOUNTANT).
    def get_bank_account(self, vendor):
        return mask_last4(vendor.bank_account)
    def get_ifsc(self, vendor):
        return mask_last4(vendor.ifsc)
    def validate_pan(self, value):
        value = value.upper()
        if value and not re.fullmatch(r"[A-Z]{5}\d{4}[A-Z]", value):
            raise serializers.ValidationError("Enter a valid 10-character PAN.")
        return value
    def validate_ifsc(self, value):
        value = value.upper()
        if value and not re.fullmatch(r"[A-Z]{4}0[A-Z0-9]{6}", value):
            raise serializers.ValidationError("Enter a valid 11-character IFSC.")
        return value
    def get_onboarding_status(self, vendor):
        return getattr(getattr(vendor, "onboarding", None), "status", None)

class POLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = POLine
        fields = ("id", "description", "quantity", "unit_price", "received_quantity", "amount")
        read_only_fields = ("id", "received_quantity", "amount")

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Ordered quantity must be greater than zero.")
        return value

    def validate_unit_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Unit price cannot be negative.")
        return value

class POSerializer(serializers.ModelSerializer):
    lines = POLineSerializer(many=True, required=False)
    vendor_name = serializers.CharField(source="vendor.name", read_only=True)
    class Meta:
        model = PurchaseOrder
        fields = "__all__"
    def validate_total_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Purchase order amount must be greater than zero.")
        return value
    def validate(self, attrs):
        lines = attrs.get("lines", [])
        total_amount = attrs.get("total_amount", getattr(self.instance, "total_amount", None))
        if self.instance is not None and "lines" in attrs:
            raise serializers.ValidationError({"lines": "PO lines cannot be edited after the purchase order is created."})
        if lines and total_amount is not None:
            line_total = sum((line["quantity"] * line["unit_price"] for line in lines), 0)
            if line_total > total_amount:
                raise serializers.ValidationError({"lines": "Purchase order lines cannot exceed the PO total amount."})
        return attrs
    @transaction.atomic
    def create(self, validated):
        lines = validated.pop("lines", [])
        po = PurchaseOrder.objects.create(**validated)
        POLine.objects.bulk_create([POLine(purchase_order=po, **line) for line in lines])
        return po

class GRNLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = GRNLine
        fields = ("id", "po_line", "quantity")
        read_only_fields = ("id",)
    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Received quantity must be greater than zero.")
        return value

class GRNSerializer(serializers.ModelSerializer):
    lines = GRNLineSerializer(many=True)
    class Meta:
        model = GoodsReceipt
        fields = "__all__"
    def validate(self, attrs):
        po = attrs.get("purchase_order")
        lines = attrs.get("lines", [])
        if po.status != "OPEN":
            raise serializers.ValidationError({"purchase_order": "Goods can only be received against an open PO."})
        if not lines:
            raise serializers.ValidationError({"lines": "At least one receipt line is required."})
        received_by_po_line = {}
        for line in lines:
            po_line = line["po_line"]
            if po_line.purchase_order_id != po.id:
                raise serializers.ValidationError({"lines": "Each received PO line must belong to this purchase order."})
            received_by_po_line[po_line.pk] = received_by_po_line.get(po_line.pk, 0) + line["quantity"]
        for line in lines:
            po_line = line["po_line"]
            if po_line.received_quantity + received_by_po_line[po_line.pk] > po_line.quantity:
                raise serializers.ValidationError({"lines": f"Received quantity exceeds ordered quantity for {po_line.description}."})
        return attrs
    def create(self, validated):
        lines = validated.pop("lines")
        with transaction.atomic():
            grn = GoodsReceipt.objects.create(**validated)
            for line in lines:
                po_line = POLine.objects.select_for_update().get(pk=line["po_line"].pk)
                if po_line.received_quantity + line["quantity"] > po_line.quantity:
                    raise serializers.ValidationError({"lines": f"Received quantity exceeds ordered quantity for {po_line.description}."})
                GRNLine.objects.create(grn=grn, **{**line, "po_line": po_line})
                po_line.received_quantity += line["quantity"]
                po_line.save(update_fields=["received_quantity"])
            return grn

class InvoiceLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceLine
        fields = "__all__"
        read_only_fields = ("invoice",)
    def validate(self, attrs):
        quantity = attrs.get("quantity")
        unit_price = attrs.get("unit_price")
        amount = attrs.get("amount")
        if quantity is not None and quantity <= 0:
            raise serializers.ValidationError({"quantity": "Quantity must be greater than zero."})
        if unit_price is not None and unit_price < 0:
            raise serializers.ValidationError({"unit_price": "Unit price cannot be negative."})
        if quantity is not None and unit_price is not None and amount is not None:
            if abs(quantity * unit_price - amount) > 0.01:
                raise serializers.ValidationError({"amount": "Line amount must equal quantity multiplied by unit price."})
        return attrs

class InvoiceSerializer(serializers.ModelSerializer):
    lines = InvoiceLineSerializer(many=True, required=False)
    vendor_name = serializers.CharField(source="vendor.name", read_only=True)
    class Meta:
        model = Invoice
        fields = "__all__"
        read_only_fields = ("content_hash", "ocr_text", "ocr_accuracy", "ocr_suggestions", "extraction_reviewed_at", "extraction_reviewed_by", "approval_completed_at", "exceptions", "created_by", "status", "lines")
    def get_validators(self):
        # DRF auto-adds a UniqueTogetherValidator for the (vendor, invoice_number) constraint,
        # which runs before validate() and replaces our field-specific duplicate message with
        # a generic non_field_error. validate() performs the same check, so drop that one.
        return [
            validator for validator in super().get_validators()
            if not (
                isinstance(validator, UniqueTogetherValidator)
                and set(validator.fields) == {"vendor", "invoice_number"}
            )
        ]
    def validate_invoice_number(self, value):
        return value.strip() or None if value is not None else None
    def validate_extracted_gstin(self, value):
        value = value.upper().strip()
        if value and not re.fullmatch(r"\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]", value):
            raise serializers.ValidationError("Enter a valid-format 15-character GSTIN from the invoice.")
        return value
    def validate(self, attrs):
        if self.instance is not None and "file" in attrs:
            raise serializers.ValidationError({"file": "The source invoice file cannot be replaced after capture."})
        invoice_date = attrs.get("invoice_date", getattr(self.instance, "invoice_date", None))
        due_date = attrs.get("due_date", getattr(self.instance, "due_date", None))
        if invoice_date and due_date and due_date < invoice_date:
            raise serializers.ValidationError("Due date cannot be before invoice date.")
        total_amount = attrs.get("total_amount", getattr(self.instance, "total_amount", 0))
        if total_amount is None or total_amount <= 0:
            raise serializers.ValidationError("Total amount must be greater than zero.")
        if attrs.get("purchase_order") and attrs["purchase_order"].status != "OPEN":
            raise serializers.ValidationError({"purchase_order": "Invoices cannot be matched to a closed or cancelled PO."})
        if attrs.get("subtotal", 0) < 0 or attrs.get("tax_amount", 0) < 0:
            raise serializers.ValidationError("Subtotal and tax amount cannot be negative.")
        if all(field in attrs for field in ("subtotal", "tax_amount", "total_amount")):
            if abs(attrs["subtotal"] + attrs["tax_amount"] - attrs["total_amount"]) > 0.01:
                raise serializers.ValidationError("Subtotal plus tax must equal the invoice total.")
        invoice_number = attrs.get("invoice_number", getattr(self.instance, "invoice_number", None))
        vendor = attrs.get("vendor", getattr(self.instance, "vendor", None))
        duplicates = Invoice.objects.filter(invoice_number=invoice_number, vendor=vendor)
        if self.instance is not None:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if invoice_number and vendor and duplicates.exists():
            raise serializers.ValidationError({"invoice_number": "This invoice number already exists for this vendor."})
        return attrs
    def validate_file(self, value):
        allowed = {".pdf", ".jpg", ".jpeg", ".png", ".tif", ".tiff"}
        extension = "." + value.name.rsplit(".", 1)[-1].lower() if "." in value.name else ""
        if extension not in allowed:
            raise serializers.ValidationError("Upload a PDF, JPG, PNG, or TIFF invoice.")
        if value.size > 25 * 1024 * 1024:
            raise serializers.ValidationError("Invoice file must be 25 MB or smaller.")
        if value.size == 0:
            raise serializers.ValidationError("Invoice file is empty.")
        return value

class ApprovalRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApprovalRule
        fields = "__all__"

    def validate(self, attrs):
        minimum = attrs.get("min_amount", getattr(self.instance, "min_amount", None))
        maximum = attrs.get("max_amount", getattr(self.instance, "max_amount", None))
        if minimum is not None and minimum < 0:
            raise serializers.ValidationError({"min_amount": "Minimum amount cannot be negative."})
        if maximum is not None and maximum < 0:
            raise serializers.ValidationError({"max_amount": "Maximum amount cannot be negative."})
        if minimum is not None and maximum is not None and minimum > maximum:
            raise serializers.ValidationError({"max_amount": "Maximum amount must be at least the minimum amount."})
        if attrs.get("sequence", getattr(self.instance, "sequence", 1)) < 1:
            raise serializers.ValidationError({"sequence": "Sequence must be at least 1."})
        if attrs.get("escalation_hours", getattr(self.instance, "escalation_hours", 24)) < 1:
            raise serializers.ValidationError({"escalation_hours": "Escalation must be at least one hour."})
        role = attrs.get("role", getattr(self.instance, "role", None))
        if role and (role.role != User.Roles.APPROVER or not role.is_active):
            raise serializers.ValidationError({"role": "Select an active user with the Approver role."})
        return attrs

class ApprovalSerializer(serializers.ModelSerializer):
    approver_name = serializers.CharField(source="approver.username", read_only=True)
    invoice_number = serializers.CharField(source="invoice.invoice_number", read_only=True)
    class Meta:
        model = Approval
        fields = "__all__"

class PaymentSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source="invoice.vendor.name", read_only=True)
    invoice_number = serializers.CharField(source="invoice.invoice_number", read_only=True)
    status_events = serializers.SerializerMethodField()
    class Meta:
        model = Payment
        fields = "__all__"
    def get_status_events(self, payment):
        return PaymentStatusEventSerializer(payment.status_events.select_related("changed_by").all(), many=True).data


class PaymentStatusEventSerializer(serializers.ModelSerializer):
    changed_by_name = serializers.CharField(source="changed_by.username", read_only=True)
    class Meta:
        model = PaymentStatusEvent
        fields = ("id", "previous_status", "new_status", "note", "changed_by_name", "changed_at")

class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.username", read_only=True)
    class Meta:
        model = AuditLog
        fields = "__all__"

class VendorOnboardingSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source="vendor.name", read_only=True)
    code = serializers.CharField(source="vendor.code", read_only=True)
    submitted_by_name = serializers.CharField(source="submitted_by.username", read_only=True)
    decided_by_name = serializers.CharField(source="decided_by.username", read_only=True)
    class Meta:
        model = VendorOnboarding
        fields = "__all__"
        read_only_fields = ("status", "submitted_by", "decided_by", "submitted_at", "decided_at")

class APNotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = APNotification
        fields = "__all__"
        read_only_fields = ("recipient", "title", "message", "entity_type", "entity_id", "created_at")

class IntegrationDeliverySerializer(serializers.ModelSerializer):
    attempted_by_name = serializers.CharField(source="attempted_by.username", read_only=True)
    class Meta:
        model = IntegrationDelivery
        fields = "__all__"
        read_only_fields = ("attempted_by", "idempotency_key", "status", "response_status", "response_summary", "attempted_at")


class InvoiceFieldVerificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceFieldVerification
        fields = ("id", "field_name", "suggested_value", "verified_value", "suggestion_correct", "verified_by", "verified_at")
        read_only_fields = fields

class InboundEmailSerializer(serializers.ModelSerializer):
    class Meta:
        model = InboundEmail
        fields = "__all__"

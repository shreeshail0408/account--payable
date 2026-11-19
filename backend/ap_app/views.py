from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from django.db.models import Sum, Count, Avg, F, Q
from django.db.models.functions import TruncMonth
from django.utils import timezone
from django.db import IntegrityError, transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework.filters import SearchFilter
from .models import *
from .serializers import *
from .permissions import APRolePermission
from .services import DuplicateInvoiceError, aging_bucket_filters, audit, capture_invoice_upload, extract_ocr, extract_invoice_fields, validate_and_match, create_approval_steps, notify_current_approval_step, process_approval_deadlines
import csv
import hashlib
import json
import os
import re
import tempfile
import uuid

class APTokenSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["name"] = user.get_full_name() or user.username
        return token
    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data

class APTokenView(TokenObtainPairView):
    serializer_class = APTokenSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    return Response({"detail": "Public registration is disabled. Ask an administrator to create your account."}, status=403)


@api_view(["GET", "POST"])
def employees(request):
    if request.user.role != User.Roles.ADMIN:
        return Response({"detail": "Only administrators can manage employee accounts."}, status=403)
    if request.method == "GET":
        return Response(EmployeeSerializer(User.objects.order_by("username"), many=True).data)
    serializer = EmployeeSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    employee = serializer.save()
    audit(request.user, "employee.created_inactive", employee)
    return Response(EmployeeSerializer(employee).data, status=201)


@api_view(["PATCH"])
def employee_activation(request, pk):
    if request.user.role != User.Roles.ADMIN:
        return Response({"detail": "Only administrators can activate or deactivate employees."}, status=403)
    employee = User.objects.filter(pk=pk).first()
    if employee is None:
        return Response({"detail": "Employee was not found."}, status=404)
    serializer = EmployeeActivationSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    requested_active = serializer.validated_data["is_active"]
    if employee.pk == request.user.pk and not requested_active:
        return Response({"detail": "You cannot deactivate your own administrator account."}, status=400)
    employee.is_active = requested_active
    employee.save(update_fields=["is_active"])
    audit(request.user, "employee.activation_changed", employee, {"is_active": employee.is_active})
    return Response(EmployeeSerializer(employee).data)

@api_view(["GET"])
def me(request):
    return Response(UserSerializer(request.user).data)

class BaseViewSet(viewsets.ModelViewSet):
    permission_classes = [APRolePermission]

    def perform_create(self, serializer):
        obj = serializer.save()
        audit(self.request.user, f"{obj.__class__.__name__.lower()}.created", obj)

    def perform_update(self, serializer):
        obj = serializer.save()
        audit(self.request.user, f"{obj.__class__.__name__.lower()}.updated", obj)

    def perform_destroy(self, instance):
        audit(self.request.user, f"{instance.__class__.__name__.lower()}.deleted", instance)
        super().perform_destroy(instance)


def record_extraction_verification(invoice, actor):
    field_map = {
        "invoice_number": invoice.invoice_number,
        "invoice_date": invoice.invoice_date,
        "due_date": invoice.due_date,
        "subtotal": invoice.subtotal,
        "tax_amount": invoice.tax_amount,
        "total_amount": invoice.total_amount,
        "gstin": invoice.extracted_gstin,
    }
    suggestions = invoice.ocr_suggestions or {}
    records = []
    for field_name, verified_value in field_map.items():
        if verified_value is None:
            continue
        suggested = suggestions.get(field_name)
        suggested_text = "" if suggested is None else str(suggested)
        verified_text = verified_value.isoformat() if hasattr(verified_value, "isoformat") else str(verified_value)
        if field_name in ("subtotal", "tax_amount", "total_amount") and suggested is not None:
            try:
                correct = Decimal(suggested_text) == Decimal(verified_text)
            except (InvalidOperation, ValueError, TypeError):
                correct = False
        else:
            correct = suggested is not None and suggested_text.strip().casefold() == verified_text.strip().casefold()
        records.append(InvoiceFieldVerification.objects.update_or_create(
            invoice=invoice, field_name=field_name,
            defaults={
                "suggested_value": suggested_text[:2000],
                "verified_value": verified_text[:2000],
                "suggestion_correct": correct,
                "verified_by": actor,
            },
        )[0])
    suggested_lines = suggestions.get("line_items", [])
    actual_lines = list(invoice.lines.values("description", "quantity", "unit_price", "amount"))
    def canonical_line(line):
        try:
            return (
                " ".join(str(line["description"]).casefold().split()),
                Decimal(str(line["quantity"])), Decimal(str(line["unit_price"])), Decimal(str(line["amount"])),
            )
        except (KeyError, InvalidOperation, TypeError, ValueError):
            return None
    suggested_line_values = [canonical_line(line) for line in suggested_lines if isinstance(line, dict)] if isinstance(suggested_lines, list) else []
    actual_line_values = [canonical_line(line) for line in actual_lines]
    records.append(InvoiceFieldVerification.objects.update_or_create(
        invoice=invoice, field_name="line_items",
        defaults={
            "suggested_value": str(suggested_lines)[:2000],
            "verified_value": str(actual_lines)[:2000],
            "suggestion_correct": bool(suggested_line_values) and sorted(suggested_line_values) == sorted(actual_line_values),
            "verified_by": actor,
        },
    )[0])
    invoice.extraction_reviewed_at = timezone.now()
    invoice.extraction_reviewed_by = actor
    invoice.save(update_fields=["extraction_reviewed_at", "extraction_reviewed_by", "updated_at"])
    return records

class VendorViewSet(BaseViewSet):
    queryset = Vendor.objects.all().order_by("-created_at")
    serializer_class = VendorSerializer
    filter_backends = [SearchFilter]
    search_fields = ["code", "name", "gstin", "email"]
    def perform_create(self, serializer):
        obj = serializer.save()
        VendorOnboarding.objects.create(
            vendor=obj, submitted_by=self.request.user,
            status=VendorOnboarding.Status.SUBMITTED,
        )
        for admin in User.objects.filter(role=User.Roles.ADMIN, is_active=True):
            APNotification.objects.create(
                recipient=admin,
                title="Vendor onboarding submitted",
                message=f"Vendor {obj.name} is awaiting onboarding review.",
                entity_type="Vendor",
                entity_id=obj.pk,
            )
        audit(self.request.user, "vendor.created", obj)

    @action(detail=True, methods=["get", "post"], url_path="bank-details")
    def bank_details(self, request, pk=None):
        if request.user.role != User.Roles.ADMIN:
            return Response({"detail": "Only administrators can manage vendor bank details."}, status=403)
        vendor = self.get_object()
        if request.method == "GET":
            account = vendor.bank_account or ""
            return Response({
                "bank_name": vendor.bank_name,
                "bank_account": "•" * max(0, len(account) - 4) + account[-4:] if account else "",
                "ifsc": vendor.ifsc,
                "verification_status": vendor.bank_verification_status,
            })
        serializer = VendorBankDetailsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        previous_account = vendor.bank_account or ""
        previous_ifsc = vendor.ifsc or ""
        new_account = re.sub(r"\s+", "", values["bank_account"])
        new_ifsc = values["ifsc"].upper()
        if (previous_account, previous_ifsc, vendor.bank_name) != (new_account, new_ifsc, values.get("bank_name", vendor.bank_name)):
            VendorBankChange.objects.create(
                vendor=vendor,
                changed_by=request.user,
                previous_account_mask="•" * max(0, len(previous_account) - 4) + previous_account[-4:],
                new_account_mask="•" * max(0, len(new_account) - 4) + new_account[-4:],
                previous_bank_name=vendor.bank_name,
                new_bank_name=values.get("bank_name", vendor.bank_name),
                previous_ifsc=previous_ifsc,
                new_ifsc=new_ifsc,
            )
        vendor.bank_name = values.get("bank_name", vendor.bank_name)
        vendor.bank_account = new_account
        vendor.ifsc = new_ifsc
        vendor.bank_verification_status = "UNVERIFIED"
        vendor.save(update_fields=["bank_name", "bank_account", "ifsc", "bank_verification_status", "updated_at"])
        audit(request.user, "vendor.bank_details_changed", vendor, {"account_last4": new_account[-4:], "ifsc": new_ifsc})
        return Response(self.get_serializer(vendor).data)

    @action(detail=True, methods=["get"], url_path="full-bank-details")
    def full_bank_details(self, request, pk=None):
        """Unmasked bank details for ADMIN and ACCOUNTANT only; every view is audited."""
        if request.user.role not in (User.Roles.ADMIN, User.Roles.ACCOUNTANT):
            return Response({"detail": "Only administrators and accountants can view full vendor bank details."}, status=403)
        vendor = self.get_object()
        audit(request.user, "vendor.bank_details_viewed", vendor, {
            "account_last4": (vendor.bank_account or "")[-4:],
        })
        return Response({
            "bank_name": vendor.bank_name,
            "bank_account": vendor.bank_account,
            "ifsc": vendor.ifsc,
            "verification_status": vendor.bank_verification_status,
        })

    @action(detail=True, methods=["get"], url_path="bank-history")
    def bank_history(self, request, pk=None):
        if request.user.role != User.Roles.ADMIN:
            return Response({"detail": "Only administrators can view bank detail history."}, status=403)
        vendor = self.get_object()
        return Response(list(vendor.bank_changes.select_related("changed_by").values(
            "changed_by__username", "previous_account_mask", "new_account_mask",
            "previous_bank_name", "new_bank_name", "previous_ifsc", "new_ifsc", "changed_at",
        )))

    @action(detail=True, methods=["post"])
    def approve_onboarding(self, request, pk=None):
        if request.user.role != "ADMIN":
            return Response({"detail": "Only administrators can approve vendor onboarding."}, status=403)
        vendor = self.get_object()
        onboarding = getattr(vendor, "onboarding", None)
        if onboarding is None or onboarding.status != VendorOnboarding.Status.SUBMITTED:
            return Response({"detail": "Vendor has no pending onboarding request."}, status=400)
        onboarding.status = VendorOnboarding.Status.APPROVED
        onboarding.decided_by = request.user
        onboarding.decided_at = timezone.now()
        onboarding.save(update_fields=["status", "decided_by", "decided_at"])
        vendor.status = Vendor.Status.ACTIVE
        vendor.save(update_fields=["status", "updated_at"])
        APNotification.objects.create(
            recipient=onboarding.submitted_by,
            title="Vendor onboarding approved",
            message=f"Vendor {vendor.name} has been approved and activated.",
            entity_type="Vendor",
            entity_id=vendor.pk,
        )
        audit(request.user, "vendor.onboarding_approved", vendor)
        return Response(VendorSerializer(vendor).data)

    @action(detail=True, methods=["post"])
    def reject_onboarding(self, request, pk=None):
        if request.user.role != "ADMIN":
            return Response({"detail": "Only administrators can reject vendor onboarding."}, status=403)
        vendor = self.get_object()
        onboarding = getattr(vendor, "onboarding", None)
        if onboarding is None or onboarding.status != VendorOnboarding.Status.SUBMITTED:
            return Response({"detail": "Vendor has no pending onboarding request."}, status=400)
        reason = request.data.get("comments", "")
        if not isinstance(reason, str) or len(reason.strip()) < 2:
            return Response({"comments": ["Enter a rejection reason of at least two characters."]}, status=400)
        onboarding.status = VendorOnboarding.Status.REJECTED
        onboarding.decided_by = request.user
        onboarding.decided_at = timezone.now()
        onboarding.comments = reason.strip()[:10000]
        onboarding.save(update_fields=["status", "decided_by", "decided_at", "comments"])
        vendor.status = Vendor.Status.BLOCKED
        vendor.save(update_fields=["status", "updated_at"])
        APNotification.objects.create(
            recipient=onboarding.submitted_by,
            title="Vendor onboarding rejected",
            message=f"Vendor {vendor.name} onboarding was rejected. {onboarding.comments}".strip(),
            entity_type="Vendor",
            entity_id=vendor.pk,
        )
        audit(request.user, "vendor.onboarding_rejected", vendor, {"reason": onboarding.comments})
        return Response(VendorSerializer(vendor).data)

    @action(detail=True, methods=["post"], url_path="set-status")
    def set_status(self, request, pk=None):
        if request.user.role != User.Roles.ADMIN:
            return Response({"detail": "Only administrators can change vendor status."}, status=403)
        vendor = self.get_object()
        status_value = request.data.get("status")
        if status_value not in (Vendor.Status.ACTIVE, Vendor.Status.BLOCKED):
            return Response({"status": ["Select ACTIVE or BLOCKED."]}, status=400)
        onboarding = getattr(vendor, "onboarding", None)
        if status_value == Vendor.Status.ACTIVE and onboarding and onboarding.status != VendorOnboarding.Status.APPROVED:
            return Response({"detail": "Only an administrator-approved vendor can be activated."}, status=400)
        previous = vendor.status
        vendor.status = status_value
        vendor.save(update_fields=["status", "updated_at"])
        audit(request.user, "vendor.status_changed", vendor, {"from": previous, "to": status_value})
        return Response(VendorSerializer(vendor).data)

    @action(detail=True, methods=["post"], url_path="verify-gstin")
    def verify_gstin(self, request, pk=None):
        import json
        import os
        from urllib.error import HTTPError, URLError
        from urllib.request import Request, urlopen
        vendor = self.get_object()
        endpoint = os.getenv("GST_VALIDATION_URL", "").strip()
        token = os.getenv("GST_VALIDATION_TOKEN", "").strip()
        if not endpoint or not token:
            vendor.gst_verification_status = "UNAVAILABLE"
            vendor.gst_verification_checked_at = timezone.now()
            vendor.save(update_fields=["gst_verification_status", "gst_verification_checked_at", "updated_at"])
            return Response({"detail": "External GST verification is not configured."}, status=503)
        if not vendor.gstin:
            return Response({"detail": "Vendor has no GSTIN to verify."}, status=400)
        from urllib.parse import urlparse
        if urlparse(endpoint).scheme != "https":
            vendor.gst_verification_status = "FAILED"
            vendor.gst_verification_checked_at = timezone.now()
            vendor.save(update_fields=["gst_verification_status", "gst_verification_checked_at", "updated_at"])
            return Response({"detail": "GST verification endpoint must use HTTPS."}, status=503)
        outgoing = Request(
            endpoint,
            data=json.dumps({"gstin": vendor.gstin}).encode("utf-8"),
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(outgoing, timeout=15) as result:
                body = json.loads(result.read(65536).decode("utf-8"))
        except HTTPError as exc:
            vendor.gst_verification_status = "FAILED"
            vendor.gst_verification_checked_at = timezone.now()
            vendor.save(update_fields=["gst_verification_status", "gst_verification_checked_at", "updated_at"])
            return Response({"detail": f"GST verification provider returned HTTP {exc.code}."}, status=502)
        except URLError:
            vendor.gst_verification_status = "FAILED"
            vendor.gst_verification_checked_at = timezone.now()
            vendor.save(update_fields=["gst_verification_status", "gst_verification_checked_at", "updated_at"])
            return Response({"detail": "Could not reach GST verification provider."}, status=502)
        except (ValueError, UnicodeDecodeError):
            vendor.gst_verification_status = "FAILED"
            vendor.gst_verification_checked_at = timezone.now()
            vendor.save(update_fields=["gst_verification_status", "gst_verification_checked_at", "updated_at"])
            return Response({"detail": "GST verification provider returned an invalid response."}, status=502)
        if not isinstance(body, dict) or not isinstance(body.get("valid"), bool):
            vendor.gst_verification_status = "FAILED"
            vendor.gst_verification_checked_at = timezone.now()
            vendor.save(update_fields=["gst_verification_status", "gst_verification_checked_at", "updated_at"])
            return Response({"detail": "GST provider response must contain a boolean 'valid' field."}, status=502)
        vendor.gst_verification_status = "VERIFIED" if body["valid"] else "FAILED"
        vendor.gst_verification_checked_at = timezone.now()
        vendor.save(update_fields=["gst_verification_status", "gst_verification_checked_at", "updated_at"])
        return Response({"gstin": vendor.gstin, "valid": body["valid"], "status": vendor.gst_verification_status})

class POViewSet(BaseViewSet):
    queryset = PurchaseOrder.objects.select_related("vendor").prefetch_related("lines").all().order_by("-created_at")
    serializer_class = POSerializer
    filter_backends = [SearchFilter]
    search_fields = ["number", "vendor__name"]

    def perform_update(self, serializer):
        po = self.get_object()
        if po.grns.exists() or po.invoice_set.exists():
            raise serializers.ValidationError({"detail": "A purchase order with receipts or invoices cannot be edited."})
        super().perform_update(serializer)

class GRNViewSet(BaseViewSet):
    queryset = GoodsReceipt.objects.select_related("purchase_order", "received_by").prefetch_related("lines").all()
    serializer_class = GRNSerializer

    def perform_create(self, serializer):
        obj = serializer.save(received_by=self.request.user)
        audit(self.request.user, "goodsreceipt.created", obj)

class InvoiceViewSet(BaseViewSet):
    queryset = Invoice.objects.select_related("vendor", "purchase_order", "created_by").prefetch_related("lines").all().order_by("-created_at")
    serializer_class = InvoiceSerializer
    filter_backends = [SearchFilter]
    search_fields = ["invoice_number", "vendor__name", "status"]

    def get_queryset(self):
        queryset = super().get_queryset()
        role = self.request.user.role
        if role == User.Roles.APPROVER:
            queryset = queryset.filter(approvals__approver=self.request.user).distinct()
        elif role == User.Roles.ACCOUNTANT:
            queryset = queryset.filter(status__in=[Invoice.Status.APPROVED, Invoice.Status.PAID])
        return queryset

    @action(detail=False, methods=["post"], url_path="ocr-preview")
    def ocr_preview(self, request):
        upload = request.FILES.get("file")
        if not upload:
            return Response({"detail": "Upload an invoice file to preview OCR."}, status=400)
        extension = os.path.splitext(upload.name)[1].lower()
        if extension not in {".pdf", ".jpg", ".jpeg", ".png", ".tif", ".tiff"}:
            return Response({"file": ["Upload a PDF, JPG, PNG, or TIFF invoice."]}, status=400)
        if upload.size > 25 * 1024 * 1024:
            return Response({"file": ["Invoice file must be 25 MB or smaller."]}, status=400)
        try:
            with tempfile.NamedTemporaryFile(suffix=extension) as temp_file:
                for chunk in upload.chunks():
                    temp_file.write(chunk)
                temp_file.flush()
                text, accuracy = extract_ocr(temp_file.name)
            return Response({
                "text": text,
                "accuracy": accuracy,
                "fields": extract_invoice_fields(text),
            })
        except RuntimeError as exc:
            return Response({"detail": str(exc)}, status=503)

    @transaction.atomic
    def perform_create(self, serializer):
        obj = serializer.save(created_by=self.request.user)
        if obj.file:
            digest = hashlib.sha256()
            with obj.file.open("rb") as source_file:
                for chunk in iter(lambda: source_file.read(1024 * 1024), b""):
                    digest.update(chunk)
            obj.content_hash = digest.hexdigest()
            if Invoice.objects.filter(vendor_id=obj.vendor_id, content_hash=obj.content_hash).exclude(pk=obj.pk).exists():
                obj.file.delete(save=False)
                obj.delete()
                raise serializers.ValidationError({"file": "This exact invoice file was already uploaded for this vendor."})
            obj.save(update_fields=["content_hash", "updated_at"])
        raw_lines = self.request.data.get("line_items", "[]")
        try:
            lines = json.loads(raw_lines) if isinstance(raw_lines, str) else raw_lines
            if not isinstance(lines, list):
                raise ValueError("Line items must be a JSON array.")
            for line in lines:
                line_serializer = InvoiceLineSerializer(data=line)
                line_serializer.is_valid(raise_exception=True)
                line_serializer.save(invoice=obj)
            if obj.file:
                try:
                    text, accuracy = extract_ocr(obj.file.path)
                    obj.ocr_text, obj.ocr_accuracy = text, accuracy
                    obj.ocr_suggestions = extract_invoice_fields(text)
                    obj.extracted_gstin = obj.ocr_suggestions.get("gstin") or obj.extracted_gstin or ""
                except RuntimeError as exc:
                    obj.ocr_text, obj.ocr_accuracy = "", 0
                    obj.ocr_suggestions = {}
                    obj.exceptions = [f"OCR is unavailable: {str(exc)[:400]}. Review invoice details manually."]
            obj.save(update_fields=["ocr_text", "ocr_accuracy", "ocr_suggestions", "extracted_gstin", "exceptions", "updated_at"])
        except ValueError as exc:
            obj.delete()
            raise serializers.ValidationError({"file": str(exc)}) from exc
        validate_and_match(obj)
        if self.request.data.get("reviewed_extraction") in ("true", True):
            record_extraction_verification(obj, self.request.user)
        audit(self.request.user, "invoice.created", obj, {"source": obj.capture_source})

    @transaction.atomic
    def perform_update(self, serializer):
        invoice = self.get_object()
        if invoice.status in (Invoice.Status.APPROVED, Invoice.Status.PAID, Invoice.Status.REJECTED) or invoice.approvals.exists():
            raise serializers.ValidationError({"detail": "Invoices with a completed or active approval history cannot be edited."})
        raw_lines = self.request.data.get("line_items")
        validated_lines = None
        if raw_lines is not None:
            try:
                submitted_lines = json.loads(raw_lines) if isinstance(raw_lines, str) else raw_lines
            except (TypeError, ValueError) as exc:
                raise serializers.ValidationError({"line_items": "Line items must be a JSON array."}) from exc
            if not isinstance(submitted_lines, list) or not submitted_lines:
                raise serializers.ValidationError({"line_items": "At least one invoice line item is required."})
            validated_lines = []
            for line in submitted_lines:
                line_serializer = InvoiceLineSerializer(data=line)
                line_serializer.is_valid(raise_exception=True)
                validated_lines.append(line_serializer.validated_data)
        obj = serializer.save()
        if validated_lines is not None:
            obj.lines.all().delete()
            for line in validated_lines:
                InvoiceLine.objects.create(invoice=obj, **line)
        obj.field_verifications.all().delete()
        validate_and_match(obj)
        obj.extraction_reviewed_at = None
        obj.extraction_reviewed_by = None
        obj.save(update_fields=["extraction_reviewed_at", "extraction_reviewed_by", "updated_at"])
        audit(self.request.user, "invoice.updated", obj, {"line_items_updated": validated_lines is not None})

    @action(detail=False, methods=["post"], url_path="bulk")
    def bulk(self, request):
        files = request.FILES.getlist("files")
        vendor = Vendor.objects.filter(pk=request.data.get("vendor")).first()
        if not vendor:
            return Response({"vendor": ["Select a valid vendor for this upload batch."]}, status=400)
        if not files:
            return Response({"files": ["Select at least one invoice file."]}, status=400)
        if len(files) > 50:
            return Response({"files": ["Upload no more than 50 invoices in one batch."]}, status=400)
        if sum(upload.size for upload in files) > 250 * 1024 * 1024:
            return Response({"files": ["Combined invoice batch must be 250 MB or smaller."]}, status=400)

        created = []
        errors = []
        for uploaded_file in files:
            try:
                with transaction.atomic():
                    invoice = capture_invoice_upload(uploaded_file, vendor, request.user, source="BULK")
                created.append(invoice.pk)
            except (ValueError, IntegrityError) as exc:
                errors.append({"filename": uploaded_file.name, "detail": str(exc)})
        return Response({"created": len(created), "invoice_ids": created, "errors": errors}, status=201)

    @action(detail=False, methods=["post"], url_path="email")
    def email_capture(self, request):
        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response({"detail": "No email attachment supplied."}, status=400)
        vendor = Vendor.objects.filter(pk=request.data.get("vendor")).first()
        if not vendor:
            return Response({"detail": "Valid vendor is required."}, status=400)
        try:
            with transaction.atomic():
                invoice = capture_invoice_upload(uploaded_file, vendor, request.user, source="EMAIL")
        except DuplicateInvoiceError as exc:
            return Response({"detail": str(exc)}, status=409)
        except ValueError as exc:
            return Response({"file": [str(exc)]}, status=400)
        except IntegrityError:
            return Response({"detail": "An invoice with the extracted number already exists for this vendor."}, status=409)
        return Response(InvoiceSerializer(invoice).data, status=201)

    @action(detail=True, methods=["post"])
    def validate(self, request, pk=None):
        invoice = self.get_object()
        errors = validate_and_match(invoice)
        audit(request.user, "invoice.validated", invoice, {"errors": errors})
        return Response({"status": invoice.status, "exceptions": errors})

    @action(detail=True, methods=["get"])
    def ocr(self, request, pk=None):
        invoice = self.get_object()
        return Response({
            "text": invoice.ocr_text,
            "accuracy": invoice.ocr_accuracy,
            "fields": extract_invoice_fields(invoice.ocr_text),
        })

    @action(detail=True, methods=["post"])
    def submit_approval(self, request, pk=None):
        invoice = self.get_object()
        if invoice.extraction_reviewed_at is None:
            return Response({"detail": "An authorized user must review and confirm the extracted invoice fields before approval."}, status=400)
        if invoice.approvals.exists():
            return Response({"detail": "This invoice has already been submitted for approval."}, status=409)
        errors = validate_and_match(invoice)
        if errors:
            return Response({"detail": "Resolve validation exceptions first.", "errors": errors}, status=400)
        steps = create_approval_steps(invoice)
        if not steps:
            return Response({"detail": "No approval rule covers this invoice amount. Configure an approval rule first."}, status=400)
        audit(request.user, "invoice.submitted_for_approval", invoice)
        return Response({"status": invoice.status, "approval_count": len(steps)})

    @action(detail=True, methods=["post"], url_path="review-extraction")
    def review_extraction(self, request, pk=None):
        invoice = self.get_object()
        if invoice.status in (Invoice.Status.APPROVED, Invoice.Status.PAID, Invoice.Status.REJECTED):
            return Response({"detail": "This invoice can no longer be edited or re-reviewed."}, status=409)
        if request.data.get("confirmed") is not True:
            return Response({"confirmed": ["Confirm that the displayed invoice fields were checked against the source document."]}, status=400)
        records = record_extraction_verification(invoice, request.user)
        audit(request.user, "invoice.extraction_reviewed", invoice, {
            "field_count": len(records),
            "correct_suggestions": sum(1 for record in records if record.suggestion_correct),
        })
        return Response({
            "reviewed_at": invoice.extraction_reviewed_at,
            "verified_fields": InvoiceFieldVerificationSerializer(records, many=True).data,
        })

    @action(detail=True, methods=["post"], url_path="sync-erp")
    def sync_erp(self, request, pk=None):
        invoice = self.get_object()
        if invoice.status not in (Invoice.Status.APPROVED, Invoice.Status.PAID):
            return Response({"detail": "Only approved or paid invoices can be synced to the ERP."}, status=400)
        from .integrations import IntegrationNotConfigured, IntegrationRequestFailed, send_integration_payload
        try:
            response_status, summary = send_integration_payload(
                "ERP", "Invoice", invoice.pk,
                {
                    "invoice_number": invoice.invoice_number,
                    "vendor_code": invoice.vendor.code,
                    "vendor_name": invoice.vendor.name,
                    "invoice_date": invoice.invoice_date,
                    "due_date": invoice.due_date,
                    "subtotal": invoice.subtotal,
                    "tax_amount": invoice.tax_amount,
                    "total_amount": invoice.total_amount,
                    "status": invoice.status,
                    "lines": list(invoice.lines.values(
                        "description", "quantity", "unit_price", "tax_rate", "amount",
                    )),
                },
                request.user, f"invoice-{invoice.pk}",
            )
        except IntegrationNotConfigured as exc:
            return Response({"detail": str(exc)}, status=503)
        except IntegrationRequestFailed as exc:
            return Response({"detail": str(exc)}, status=502)
        audit(request.user, "invoice.synced_to_erp", invoice, {"http_status": response_status})
        return Response({"status": "SUCCEEDED", "provider_response": summary})

class ApprovalRuleViewSet(BaseViewSet):
    queryset = ApprovalRule.objects.select_related("role").all().order_by("sequence")
    serializer_class = ApprovalRuleSerializer

    @action(detail=False, methods=["get"])
    def approvers(self, request):
        users = User.objects.filter(role=User.Roles.APPROVER, is_active=True).order_by("username")
        return Response([{"id": user.pk, "username": user.username} for user in users])

class ApprovalViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Approval.objects.select_related("invoice", "approver", "rule").all().order_by("sequence")
    serializer_class = ApprovalSerializer
    filter_backends = [SearchFilter]
    search_fields = ["invoice__invoice_number", "status", "approver__username"]

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.request.user.role not in (User.Roles.ADMIN, User.Roles.AUDITOR):
            queryset = queryset.filter(approver=self.request.user)
        return queryset

    @action(detail=False, methods=["get"])
    def reminders(self, request):
        cutoff = timezone.now() + timedelta(hours=24)
        approvals = self.get_queryset().filter(
            status__in=["PENDING", "ESCALATED"], due_at__lte=cutoff,
        )
        if request.user.role != "ADMIN":
            approvals = approvals.filter(approver=request.user)
        return Response(ApprovalSerializer(approvals, many=True).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def approve(self, request, pk=None):
        approval = get_object_or_404(self.get_queryset().select_for_update(), pk=pk)
        approval.invoice = Invoice.objects.select_for_update().get(pk=approval.invoice_id)
        if approval.approver_id != request.user.id and request.user.role != "ADMIN":
            return Response({"detail": "You are not assigned this approval."}, status=403)
        if approval.status not in ("PENDING", "ESCALATED"):
            return Response({"detail": "Approval is already decided."}, status=400)
        if approval.invoice.status != Invoice.Status.PENDING_APPROVAL:
            return Response({"detail": "This invoice is no longer awaiting approval."}, status=400)
        earlier_pending = Approval.objects.filter(
            invoice=approval.invoice, status__in=["PENDING", "ESCALATED"],
            sequence__lt=approval.sequence,
        ).exists()
        parallel_sequence = not Approval.objects.filter(
            invoice=approval.invoice, sequence=approval.sequence, rule__parallel=False,
        ).exists()
        if not parallel_sequence:
            earlier_pending = earlier_pending or Approval.objects.filter(
                invoice=approval.invoice, sequence=approval.sequence,
                status__in=["PENDING", "ESCALATED"], pk__lt=approval.pk,
            ).exists()
        if earlier_pending:
            return Response({"detail": "Complete the earlier approval step first."}, status=400)
        approval.status = "APPROVED"
        comments = request.data.get("comments", "")
        if not isinstance(comments, str):
            return Response({"comments": ["Comments must be text."]}, status=400)
        approval.comments = comments[:2000]
        approval.decided_at = timezone.now()
        approval.save()
        notify_current_approval_step(approval.invoice)
        pending = Approval.objects.filter(invoice=approval.invoice, status__in=["PENDING", "ESCALATED"]).exists()
        if not pending:
            approval.invoice.status = "APPROVED"
            approval.invoice.approval_completed_at = timezone.now()
            approval.invoice.save(update_fields=["status", "approval_completed_at", "updated_at"])
        audit(request.user, "approval.approved", approval.invoice, {"sequence": approval.sequence})
        return Response(ApprovalSerializer(approval).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def reject(self, request, pk=None):
        approval = get_object_or_404(self.get_queryset().select_for_update(), pk=pk)
        approval.invoice = Invoice.objects.select_for_update().get(pk=approval.invoice_id)
        if approval.approver_id != request.user.id and request.user.role != "ADMIN":
            return Response({"detail": "You are not assigned this approval."}, status=403)
        if approval.status not in ("PENDING", "ESCALATED"):
            return Response({"detail": "Approval is already decided."}, status=400)
        if approval.invoice.status != Invoice.Status.PENDING_APPROVAL:
            return Response({"detail": "This invoice is no longer awaiting approval."}, status=400)
        reason = request.data.get("comments", "")
        if not isinstance(reason, str) or len(reason.strip()) < 2:
            return Response({"comments": ["A rejection reason of at least two characters is required."]}, status=400)
        earlier_pending = Approval.objects.filter(
            invoice=approval.invoice, status__in=["PENDING", "ESCALATED"],
            sequence__lt=approval.sequence,
        ).exists()
        parallel_sequence = not Approval.objects.filter(
            invoice=approval.invoice, sequence=approval.sequence, rule__parallel=False,
        ).exists()
        if not parallel_sequence:
            earlier_pending = earlier_pending or Approval.objects.filter(
                invoice=approval.invoice, sequence=approval.sequence,
                status__in=["PENDING", "ESCALATED"], pk__lt=approval.pk,
            ).exists()
        if earlier_pending:
            return Response({"detail": "Complete the earlier approval step first."}, status=400)
        approval.status = "REJECTED"
        approval.comments = reason.strip()[:2000]
        approval.decided_at = timezone.now()
        approval.save()
        approval.invoice.status = "REJECTED"
        approval.invoice.save(update_fields=["status", "updated_at"])
        APNotification.objects.create(
            recipient=approval.invoice.created_by,
            title="Invoice approval rejected",
            message=f"Invoice {approval.invoice.invoice_number} was rejected: {approval.comments}",
            entity_type="Invoice", entity_id=approval.invoice_id,
        )
        audit(request.user, "approval.rejected", approval.invoice, {"reason": approval.comments})
        return Response(ApprovalSerializer(approval).data)

    @action(detail=False, methods=["post"], url_path="escalate-overdue")
    def escalate_overdue(self, request):
        if request.user.role != "ADMIN":
            return Response({"detail": "Only administrators can process overdue approvals."}, status=403)
        return Response(process_approval_deadlines(request.user))

class PaymentViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Payment.objects.select_related("invoice", "invoice__vendor").all().order_by("-requested_at")
    serializer_class = PaymentSerializer
    filter_backends = [SearchFilter]
    search_fields = ["reference", "bank_reference", "invoice__invoice_number", "status"]

    @action(detail=False, methods=["post"])
    @transaction.atomic
    def generate(self, request):
        invoice_id = request.data.get("invoice")
        invoice = Invoice.objects.select_for_update().select_related("vendor").filter(pk=invoice_id).first()
        if not invoice or invoice.status != "APPROVED":
            return Response({"detail": "Invoice must be approved before payment."}, status=400)
        if hasattr(invoice, "payment"):
            return Response(PaymentSerializer(invoice.payment).data)
        payment_method = request.data.get("payment_method")
        valid_methods = {choice[0] for choice in Payment._meta.get_field("payment_method").choices}
        if payment_method not in valid_methods:
            return Response({"payment_method": ["Select a valid payment method."]}, status=400)
        payment = Payment.objects.create(
            invoice=invoice, reference=f"PAY-{timezone.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:8].upper()}",
            amount=invoice.total_amount,
            payment_method=payment_method,
            advice=f"PAYMENT ADVICE\nInvoice: {invoice.invoice_number}\nVendor: {invoice.vendor.name}\nAmount: {invoice.total_amount}\n",
        )
        PaymentStatusEvent.objects.create(payment=payment, new_status=payment.status, note="Payment request generated.", changed_by=request.user)
        audit(request.user, "payment.requested", payment)
        return Response(PaymentSerializer(payment).data, status=201)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def mark_paid(self, request, pk=None):
        payment = get_object_or_404(self.get_queryset().select_for_update(), pk=pk)
        if payment.status not in (Payment.Status.REQUESTED, Payment.Status.SCHEDULED, Payment.Status.PROCESSING):
            return Response({"detail": "Only an unpaid payment can be marked as paid."}, status=400)
        bank_reference = request.data.get("bank_reference", "")
        if not isinstance(bank_reference, str) or not bank_reference.strip() or len(bank_reference.strip()) > 100:
            return Response({"bank_reference": ["Enter a bank reference of 1 to 100 characters."]}, status=400)
        previous = payment.status
        payment.status = "PAID"
        payment.bank_reference = bank_reference.strip()
        payment.processed_at = timezone.now()
        payment.save()
        PaymentStatusEvent.objects.create(payment=payment, previous_status=previous, new_status=payment.status, note="Manually recorded; provider settlement is not verified by this action.", changed_by=request.user)
        payment.invoice.status = "PAID"
        payment.invoice.save(update_fields=["status", "updated_at"])
        audit(request.user, "payment.paid", payment)
        return Response(PaymentSerializer(payment).data)

    @action(detail=True, methods=["post"], url_path="mark-failed")
    @transaction.atomic
    def mark_failed(self, request, pk=None):
        payment = get_object_or_404(self.get_queryset().select_for_update(), pk=pk)
        if payment.status not in (Payment.Status.REQUESTED, Payment.Status.SCHEDULED, Payment.Status.PROCESSING):
            return Response({"detail": "Only an unpaid payment can be marked as failed."}, status=400)
        reason = request.data.get("reason", "")
        if not isinstance(reason, str) or len(reason.strip()) < 2:
            return Response({"reason": ["Enter a failure reason of at least two characters."]}, status=400)
        previous = payment.status
        payment.status = Payment.Status.FAILED
        payment.processed_at = timezone.now()
        payment.save(update_fields=["status", "processed_at"])
        PaymentStatusEvent.objects.create(payment=payment, previous_status=previous, new_status=payment.status, note=reason.strip()[:500], changed_by=request.user)
        audit(request.user, "payment.failed", payment, {"reason": reason.strip()[:500]})
        return Response(PaymentSerializer(payment).data)

    @action(detail=True, methods=["post"], url_path="submit-bank")
    @transaction.atomic
    def submit_bank(self, request, pk=None):
        payment = get_object_or_404(self.get_queryset().select_for_update(), pk=pk)
        if payment.status not in ("REQUESTED", "SCHEDULED"):
            return Response({"detail": "Only requested or scheduled payments can be submitted to the bank."}, status=400)
        from .integrations import IntegrationNotConfigured, IntegrationRequestFailed, send_integration_payload
        try:
            response_status, summary = send_integration_payload(
                "BANK", "Payment", payment.pk,
                {
                    "reference": payment.reference,
                    "amount": payment.amount,
                    "currency": "INR",
                    "vendor": payment.invoice.vendor.name,
                    "bank_account": payment.invoice.vendor.bank_account,
                    "ifsc": payment.invoice.vendor.ifsc,
                    "advice": payment.advice,
                },
                request.user, payment.reference,
            )
        except IntegrationNotConfigured as exc:
            return Response({"detail": str(exc)}, status=503)
        except IntegrationRequestFailed as exc:
            return Response({"detail": str(exc)}, status=502)
        previous = payment.status
        payment.status = Payment.Status.PROCESSING
        payment.save(update_fields=["status"])
        PaymentStatusEvent.objects.create(payment=payment, previous_status=previous, new_status=payment.status, note="Provider accepted submission; settlement is not confirmed.", changed_by=request.user)
        audit(request.user, "payment.submitted_to_bank", payment, {"http_status": response_status})
        return Response({"status": payment.status, "provider_response": summary})

class VendorOnboardingViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = VendorOnboarding.objects.select_related("vendor", "submitted_by", "decided_by").all()
    serializer_class = VendorOnboardingSerializer
    permission_classes = [APRolePermission]

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.request.user.role == User.Roles.AP_CLERK:
            queryset = queryset.filter(submitted_by=self.request.user)
        return queryset

class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = APNotificationSerializer
    permission_classes = [IsAuthenticated]
    def get_queryset(self):
        return APNotification.objects.filter(recipient=self.request.user)

    @action(detail=True, methods=["post"])
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        if notification.read_at is None:
            notification.read_at = timezone.now()
            notification.save(update_fields=["read_at"])
        return Response(APNotificationSerializer(notification).data)

class IntegrationDeliveryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = IntegrationDelivery.objects.select_related("attempted_by").all()
    serializer_class = IntegrationDeliverySerializer
    permission_classes = [APRolePermission]
    def get_queryset(self):
        if self.request.user.role == "ADMIN":
            return self.queryset
        return self.queryset.none()

class InboundEmailViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = InboundEmail.objects.all().order_by("-received_at")
    serializer_class = InboundEmailSerializer
    permission_classes = [APRolePermission]

@api_view(["GET"])
def integration_status(request):
    import os
    return Response({
        "erp": {"configured": bool(os.getenv("ERP_API_URL") and os.getenv("ERP_API_TOKEN"))},
        "bank": {"configured": bool(os.getenv("BANK_API_URL") and os.getenv("BANK_API_TOKEN"))},
        "email": {"configured": bool(os.getenv("IMAP_HOST") and os.getenv("IMAP_USER") and os.getenv("IMAP_PASSWORD"))},
        "gst": {"configured": bool(os.getenv("GST_VALIDATION_URL") and os.getenv("GST_VALIDATION_TOKEN"))},
    })

class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.select_related("actor").all().order_by("-timestamp")
    serializer_class = AuditLogSerializer
    permission_classes = [APRolePermission]

@api_view(["GET"])
def dashboard(request):
    now = timezone.localdate()
    invoices = Invoice.objects.all()
    outstanding = invoices.filter(status__in=[Invoice.Status.PENDING_APPROVAL, Invoice.Status.APPROVED, Invoice.Status.MATCHED]).exclude(due_date__isnull=True)
    buckets = [(label, outstanding.filter(**filters)) for label, filters in aging_bucket_filters(now)]
    turnaround_values = [
        (i.approval_completed_at-i.created_at).total_seconds()/3600
        for i in invoices.filter(approval_completed_at__isnull=False).only("created_at", "approval_completed_at")
        if i.approval_completed_at >= i.created_at
    ]
    turnaround = round(sum(turnaround_values)/len(turnaround_values), 1) if turnaround_values else 0
    vendor_analytics = list(invoices.values("vendor__name").annotate(total=Sum("total_amount"), count=Count("id")).order_by("-total")[:10])
    verification_counts = InvoiceFieldVerification.objects.aggregate(
        total=Count("id"), correct=Count("id", filter=Q(suggestion_correct=True)),
    )
    verified_accuracy = round(100 * verification_counts["correct"] / verification_counts["total"], 2) if verification_counts["total"] else 0
    return Response({
        "invoice_status": list(invoices.values("status").annotate(count=Count("id"))),
        "aging": [
            {"bucket": label, "amount": totals["amount"] or 0, "count": totals["count"]}
            for label, totals in (
                (label, query.aggregate(amount=Sum("total_amount"), count=Count("id"))) for label, query in buckets
            )
        ],
        "pending_approvals": Approval.objects.filter(status__in=[Approval.Status.PENDING, Approval.Status.ESCALATED]).count(),
        "processing_turnaround_hours": turnaround,
        # Share of human-reviewed fields where the extraction suggestion was correct.
        # Not Tesseract word confidence (that is reported per invoice, never as accuracy).
        "verified_extraction_accuracy": verified_accuracy,
        "verified_extraction_field_count": verification_counts["total"],
        "vendor_analytics": vendor_analytics,
        "payment_status": list(Payment.objects.values("status").annotate(count=Count("id"), amount=Sum("amount"))),
        "exceptions_count": invoices.filter(status=Invoice.Status.EXCEPTION).count(),
    })


def csv_cell(value):
    value = "" if value is None else str(value)
    if value[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + value
    return value

@api_view(["GET"])
def reports(request):
    if request.user.role not in (User.Roles.ADMIN, User.Roles.ACCOUNTANT, User.Roles.AUDITOR):
        return Response({"detail": "Your role cannot access financial reports."}, status=403)
    kind = request.GET.get("kind", "invoice-status")
    if kind not in {"aging", "invoice-status", "exceptions", "gst", "audit"}:
        return Response({"detail": "Unknown report type."}, status=400)
    if kind == "audit" and request.user.role not in (User.Roles.ADMIN, User.Roles.AUDITOR):
        return Response({"detail": "Only administrators and auditors can export audit logs."}, status=403)
    try:
        date_from = date.fromisoformat(request.GET["date_from"]) if request.GET.get("date_from") else None
        date_to = date.fromisoformat(request.GET["date_to"]) if request.GET.get("date_to") else None
    except ValueError:
        return Response({"detail": "Dates must use YYYY-MM-DD format."}, status=400)
    if date_from and date_to and date_from > date_to:
        return Response({"detail": "date_from cannot be after date_to."}, status=400)
    invoices = Invoice.objects.select_related("vendor").all()
    if request.GET.get("vendor"):
        if not Vendor.objects.filter(pk=request.GET["vendor"]).exists():
            return Response({"vendor": ["Select a valid vendor."]}, status=400)
        invoices = invoices.filter(vendor_id=request.GET["vendor"])
    if request.GET.get("status"):
        valid_statuses = {value for value, _label in Invoice.Status.choices}
        if request.GET["status"] not in valid_statuses:
            return Response({"status": ["Select a valid invoice status."]}, status=400)
        invoices = invoices.filter(status=request.GET["status"])
    if date_from:
        invoices = invoices.filter(invoice_date__gte=date_from)
    if date_to:
        invoices = invoices.filter(invoice_date__lte=date_to)
    if request.GET.get("search"):
        term = request.GET["search"].strip()[:100]
        invoices = invoices.filter(Q(invoice_number__icontains=term) | Q(vendor__name__icontains=term))
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="{kind}.csv"'
    writer = csv.writer(response)
    if kind == "audit":
        writer.writerow(["Timestamp", "Actor", "Action", "Entity Type", "Entity ID", "Details"])
        audit_rows = AuditLog.objects.select_related("actor").order_by("-timestamp")
        if date_from:
            audit_rows = audit_rows.filter(timestamp__date__gte=date_from)
        if date_to:
            audit_rows = audit_rows.filter(timestamp__date__lte=date_to)
        for entry in audit_rows.iterator():
            writer.writerow([
                csv_cell(timezone.localtime(entry.timestamp)),
                csv_cell(entry.actor.username if entry.actor else ""),
                csv_cell(entry.action),
                csv_cell(entry.entity_type),
                entry.entity_id,
                csv_cell(json.dumps(entry.details, sort_keys=True)),
            ])
    elif kind == "aging":
        writer.writerow(["Vendor", "Invoice", "Due Date", "Amount", "Days Overdue", "Days Until Due"])
        for i in invoices.filter(status__in=[Invoice.Status.PENDING_APPROVAL, Invoice.Status.APPROVED, Invoice.Status.MATCHED]).exclude(due_date__isnull=True).iterator():
            delta = (timezone.localdate()-i.due_date).days
            writer.writerow([csv_cell(i.vendor.name), csv_cell(i.invoice_number), i.due_date, i.total_amount, max(0, delta), max(0, -delta)])
    elif kind == "exceptions":
        writer.writerow(["Vendor", "Invoice", "Status", "Exceptions"])
        for i in invoices.exclude(exceptions=[]).iterator():
            writer.writerow([csv_cell(i.vendor.name), csv_cell(i.invoice_number), i.status, csv_cell("; ".join(i.exceptions))])
    elif kind == "gst":
        writer.writerow(["Vendor", "GSTIN", "Invoice", "Tax Amount"])
        for i in invoices.iterator():
            writer.writerow([csv_cell(i.vendor.name), csv_cell(i.vendor.gstin), csv_cell(i.invoice_number), i.tax_amount])
    else:
        writer.writerow(["Vendor", "Invoice", "Date", "Due Date", "Amount", "Status"])
        for i in invoices.iterator():
            writer.writerow([csv_cell(i.vendor.name), csv_cell(i.invoice_number), i.invoice_date, i.due_date, i.total_amount, i.status])
    return response

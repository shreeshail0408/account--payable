"""Regression tests for the bugs behind the previously failing tests in tests.py."""
from decimal import Decimal
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import Invoice, Payment, User, Vendor
from .services import capture_invoice_upload


OCR_TEXT = (
    "Invoice No: DEC-001\nInvoice Date: 01/11/2026\nDue Date: 30/11/2026\n"
    "Subtotal: 100.00\nTax Amount: 18.00\nGrand Total: 118.00\n"
    "Description Qty Rate Amount\n1 Paper 2 50.00 100.00"
)


class OcrSuggestionStorageTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user("store-admin", password="StrongPass123!", role="ADMIN")
        self.vendor = Vendor.objects.create(code="V-DEC", name="Decimal Vendor", email="d@example.test", status="ACTIVE")

    @patch("ap_app.services.extract_ocr", return_value=(OCR_TEXT, 90.0))
    def test_decimal_suggestions_are_persisted_and_read_back(self, _ocr):
        upload = SimpleUploadedFile("dec.png", b"decimal-test", content_type="image/png")
        invoice = capture_invoice_upload(upload, self.vendor, self.admin)
        stored = Invoice.objects.get(pk=invoice.pk).ocr_suggestions
        self.assertEqual(Decimal(stored["total_amount"]), Decimal("118.00"))
        self.assertEqual(Decimal(stored["line_items"][0]["amount"]), Decimal("100.00"))

    @patch("ap_app.services.extract_ocr", return_value=(OCR_TEXT, 90.0))
    def test_extraction_review_compares_stored_string_amounts_correctly(self, _ocr):
        upload = SimpleUploadedFile("dec-review.png", b"decimal-review", content_type="image/png")
        invoice = capture_invoice_upload(upload, self.vendor, self.admin)
        self.client.force_authenticate(self.admin)
        response = self.client.post(f"/api/invoices/{invoice.pk}/review-extraction/", {"confirmed": True}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        by_field = {row["field_name"]: row for row in response.data["verified_fields"]}
        self.assertTrue(by_field["total_amount"]["suggestion_correct"])
        self.assertTrue(by_field["subtotal"]["suggestion_correct"])


class ExtractionReviewConfirmationTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user("review-admin", password="StrongPass123!", role="ADMIN")
        self.client.force_authenticate(self.admin)
        vendor = Vendor.objects.create(code="V-REV", name="Review Vendor", email="r@example.test", status="ACTIVE")
        self.invoice = Invoice.objects.create(
            invoice_number="REV-1", vendor=vendor, invoice_date=timezone.localdate(), due_date=timezone.localdate(),
            subtotal=Decimal("100"), tax_amount=Decimal("0"), total_amount=Decimal("100"),
            file="invoices/test.png", created_by=self.admin,
        )
        self.url = f"/api/invoices/{self.invoice.pk}/review-extraction/"

    def test_confirmation_is_accepted_from_json_and_form_data(self):
        for fmt, value in (("json", True), ("multipart", True), ("multipart", "true")):
            with self.subTest(format=fmt, value=value):
                response = self.client.post(self.url, {"confirmed": value}, format=fmt)
                self.assertEqual(response.status_code, 200, response.data)

    def test_missing_false_or_garbage_confirmation_is_still_rejected(self):
        cases = (
            ("json", {}), ("json", {"confirmed": False}), ("json", {"confirmed": "maybe"}),
            ("multipart", {}), ("multipart", {"confirmed": "false"}), ("multipart", {"confirmed": "maybe"}),
        )
        for fmt, payload in cases:
            with self.subTest(format=fmt, payload=payload):
                response = self.client.post(self.url, payload, format=fmt)
                self.assertEqual(response.status_code, 400)
        self.invoice.refresh_from_db()
        self.assertIsNone(self.invoice.extraction_reviewed_at)


class DuplicateInvoiceMessageTests(APITestCase):
    @patch("ap_app.views.extract_ocr", return_value=("invoice", 90.0))
    def test_duplicate_is_reported_on_the_invoice_number_field(self, _ocr):
        admin = User.objects.create_user("dup-admin", password="StrongPass123!", role="ADMIN")
        self.client.force_authenticate(admin)
        vendor = Vendor.objects.create(code="V-DUP", name="Dup Vendor", email="dup@example.test", status="ACTIVE")
        payload = {
            "invoice_number": "DUP-1", "vendor": vendor.id,
            "invoice_date": str(timezone.localdate()), "due_date": str(timezone.localdate()),
            "subtotal": "100", "tax_amount": "0", "total_amount": "100",
        }
        first = self.client.post("/api/invoices/", {**payload, "file": SimpleUploadedFile("a.png", b"a", content_type="image/png")}, format="multipart")
        self.assertEqual(first.status_code, 201, first.data)
        again = self.client.post("/api/invoices/", {**payload, "file": SimpleUploadedFile("b.png", b"b", content_type="image/png")}, format="multipart")
        self.assertEqual(again.status_code, 400)
        self.assertEqual(again.data["invoice_number"], ["This invoice number already exists for this vendor."])
        self.assertNotIn("non_field_errors", again.data)
        self.assertEqual(Invoice.objects.filter(vendor=vendor, invoice_number="DUP-1").count(), 1)

    @patch("ap_app.views.extract_ocr", return_value=("invoice", 90.0))
    def test_same_number_for_a_different_vendor_is_allowed(self, _ocr):
        admin = User.objects.create_user("dup-admin-2", password="StrongPass123!", role="ADMIN")
        self.client.force_authenticate(admin)
        for code in ("V-A", "V-B"):
            vendor = Vendor.objects.create(code=code, name=code, email=f"{code}@example.test", status="ACTIVE")
            response = self.client.post("/api/invoices/", {
                "invoice_number": "SHARED-1", "vendor": vendor.id,
                "invoice_date": str(timezone.localdate()), "due_date": str(timezone.localdate()),
                "subtotal": "100", "tax_amount": "0", "total_amount": "100",
                "file": SimpleUploadedFile(f"{code}.png", code.encode(), content_type="image/png"),
            }, format="multipart")
            self.assertEqual(response.status_code, 201, response.data)


class PaymentPermissionTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user("pay-admin", password="StrongPass123!", role="ADMIN")
        vendor = Vendor.objects.create(code="V-PAY", name="Pay Vendor", email="p@example.test", status="ACTIVE")
        invoice = Invoice.objects.create(
            invoice_number="PAY-1", vendor=vendor, invoice_date=timezone.localdate(), due_date=timezone.localdate(),
            subtotal=Decimal("100"), tax_amount=Decimal("0"), total_amount=Decimal("100"),
            status=Invoice.Status.APPROVED, file="invoices/test.png", created_by=self.admin,
        )
        self.invoice = invoice
        self.payment = Payment.objects.create(invoice=invoice, reference="PAY-REF-1", amount=invoice.total_amount)
        self.users = {
            role: User.objects.create_user(f"pay-{role.lower()}", password="StrongPass123!", role=role)
            for role in ("AP_CLERK", "APPROVER", "ACCOUNTANT", "AUDITOR")
        }

    def write_actions(self):
        pid = self.payment.pk
        return [
            ("generate", "/api/payments/generate/", {"invoice": self.invoice.pk, "payment_method": "BANK_TRANSFER"}),
            ("mark_paid", f"/api/payments/{pid}/mark_paid/", {"bank_reference": "UTR123"}),
            ("mark_failed", f"/api/payments/{pid}/mark-failed/", {"reason": "Bank rejected"}),
            ("submit_bank", f"/api/payments/{pid}/submit-bank/", {}),
        ]

    def test_non_payment_roles_get_403_even_with_valid_payloads(self):
        for role in ("AP_CLERK", "APPROVER", "AUDITOR"):
            self.client.force_authenticate(self.users[role])
            for name, url, payload in self.write_actions():
                with self.subTest(role=role, action=name):
                    self.assertEqual(self.client.post(url, payload, format="json").status_code, 403)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.REQUESTED)

    def test_payment_reads_are_limited_to_accountant_auditor_and_admin(self):
        for role, expected in (("AP_CLERK", 403), ("APPROVER", 403), ("ACCOUNTANT", 200), ("AUDITOR", 200)):
            with self.subTest(role=role):
                self.client.force_authenticate(self.users[role])
                self.assertEqual(self.client.get("/api/payments/").status_code, expected)

    def test_accountant_can_still_record_payment(self):
        self.client.force_authenticate(self.users["ACCOUNTANT"])
        missing = self.client.post(f"/api/payments/{self.payment.pk}/mark_paid/", {}, format="json")
        self.assertEqual(missing.status_code, 400)
        paid = self.client.post(f"/api/payments/{self.payment.pk}/mark_paid/", {"bank_reference": "UTR123"}, format="json")
        self.assertEqual(paid.status_code, 200, paid.data)
        self.assertEqual(paid.data["status"], "PAID")

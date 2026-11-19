"""Tests for the REQUIREMENT_GAP_ANALYSIS.md section 6 fixes."""
import json
from datetime import timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from ap_backend.security import InsecureSettingsError, check_secret_key

from .models import AuditLog, Invoice, InvoiceLine, POLine, PurchaseOrder, User, Vendor
from .serializers import mask_last4
from .services import aging_bucket_filters, enrich_invoice_fields_with_local_model, validate_and_match


ACCOUNT = "123456789012"
IFSC = "ABCD0123456"


class VendorBankMaskingTests(APITestCase):
    def setUp(self):
        self.vendor = Vendor.objects.create(
            code="V-BANK", name="Bank Vendor", email="bank@example.test", status="ACTIVE",
            bank_name="Example Bank", bank_account=ACCOUNT, ifsc=IFSC,
        )
        self.users = {
            role: User.objects.create_user(f"user-{role.lower()}", password="StrongPass123!", role=role)
            for role in ("ADMIN", "AP_CLERK", "APPROVER", "ACCOUNTANT", "AUDITOR")
        }

    def test_mask_last4(self):
        self.assertEqual(mask_last4(ACCOUNT), "••••••••9012")
        self.assertEqual(mask_last4(IFSC), "•••••••3456")
        self.assertEqual(mask_last4("123"), "123")
        self.assertEqual(mask_last4(""), "")
        self.assertEqual(mask_last4(None), "")

    def test_general_vendor_responses_are_masked_for_every_role(self):
        for role in ("ADMIN", "AP_CLERK", "ACCOUNTANT", "AUDITOR"):
            with self.subTest(role=role):
                self.client.force_authenticate(self.users[role])
                listed = self.client.get("/api/vendors/")
                detail = self.client.get(f"/api/vendors/{self.vendor.id}/")
                self.assertEqual(listed.status_code, 200)
                self.assertEqual(detail.status_code, 200)
                for payload in (str(listed.data), str(detail.data)):
                    self.assertNotIn(ACCOUNT, payload)
                    self.assertNotIn(IFSC, payload)
                self.assertEqual(detail.data["bank_account"], "••••••••9012")
                self.assertEqual(detail.data["ifsc"], "•••••••3456")

    def test_admin_and_accountant_get_full_details_and_view_is_audited(self):
        for role in ("ADMIN", "ACCOUNTANT"):
            with self.subTest(role=role):
                self.client.force_authenticate(self.users[role])
                before = AuditLog.objects.filter(action="vendor.bank_details_viewed").count()
                response = self.client.get(f"/api/vendors/{self.vendor.id}/full-bank-details/")
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(response.data["bank_account"], ACCOUNT)
                self.assertEqual(response.data["ifsc"], IFSC)
                log = AuditLog.objects.filter(action="vendor.bank_details_viewed").order_by("-id").first()
                self.assertEqual(AuditLog.objects.filter(action="vendor.bank_details_viewed").count(), before + 1)
                self.assertEqual(log.actor, self.users[role])
                self.assertEqual(log.entity_id, self.vendor.id)
                self.assertNotIn(ACCOUNT, json.dumps(log.details))

    def test_other_roles_cannot_get_full_details_and_nothing_is_audited(self):
        for role in ("AP_CLERK", "APPROVER", "AUDITOR"):
            with self.subTest(role=role):
                self.client.force_authenticate(self.users[role])
                response = self.client.get(f"/api/vendors/{self.vendor.id}/full-bank-details/")
                self.assertEqual(response.status_code, 403)
                self.assertNotIn(ACCOUNT, str(response.data))
        self.assertFalse(AuditLog.objects.filter(action="vendor.bank_details_viewed").exists())


class DashboardAgingTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user("aging-admin", password="StrongPass123!", role="ADMIN")
        self.client.force_authenticate(self.admin)
        self.vendor = Vendor.objects.create(code="V-AGE", name="Aging Vendor", email="a@example.test", status="ACTIVE")
        self.today = timezone.localdate()

    def make_invoice(self, days_overdue, amount, status=Invoice.Status.APPROVED):
        return Invoice.objects.create(
            invoice_number=f"AGE-{days_overdue}-{amount}", vendor=self.vendor,
            invoice_date=self.today - timedelta(days=max(days_overdue, 0) + 1),
            due_date=self.today - timedelta(days=days_overdue),
            subtotal=Decimal(amount), tax_amount=Decimal("0"), total_amount=Decimal(amount),
            status=status, file="invoices/test.png", created_by=self.admin,
        )

    def aging(self):
        response = self.client.get("/api/dashboard/")
        self.assertEqual(response.status_code, 200)
        return {row["bucket"]: row for row in response.data["aging"]}

    def test_bucket_labels_and_order(self):
        response = self.client.get("/api/dashboard/")
        self.assertEqual(
            [row["bucket"] for row in response.data["aging"]],
            ["Not yet due", "0-30", "31-60", "61-90", "90+"],
        )

    def test_boundary_days_overdue(self):
        expected = {
            -1: "Not yet due", -45: "Not yet due",
            0: "0-30", 30: "0-30",
            31: "31-60", 60: "31-60",
            61: "61-90", 90: "61-90",
            91: "90+", 400: "90+",
        }
        for days in expected:
            # Unique amount per case so every invoice can be traced to its bucket.
            self.make_invoice(days, 1000 + days)
        buckets = self.aging()
        for days, label in expected.items():
            with self.subTest(days_overdue=days):
                in_bucket = [
                    name for name, filters in aging_bucket_filters(self.today)
                    if Invoice.objects.filter(invoice_number=f"AGE-{days}-{1000 + days}", **filters).exists()
                ]
                self.assertEqual(in_bucket, [label])
        sums = {label: Decimal("0") for label in buckets}
        for days, label in expected.items():
            sums[label] += Decimal(1000 + days)
        for label, row in buckets.items():
            self.assertEqual(Decimal(str(row["amount"])), sums[label], label)
        self.assertEqual(buckets["0-30"]["count"], 2)
        self.assertEqual(buckets["Not yet due"]["count"], 2)

    def test_future_due_invoice_is_not_in_0_30(self):
        self.make_invoice(-10, 500)
        buckets = self.aging()
        self.assertEqual(Decimal(str(buckets["Not yet due"]["amount"])), Decimal("500"))
        self.assertEqual(Decimal(str(buckets["0-30"]["amount"])), Decimal("0"))

    def test_only_outstanding_statuses_are_aged(self):
        self.make_invoice(5, 700, status=Invoice.Status.PAID)
        self.make_invoice(5, 300, status=Invoice.Status.MATCHED)
        buckets = self.aging()
        self.assertEqual(Decimal(str(buckets["0-30"]["amount"])), Decimal("300"))


class DashboardFieldNamingTests(APITestCase):
    def test_extraction_accuracy_uses_new_key_and_keeps_deprecated_alias(self):
        admin = User.objects.create_user("naming-admin", password="StrongPass123!", role="ADMIN")
        self.client.force_authenticate(admin)
        data = self.client.get("/api/dashboard/").data
        self.assertIn("verified_extraction_accuracy", data)
        self.assertIn("verified_extraction_field_count", data)
        self.assertEqual(data["verified_extraction_accuracy"], data["ocr_accuracy"])
        self.assertEqual(data["verified_extraction_field_count"], data["ocr_verified_field_count"])
        self.assertFalse(any("confidence" in key for key in data))


class TwoWayLineMatchingTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("match-clerk", password="StrongPass123!", role="AP_CLERK")
        self.vendor = Vendor.objects.create(code="V-MATCH", name="Match Vendor", email="m@example.test", status="ACTIVE")
        self.po = PurchaseOrder.objects.create(
            number="PO-2WAY", vendor=self.vendor, order_date=timezone.localdate(), total_amount=Decimal("10000.00"),
        )
        self.po_line = POLine.objects.create(
            purchase_order=self.po, description="Paper", quantity=Decimal("10"), unit_price=Decimal("100.00"),
        )

    def match(self, quantity, unit_price, amount=None):
        quantity, unit_price = Decimal(quantity), Decimal(unit_price)
        amount = Decimal(amount) if amount is not None else (quantity * unit_price).quantize(Decimal("0.01"))
        invoice = Invoice.objects.create(
            invoice_number=f"INV-{Invoice.objects.count() + 1}", vendor=self.vendor, purchase_order=self.po,
            invoice_date=timezone.localdate(), due_date=timezone.localdate(),
            subtotal=amount, tax_amount=Decimal("0"), total_amount=amount,
            match_type="2WAY", file="invoices/test.png", created_by=self.user,
        )
        InvoiceLine.objects.create(
            invoice=invoice, po_line=self.po_line, description="Paper",
            quantity=quantity, unit_price=unit_price, amount=amount,
        )
        errors = validate_and_match(invoice)
        invoice.refresh_from_db()
        return invoice, errors

    def test_exact_match_passes(self):
        invoice, errors = self.match("10", "100.00")
        self.assertEqual(errors, [])
        self.assertEqual(invoice.status, "MATCHED")

    def test_unit_price_within_default_1_percent_passes(self):
        _invoice, errors = self.match("10", "101.00")
        self.assertEqual(errors, [])

    def test_unit_price_beyond_1_percent_is_readable_exception(self):
        invoice, errors = self.match("10", "101.50")
        self.assertEqual(invoice.status, "EXCEPTION")
        self.assertIn("Line 'Paper': unit price 101.50 differs from PO price 100.00 by 1.5% (tolerance 1%).", errors)

    def test_quantity_over_po_with_default_0_percent_is_readable_exception(self):
        _invoice, errors = self.match("11", "100.00")
        self.assertIn(
            "Line 'Paper': invoiced quantity 11 exceeds ordered quantity 10 for PO line 'Paper' (tolerance 0%).",
            errors,
        )

    def test_line_total_mismatch_is_readable_exception(self):
        _invoice, errors = self.match("5", "100.00", amount="600.00")
        self.assertIn(
            "Line 'Paper': line total 600.00 differs from expected 500.00 (5 x PO price 100.00) beyond tolerance of 1%.",
            errors,
        )

    def test_partial_quantity_under_po_passes(self):
        _invoice, errors = self.match("4", "100.00")
        self.assertEqual(errors, [])

    def test_previously_invoiced_quantity_counts_toward_limit(self):
        self.match("6", "100.00")
        _invoice, errors = self.match("5", "100.00")
        self.assertIn(
            "Line 'Paper': invoiced quantity 11, including 6 already invoiced, exceeds ordered quantity 10 "
            "for PO line 'Paper' (tolerance 0%).",
            errors,
        )

    @override_settings(PO_MATCH_QUANTITY_TOLERANCE_PERCENT="10", PO_MATCH_PRICE_TOLERANCE_PERCENT="5")
    def test_tolerances_are_configurable(self):
        _invoice, errors = self.match("11", "104.00")
        self.assertEqual(errors, [])
        _invoice, errors = self.match("1", "106.00")
        self.assertIn("Line 'Paper': unit price 106.00 differs from PO price 100.00 by 6% (tolerance 5%).", errors)


@override_settings(LOCAL_LLM_BASE_URL="http://127.0.0.1:11434/v1", LOCAL_LLM_MODEL="test-model")
class LocalModelNonObjectJsonTests(SimpleTestCase):
    def run_with_content(self, content):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps(
            {"choices": [{"message": {"content": content}}]}
        ).encode()
        fields = {"invoice_number": None, "total_amount": None, "line_items": []}
        with patch("ap_app.services.urlopen", return_value=response):
            return enrich_invoice_fields_with_local_model("OCR text", dict(fields)), fields

    def test_valid_json_that_is_not_an_object_leaves_fields_unchanged(self):
        for content in ('["INV-1", 100]', '"INV-1"', "42", "true", "null"):
            with self.subTest(content=content):
                result, original = self.run_with_content(content)
                self.assertEqual(result, original)

    def test_non_object_response_envelope_is_handled(self):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = b'["not", "an", "object"]'
        fields = {"invoice_number": None, "line_items": []}
        with patch("ap_app.services.urlopen", return_value=response):
            self.assertEqual(enrich_invoice_fields_with_local_model("OCR text", dict(fields)), fields)

    def test_object_with_non_list_line_items_is_ignored(self):
        result, _ = self.run_with_content(json.dumps({"invoice_number": "INV-77", "line_items": {"bad": 1}}))
        self.assertEqual(result["invoice_number"], "INV-77")
        self.assertEqual(result["line_items"], [])


class SecretKeyStartupCheckTests(SimpleTestCase):
    def test_refuses_dev_keys_when_debug_is_false(self):
        for key in ("", "   ", "replace-with-a-random-secret", "change-me", "django-insecure-abc123"):
            with self.subTest(key=key):
                with self.assertRaises(InsecureSettingsError):
                    check_secret_key(key, debug=False)

    def test_allows_dev_keys_when_debug_is_true(self):
        for key in ("", "replace-with-a-random-secret", "django-insecure-abc123"):
            check_secret_key(key, debug=True)

    def test_allows_unique_key_in_production(self):
        check_secret_key("k7Qn2v9X-unique-production-secret-0f3b8e1a5c", debug=False)

    def test_settings_module_refuses_to_load(self):
        import os
        import subprocess
        import sys
        from pathlib import Path

        backend_dir = Path(__file__).resolve().parent.parent
        env = {
            **os.environ,
            "DJANGO_DEBUG": "false",
            "DJANGO_SECRET_KEY": "replace-with-a-random-secret",
            "DJANGO_SETTINGS_MODULE": "ap_backend.settings",
        }
        result = subprocess.run(
            [sys.executable, "-c", "import django; django.setup()"],
            cwd=backend_dir, env=env, capture_output=True, text=True, timeout=60,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("InsecureSettingsError", result.stderr)

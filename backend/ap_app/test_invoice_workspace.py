"""Additive API for the rebuilt invoice workspace: activity drawer, match settings, field confidence."""
from decimal import Decimal

from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import (
    Approval, ApprovalRule, AuditLog, GoodsReceipt, GRNLine, Invoice, InvoiceLine, Payment,
    POLine, PurchaseOrder, User, Vendor,
)
from .services import OcrText, extract_invoice_fields

PASSWORD = "StrongPass123!"


class ActivityFixture(APITestCase):
    def setUp(self):
        today = timezone.localdate()
        self.users = {
            role: User.objects.create_user(f"act-{role.lower()}", password=PASSWORD, role=role)
            for role in ("ADMIN", "AP_CLERK", "APPROVER", "ACCOUNTANT", "AUDITOR")
        }
        self.other_approver = User.objects.create_user("act-approver-2", password=PASSWORD, role="APPROVER")
        self.vendor = Vendor.objects.create(code="V-ACT", name="Act Vendor", email="a@example.test", status="ACTIVE")
        self.po = PurchaseOrder.objects.create(number="PO-ACT", vendor=self.vendor, order_date=today, total_amount=Decimal("1000"))
        self.po_line = POLine.objects.create(
            purchase_order=self.po, description="Paper", quantity=Decimal("10"),
            unit_price=Decimal("50"), received_quantity=Decimal("4"),
        )
        grn = GoodsReceipt.objects.create(purchase_order=self.po, number="GRN-ACT", received_date=today, received_by=self.users["ADMIN"])
        GRNLine.objects.create(grn=grn, po_line=self.po_line, quantity=Decimal("4"))
        self.invoice = Invoice.objects.create(
            invoice_number="ACT-1", vendor=self.vendor, purchase_order=self.po, match_type="3WAY",
            invoice_date=today, due_date=today, subtotal=Decimal("250"), tax_amount=Decimal("0"),
            total_amount=Decimal("250"), status="APPROVED", file="invoices/test.png", created_by=self.users["ADMIN"],
        )
        InvoiceLine.objects.create(invoice=self.invoice, po_line=self.po_line, description="Paper",
                                   quantity=Decimal("5"), unit_price=Decimal("50"), amount=Decimal("250"))
        rule1 = ApprovalRule.objects.create(name="Manager", max_amount=Decimal("9999"), role=self.users["APPROVER"], sequence=1)
        rule2 = ApprovalRule.objects.create(name="Finance", max_amount=Decimal("9999"), role=self.other_approver, sequence=2, parallel=True)
        self.step1 = Approval.objects.create(invoice=self.invoice, approver=self.users["APPROVER"], rule=rule1, sequence=1, status="APPROVED")
        Approval.objects.create(invoice=self.invoice, approver=self.other_approver, rule=rule2, sequence=2, status="APPROVED")
        self.payment = Payment.objects.create(invoice=self.invoice, reference="PAY-ACT", amount=Decimal("250"))
        AuditLog.objects.create(actor=self.users["ADMIN"], action="invoice.created", entity_type="Invoice", entity_id=self.invoice.pk)
        AuditLog.objects.create(actor=self.users["APPROVER"], action="approval.approved", entity_type="Approval", entity_id=self.step1.pk)
        AuditLog.objects.create(actor=self.users["ACCOUNTANT"], action="payment.requested", entity_type="Payment", entity_id=self.payment.pk)
        AuditLog.objects.create(actor=self.users["ADMIN"], action="vendor.created", entity_type="Vendor", entity_id=self.vendor.pk)

    def activity(self, role, expected=200):
        self.client.force_authenticate(self.users[role])
        response = self.client.get(f"/api/invoices/{self.invoice.pk}/activity/")
        self.assertEqual(response.status_code, expected)
        return response.data


class InvoiceActivityTests(ActivityFixture):
    def test_admin_sees_every_section(self):
        data = self.activity("ADMIN")
        self.assertEqual(data["restricted"], [])
        self.assertEqual([step["sequence"] for step in data["approvals"]], [1, 2])
        self.assertEqual([step["parallel"] for step in data["approvals"]], [False, True])
        self.assertEqual(data["payment"]["reference"], "PAY-ACT")
        actions = sorted(event["action"] for event in data["audit"])
        self.assertEqual(actions, ["approval.approved", "invoice.created", "payment.requested"])

    def test_line_comparison_uses_received_quantity_for_three_way(self):
        line = self.activity("ADMIN")["lines"][0]
        self.assertEqual(line["po_line"]["description"], "Paper")
        self.assertEqual(line["quantity_basis"], "received")
        self.assertEqual([r["grn_number"] for r in line["receipts"]], ["GRN-ACT"])
        self.assertEqual(line["checks"], {"description": "ok", "unit_price": "ok", "quantity": "fail", "amount": "ok"})
        self.assertEqual(line["status"], "mismatch")

    def test_sections_follow_existing_read_rules(self):
        clerk = self.activity("AP_CLERK")
        self.assertIsNone(clerk["approvals"])
        self.assertIsNone(clerk["payment"])
        self.assertIsNone(clerk["audit"])
        self.assertEqual(clerk["restricted"], ["approvals", "payment", "audit"])
        accountant = self.activity("ACCOUNTANT")
        self.assertIsNotNone(accountant["payment"])
        self.assertIsNone(accountant["audit"])
        auditor = self.activity("AUDITOR")
        self.assertEqual(len(auditor["approvals"]), 2)
        self.assertIsNotNone(auditor["audit"])

    def test_approver_sees_only_own_steps(self):
        data = self.activity("APPROVER")
        self.assertEqual([step["id"] for step in data["approvals"]], [self.step1.pk])
        self.assertIn("other_approvals", data["restricted"])
        self.assertIsNone(data["payment"])

    def test_invoice_scoping_still_applies(self):
        self.invoice.status = "EXCEPTION"
        self.invoice.save()
        self.activity("ACCOUNTANT", expected=404)
        self.client.force_authenticate(self.other_approver)
        Approval.objects.filter(approver=self.other_approver).delete()
        response = self.client.get(f"/api/invoices/{self.invoice.pk}/activity/")
        self.assertEqual(response.status_code, 404)

    def test_unauthenticated_is_rejected(self):
        response = self.client.get(f"/api/invoices/{self.invoice.pk}/activity/")
        self.assertEqual(response.status_code, 401)


class MatchSettingsTests(ActivityFixture):
    @override_settings(PO_MATCH_PRICE_TOLERANCE_PERCENT="2.5")
    def test_returns_configured_tolerances(self):
        self.client.force_authenticate(self.users["AP_CLERK"])
        response = self.client.get("/api/invoices/match-settings/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["price_percent"], "2.5")
        self.assertEqual(response.data["quantity_percent"], "0")


class FieldConfidenceTests(APITestCase):
    TEXT = "[Page 1]\nInvoice No: INV-9\nGrand Total: 118.00\nPaper 2 50.00 100.00"

    def test_plain_text_has_no_field_confidence(self):
        self.assertNotIn("field_confidence", extract_invoice_fields(self.TEXT))

    def test_confidence_comes_from_the_source_line(self):
        text = OcrText(self.TEXT, [None, 95.0, 70.0, 40.0])
        fields = extract_invoice_fields(text)
        confidence = fields["field_confidence"]
        self.assertEqual(confidence["invoice_number"], {"score": 95.0, "level": "high", "source": "ocr"})
        self.assertEqual(confidence["total_amount"]["level"], "medium")
        self.assertEqual(confidence["line_items"], [{"score": 40.0, "level": "low", "source": "ocr"}])
        self.assertEqual(confidence["due_date"]["level"], "missing")
        self.assertEqual(str(text), self.TEXT)


class InvoiceListWorkspaceFilterTests(ActivityFixture):
    def setUp(self):
        super().setUp()
        from datetime import timedelta
        self.other_vendor = Vendor.objects.create(code="V-ACT2", name="Zeta Vendor", email="z@example.test", status="ACTIVE")
        today = timezone.localdate()
        for number, vendor, days, amount in (("W-1", self.vendor, -10, "10"), ("W-2", self.other_vendor, -3, "500"), ("W-3", self.other_vendor, 0, "90")):
            Invoice.objects.create(
                invoice_number=number, vendor=vendor, invoice_date=today + timedelta(days=days), due_date=today,
                subtotal=Decimal(amount), tax_amount=Decimal("0"), total_amount=Decimal(amount),
                status="CAPTURED", file="invoices/test.png", created_by=self.users["ADMIN"],
            )
        self.today = today
        self.client.force_authenticate(self.users["ADMIN"])

    def numbers(self, **params):
        response = self.client.get("/api/invoices/", params)
        self.assertEqual(response.status_code, 200, response.data)
        return [row["invoice_number"] for row in response.data["results"]]

    def test_vendor_filter(self):
        self.assertEqual(sorted(self.numbers(vendor=self.other_vendor.pk)), ["W-2", "W-3"])
        self.assertEqual(self.client.get("/api/invoices/", {"vendor": "abc"}).status_code, 400)

    def test_date_range_is_inclusive(self):
        from datetime import timedelta
        result = self.numbers(date_from=(self.today - timedelta(days=3)).isoformat(), date_to=self.today.isoformat())
        self.assertEqual(sorted(result), ["ACT-1", "W-2", "W-3"])
        self.assertEqual(self.client.get("/api/invoices/", {"date_to": "19-11-2026"}).status_code, 400)

    def test_ordering(self):
        self.assertEqual(self.numbers(ordering="-total_amount")[:2], ["W-2", "ACT-1"])
        self.assertIn(self.numbers(ordering="vendor__name")[0], {"ACT-1", "W-1"})
        self.assertEqual(set(self.numbers(ordering="-vendor__name")[:2]), {"W-2", "W-3"})
        # Default order (newest first) is unchanged without the param.
        self.assertEqual(self.numbers()[0], "W-3")

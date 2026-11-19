"""Additive read-only API extensions used by the migrated Vendors and Approvals pages."""
from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APITestCase

from .models import Approval, ApprovalRule, AuditLog, Invoice, User, Vendor, VendorOnboarding


class ApprovalInvoiceContextTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user("mig-admin", password="StrongPass123!", role="ADMIN")
        self.approver = User.objects.create_user("mig-approver", password="StrongPass123!", role="APPROVER")
        self.vendor = Vendor.objects.create(code="V-MIG", name="Migration Vendor", email="m@example.test", status="ACTIVE")
        rule = ApprovalRule.objects.create(name="Any", min_amount=0, max_amount=10000, role=self.approver)
        self.invoice = Invoice.objects.create(
            invoice_number="MIG-1", vendor=self.vendor,
            invoice_date=timezone.localdate(), due_date=timezone.localdate(),
            subtotal=Decimal("100"), tax_amount=Decimal("18"), total_amount=Decimal("118"),
            status=Invoice.Status.PENDING_APPROVAL, file="invoices/test.png", created_by=self.admin,
        )
        Approval.objects.create(invoice=self.invoice, approver=self.approver, rule=rule, due_at=timezone.now())

    def test_approval_rows_carry_invoice_context(self):
        self.client.force_authenticate(self.approver)
        response = self.client.get("/api/approvals/")
        self.assertEqual(response.status_code, 200)
        row = response.data["results"][0]
        # Existing fields are unchanged.
        self.assertEqual(row["invoice"], self.invoice.pk)
        self.assertEqual(row["invoice_number"], "MIG-1")
        self.assertEqual(row["status"], "PENDING")
        # Additive read-only context.
        self.assertEqual(row["vendor_name"], "Migration Vendor")
        self.assertEqual(row["invoice_total_amount"], "118.00")
        self.assertEqual(row["invoice_due_date"], str(timezone.localdate()))
        self.assertEqual(row["invoice_status"], "PENDING_APPROVAL")


class VendorTimelineFilterTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user("tl-admin", password="StrongPass123!", role="ADMIN")
        self.clerk = User.objects.create_user("tl-clerk", password="StrongPass123!", role="AP_CLERK")
        self.auditor = User.objects.create_user("tl-auditor", password="StrongPass123!", role="AUDITOR")
        self.first = Vendor.objects.create(code="V-TL1", name="First", email="1@example.test")
        self.second = Vendor.objects.create(code="V-TL2", name="Second", email="2@example.test")
        VendorOnboarding.objects.create(vendor=self.first, submitted_by=self.clerk)
        VendorOnboarding.objects.create(vendor=self.second, submitted_by=self.admin)
        AuditLog.objects.create(actor=self.admin, action="vendor.created", entity_type="Vendor", entity_id=self.first.pk)
        AuditLog.objects.create(actor=self.admin, action="vendor.created", entity_type="Vendor", entity_id=self.second.pk)
        AuditLog.objects.create(actor=self.admin, action="invoice.created", entity_type="Invoice", entity_id=self.first.pk)

    def test_onboardings_filter_by_vendor(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/vendor-onboardings/", {"vendor": self.first.pk})
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["vendor"] for row in response.data["results"]], [self.first.pk])
        unfiltered = self.client.get("/api/vendor-onboardings/")
        self.assertEqual(unfiltered.data["count"], 2)

    def test_onboarding_filter_keeps_clerk_scoping(self):
        self.client.force_authenticate(self.clerk)
        response = self.client.get("/api/vendor-onboardings/", {"vendor": self.second.pk})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)

    def test_onboarding_filter_rejects_non_numeric_vendor(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/vendor-onboardings/", {"vendor": "abc"})
        self.assertEqual(response.status_code, 400)

    def test_audit_logs_filter_by_entity(self):
        self.client.force_authenticate(self.auditor)
        response = self.client.get("/api/audit-logs/", {"entity_type": "Vendor", "entity_id": self.first.pk})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["action"], "vendor.created")
        self.assertEqual(self.client.get("/api/audit-logs/").data["count"], 3)

    def test_audit_logs_still_forbidden_for_clerk(self):
        self.client.force_authenticate(self.clerk)
        response = self.client.get("/api/audit-logs/", {"entity_type": "Vendor", "entity_id": self.first.pk})
        self.assertEqual(response.status_code, 403)

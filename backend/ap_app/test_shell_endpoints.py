"""Endpoints added for the app shell: approval badge count and notification bulk actions."""
from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APITestCase

from .models import APNotification, Approval, ApprovalRule, Invoice, User, Vendor


class PendingApprovalCountTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user("count-admin", password="StrongPass123!", role="ADMIN")
        self.me = User.objects.create_user("count-me", password="StrongPass123!", role="APPROVER")
        self.other = User.objects.create_user("count-other", password="StrongPass123!", role="APPROVER")
        self.vendor = Vendor.objects.create(code="V-CNT", name="Count Vendor", email="c@example.test", status="ACTIVE")
        self.rule = ApprovalRule.objects.create(name="Any", min_amount=0, max_amount=10000, role=self.me)

    def approval(self, approver, status="PENDING", active=True, invoice_status=Invoice.Status.PENDING_APPROVAL, sequence=1):
        invoice = Invoice.objects.create(
            invoice_number=f"CNT-{Invoice.objects.count() + 1}", vendor=self.vendor,
            invoice_date=timezone.localdate(), due_date=timezone.localdate(),
            subtotal=Decimal("10"), tax_amount=Decimal("0"), total_amount=Decimal("10"),
            status=invoice_status, file="invoices/test.png", created_by=self.admin,
        )
        return Approval.objects.create(
            invoice=invoice, approver=approver, rule=self.rule, status=status, sequence=sequence,
            due_at=timezone.now() if active else None,
        )

    def count_for(self, user):
        self.client.force_authenticate(user)
        response = self.client.get("/api/approvals/pending-count/")
        self.assertEqual(response.status_code, 200)
        return response.data["count"]

    def test_counts_only_my_actionable_approvals(self):
        self.approval(self.me)                                   # counted
        self.approval(self.me, status="ESCALATED")               # counted
        self.approval(self.me, active=False, sequence=2)         # later sequential step: not yet actionable
        self.approval(self.me, status="APPROVED")                # decided
        self.approval(self.me, invoice_status=Invoice.Status.REJECTED)  # invoice no longer awaiting approval
        self.approval(self.other)                                # someone else's
        self.assertEqual(self.count_for(self.me), 2)
        self.assertEqual(self.count_for(self.other), 1)

    def test_admin_sees_own_assignments_not_everyones(self):
        self.approval(self.me)
        self.assertEqual(self.count_for(self.admin), 0)


class NotificationBulkTests(APITestCase):
    def setUp(self):
        self.me = User.objects.create_user("notify-me", password="StrongPass123!", role="AP_CLERK")
        self.other = User.objects.create_user("notify-other", password="StrongPass123!", role="AP_CLERK")
        for index in range(25):  # more than one page
            APNotification.objects.create(recipient=self.me, title=f"N{index}", message="m")
        APNotification.objects.create(recipient=self.me, title="old", message="m", read_at=timezone.now())
        APNotification.objects.create(recipient=self.other, title="theirs", message="m")
        self.client.force_authenticate(self.me)

    def test_unread_count_covers_all_pages(self):
        response = self.client.get("/api/notifications/unread-count/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 25)

    def test_mark_all_read_only_touches_my_unread_notifications(self):
        response = self.client.post("/api/notifications/mark-all-read/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["marked"], 25)
        self.assertFalse(APNotification.objects.filter(recipient=self.me, read_at__isnull=True).exists())
        self.assertTrue(APNotification.objects.filter(recipient=self.other, read_at__isnull=True).exists())
        self.assertEqual(self.client.get("/api/notifications/unread-count/").data["count"], 0)

    def test_requires_authentication(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/notifications/unread-count/").status_code, 401)
        self.assertEqual(self.client.post("/api/notifications/mark-all-read/").status_code, 401)

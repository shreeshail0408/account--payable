"""ApprovalViewSet role gate (APRolePermission) on top of the existing assigned-approver checks."""
from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APITestCase

from .models import Approval, ApprovalRule, Invoice, User, Vendor

PASSWORD = "StrongPass123!"


class ApprovalRolePermissionTests(APITestCase):
    def setUp(self):
        self.users = {
            role: User.objects.create_user(f"perm-{role.lower()}", password=PASSWORD, role=role)
            for role in ("ADMIN", "AP_CLERK", "APPROVER", "ACCOUNTANT", "AUDITOR")
        }
        self.assigned = self.users["APPROVER"]
        self.other_approver = User.objects.create_user("perm-approver-2", password=PASSWORD, role="APPROVER")
        vendor = Vendor.objects.create(code="V-PERM", name="Perm Vendor", email="p@example.test", status="ACTIVE")
        rule = ApprovalRule.objects.create(name="Any", min_amount=0, max_amount=10000, role=self.assigned)
        self.invoice = Invoice.objects.create(
            invoice_number="PERM-1", vendor=vendor,
            invoice_date=timezone.localdate(), due_date=timezone.localdate(),
            subtotal=Decimal("10"), tax_amount=Decimal("0"), total_amount=Decimal("10"),
            status=Invoice.Status.PENDING_APPROVAL, file="invoices/test.png", created_by=self.users["ADMIN"],
        )
        self.approval = Approval.objects.create(
            invoice=self.invoice, approver=self.assigned, rule=rule, sequence=1, due_at=timezone.now(),
        )

    def as_user(self, user):
        self.client.force_authenticate(user)
        return self.client

    def assert_undecided(self):
        self.approval.refresh_from_db()
        self.invoice.refresh_from_db()
        self.assertEqual(self.approval.status, "PENDING")
        self.assertEqual(self.invoice.status, Invoice.Status.PENDING_APPROVAL)

    def test_read_endpoints_allow_only_admin_approver_auditor(self):
        expected = {"ADMIN": 200, "APPROVER": 200, "AUDITOR": 200, "AP_CLERK": 403, "ACCOUNTANT": 403}
        for path in ("/api/approvals/", "/api/approvals/reminders/", "/api/approvals/pending-count/",
                     f"/api/approvals/{self.approval.pk}/"):
            for role, status in expected.items():
                with self.subTest(path=path, role=role):
                    self.assertEqual(self.as_user(self.users[role]).get(path).status_code, status)

    def test_scoping_is_unchanged_for_allowed_roles(self):
        def ids(user):
            data = self.as_user(user).get("/api/approvals/").data
            return [row["id"] for row in data.get("results", data)]
        self.assertEqual(ids(self.users["ADMIN"]), [self.approval.pk])
        self.assertEqual(ids(self.users["AUDITOR"]), [self.approval.pk])
        self.assertEqual(ids(self.assigned), [self.approval.pk])
        self.assertEqual(ids(self.other_approver), [])

    def test_roles_without_decision_rights_get_403_before_anything_changes(self):
        for role in ("AP_CLERK", "ACCOUNTANT", "AUDITOR"):
            for action, body in (("approve", {}), ("reject", {"comments": "Not valid"})):
                with self.subTest(role=role, action=action):
                    response = self.as_user(self.users[role]).post(
                        f"/api/approvals/{self.approval.pk}/{action}/", body, format="json")
                    self.assertEqual(response.status_code, 403)
        self.assert_undecided()

    def test_unassigned_approver_still_cannot_decide(self):
        for action, body in (("approve", {}), ("reject", {"comments": "Not valid"})):
            with self.subTest(action=action):
                response = self.as_user(self.other_approver).post(
                    f"/api/approvals/{self.approval.pk}/{action}/", body, format="json")
                # Queryset scoping hides other approvers' records entirely.
                self.assertEqual(response.status_code, 404)
        self.assert_undecided()

    def test_assigned_approver_can_approve(self):
        response = self.as_user(self.assigned).post(f"/api/approvals/{self.approval.pk}/approve/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, Invoice.Status.APPROVED)

    def test_assigned_approver_can_reject(self):
        response = self.as_user(self.assigned).post(
            f"/api/approvals/{self.approval.pk}/reject/", {"comments": "Wrong amount"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, Invoice.Status.REJECTED)

    def test_admin_can_decide_on_any_approval(self):
        response = self.as_user(self.users["ADMIN"]).post(
            f"/api/approvals/{self.approval.pk}/approve/", {}, format="json")
        self.assertEqual(response.status_code, 200)

    def test_escalate_overdue_is_admin_only(self):
        for role in ("AP_CLERK", "APPROVER", "ACCOUNTANT", "AUDITOR"):
            with self.subTest(role=role):
                response = self.as_user(self.users[role]).post("/api/approvals/escalate-overdue/")
                self.assertEqual(response.status_code, 403)
        self.assertEqual(self.as_user(self.users["ADMIN"]).post("/api/approvals/escalate-overdue/").status_code, 200)

    def test_requires_authentication(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/approvals/").status_code, 401)
        self.assertEqual(self.client.post(f"/api/approvals/{self.approval.pk}/approve/").status_code, 401)

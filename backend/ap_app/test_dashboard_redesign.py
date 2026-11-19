"""Additive API for the redesigned dashboard: invoice list filters and dashboard KPIs/attention."""
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APITestCase

from .models import Approval, ApprovalRule, Invoice, Payment, User, Vendor

PASSWORD = "StrongPass123!"


class DashboardFixture(APITestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.users = {
            role: User.objects.create_user(f"dash-{role.lower()}", password=PASSWORD, role=role)
            for role in ("ADMIN", "AP_CLERK", "APPROVER", "ACCOUNTANT", "AUDITOR")
        }
        self.vendor = Vendor.objects.create(code="V-DASH", name="Dash Vendor", email="d@example.test", status="ACTIVE")
        self.counter = 0

    def invoice(self, status, due_in=0, amount="100.00", **extra):
        self.counter += 1
        return Invoice.objects.create(
            invoice_number=f"DASH-{self.counter}", vendor=self.vendor,
            invoice_date=self.today,
            due_date=None if due_in is None else self.today + timedelta(days=due_in),
            subtotal=Decimal(amount), tax_amount=Decimal("0"), total_amount=Decimal(amount),
            status=status, file="invoices/test.png", created_by=self.users["ADMIN"], **extra,
        )

    def list_numbers(self, user="ADMIN", **params):
        self.client.force_authenticate(self.users[user])
        response = self.client.get("/api/invoices/", params)
        self.assertEqual(response.status_code, 200, response.data)
        return sorted(row["invoice_number"] for row in response.data["results"])

    def dashboard(self, user="ADMIN"):
        self.client.force_authenticate(self.users[user])
        response = self.client.get("/api/dashboard/")
        self.assertEqual(response.status_code, 200)
        return response.data


class InvoiceListFilterTests(DashboardFixture):
    def setUp(self):
        super().setUp()
        self.future = self.invoice("APPROVED", due_in=5)                # Not yet due
        self.due_today = self.invoice("PENDING_APPROVAL", due_in=0)     # 0-30
        self.d30 = self.invoice("MATCHED", due_in=-30)                  # 0-30
        self.d31 = self.invoice("APPROVED", due_in=-31)                 # 31-60
        self.d91 = self.invoice("APPROVED", due_in=-91)                 # 90+
        self.paid = self.invoice("PAID", due_in=-40)                    # not outstanding
        self.exception = self.invoice("EXCEPTION", due_in=-10)          # not outstanding
        self.no_due = self.invoice("APPROVED", due_in=None)             # not in aging

    def test_no_params_is_unchanged(self):
        self.assertEqual(len(self.list_numbers()), 8)

    def test_status_single_and_list(self):
        self.assertEqual(self.list_numbers(status="EXCEPTION"), [self.exception.invoice_number])
        self.assertEqual(
            self.list_numbers(status="PAID,EXCEPTION"),
            sorted([self.paid.invoice_number, self.exception.invoice_number]),
        )

    def test_unknown_status_is_a_400_not_an_empty_list(self):
        self.client.force_authenticate(self.users["ADMIN"])
        response = self.client.get("/api/invoices/", {"status": "BOGUS"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("status", response.data)

    def test_aging_buckets_match_dashboard_boundaries(self):
        self.assertEqual(self.list_numbers(aging="Not yet due"), [self.future.invoice_number])
        self.assertEqual(self.list_numbers(aging="0-30"), sorted([self.due_today.invoice_number, self.d30.invoice_number]))
        self.assertEqual(self.list_numbers(aging="31-60"), [self.d31.invoice_number])
        self.assertEqual(self.list_numbers(aging="61-90"), [])
        self.assertEqual(self.list_numbers(aging="90+"), [self.d91.invoice_number])

    def test_aging_counts_agree_with_dashboard(self):
        aging = {row["bucket"]: row["count"] for row in self.dashboard()["aging"]}
        for bucket, count in aging.items():
            with self.subTest(bucket=bucket):
                self.assertEqual(len(self.list_numbers(aging=bucket)), count)

    def test_unknown_aging_bucket_is_a_400(self):
        self.client.force_authenticate(self.users["ADMIN"])
        self.assertEqual(self.client.get("/api/invoices/", {"aging": "1-2"}).status_code, 400)

    def test_outstanding(self):
        self.assertEqual(len(self.list_numbers(outstanding="1")), 5)

    def test_due_before(self):
        cutoff = (self.today + timedelta(days=1)).isoformat()
        numbers = self.list_numbers(status="APPROVED", due_before=cutoff)
        self.assertEqual(numbers, sorted([self.d31.invoice_number, self.d91.invoice_number]))
        self.client.force_authenticate(self.users["ADMIN"])
        self.assertEqual(self.client.get("/api/invoices/", {"due_before": "19-11-2026"}).status_code, 400)

    def test_filters_respect_role_scoping(self):
        # Accountants only ever see APPROVED/PAID invoices; filters can't widen that.
        self.assertEqual(self.list_numbers(user="ACCOUNTANT", status="EXCEPTION"), [])

    def test_detail_view_ignores_list_params(self):
        self.client.force_authenticate(self.users["ADMIN"])
        response = self.client.get(f"/api/invoices/{self.paid.pk}/", {"status": "BOGUS"})
        self.assertEqual(response.status_code, 200)


class DashboardKpiTests(DashboardFixture):
    def test_outstanding_totals_equal_the_aging_sum(self):
        self.invoice("APPROVED", due_in=3, amount="100.00")
        self.invoice("PENDING_APPROVAL", due_in=-45, amount="250.50")
        self.invoice("PAID", due_in=-45, amount="999.00")
        self.invoice("APPROVED", due_in=None, amount="999.00")
        data = self.dashboard()
        self.assertEqual(Decimal(str(data["outstanding_amount"])), Decimal("350.50"))
        self.assertEqual(data["outstanding_count"], 2)
        self.assertEqual(
            Decimal(str(data["outstanding_amount"])),
            sum(Decimal(str(row["amount"])) for row in data["aging"]),
        )

    def test_ocr_confidence_only_counts_ocr_captured_invoices(self):
        self.invoice("CAPTURED", ocr_text="INVOICE 1", ocr_accuracy=Decimal("90.00"))
        self.invoice("CAPTURED", ocr_text="INVOICE 2", ocr_accuracy=Decimal("80.00"),
                     extraction_reviewed_at=timezone.now())
        self.invoice("CAPTURED", ocr_accuracy=Decimal("0"))  # entered manually, no OCR
        data = self.dashboard()
        self.assertEqual(data["average_ocr_confidence"], 85.0)
        self.assertEqual(data["ocr_confidence_invoice_count"], 2)
        self.assertEqual(data["ocr_review_pending_count"], 1)
        self.assertEqual(len(self.list_numbers(needs_review="1")), 1)
        self.assertNotIn("ocr_accuracy", data)

    def test_ocr_confidence_is_null_without_ocr_invoices(self):
        self.assertIsNone(self.dashboard()["average_ocr_confidence"])

    def test_existing_fields_are_still_present(self):
        data = self.dashboard()
        for key in ("invoice_status", "aging", "pending_approvals", "processing_turnaround_hours",
                    "verified_extraction_accuracy", "verified_extraction_field_count",
                    "vendor_analytics", "payment_status", "exceptions_count"):
            self.assertIn(key, data)


class DashboardAttentionTests(DashboardFixture):
    def test_sections_are_tailored_by_role(self):
        expected = {
            "ADMIN": {"my_approvals", "exceptions", "payments_due"},
            "AP_CLERK": {"exceptions"},
            "APPROVER": {"my_approvals"},
            "ACCOUNTANT": {"payments_due"},
            "AUDITOR": {"exceptions", "payments_due"},
        }
        for role, sections in expected.items():
            with self.subTest(role=role):
                self.assertEqual(set(self.dashboard(role)["attention"]), sections)

    def test_my_approvals_only_lists_my_actionable_steps(self):
        me, other = self.users["APPROVER"], User.objects.create_user("dash-approver-2", password=PASSWORD, role="APPROVER")
        rule = ApprovalRule.objects.create(name="Any", min_amount=0, max_amount=10**6, role=me)
        now = timezone.now()

        def approval(approver, due_at, invoice_status="PENDING_APPROVAL", status="PENDING"):
            return Approval.objects.create(
                invoice=self.invoice(invoice_status), approver=approver, rule=rule,
                status=status, sequence=1, due_at=due_at,
            )

        overdue = approval(me, now - timedelta(hours=2), status="ESCALATED")
        upcoming = approval(me, now + timedelta(hours=5))
        approval(me, None)                                            # later sequential step
        approval(me, now, invoice_status="REJECTED")                  # invoice no longer awaiting approval
        approval(me, now, status="APPROVED")                          # decided
        approval(other, now)                                          # someone else's
        section = self.dashboard("APPROVER")["attention"]["my_approvals"]
        self.assertEqual(section["count"], 2)
        self.assertEqual([item["approval_id"] for item in section["items"]], [overdue.pk, upcoming.pk])
        self.assertTrue(section["items"][0]["overdue"])
        self.assertFalse(section["items"][1]["overdue"])
        self.assertEqual(section["items"][0]["vendor_name"], "Dash Vendor")

    def test_exceptions_section(self):
        invoice = self.invoice("EXCEPTION", exceptions=["Line 'Paper': unit price differs from PO price."])
        self.invoice("APPROVED")
        section = self.dashboard("AP_CLERK")["attention"]["exceptions"]
        self.assertEqual(section["count"], 1)
        self.assertEqual(section["items"][0]["invoice_id"], invoice.pk)
        self.assertIn("unit price", section["items"][0]["exception"])

    def test_payments_due_this_week_includes_overdue_and_excludes_later_or_unapproved(self):
        overdue = self.invoice("APPROVED", due_in=-3, amount="100.00")
        this_week = self.invoice("APPROVED", due_in=7, amount="50.00")
        Payment.objects.create(invoice=this_week, reference="PAY-DASH-1", amount=Decimal("50.00"))
        self.invoice("APPROVED", due_in=8)              # next week
        self.invoice("PAID", due_in=1)                  # already paid
        self.invoice("PENDING_APPROVAL", due_in=1)      # not approved yet
        section = self.dashboard("ACCOUNTANT")["attention"]["payments_due"]
        self.assertEqual(section["count"], 2)
        self.assertEqual(Decimal(str(section["amount"])), Decimal("150.00"))
        self.assertEqual([item["invoice_id"] for item in section["items"]], [overdue.pk, this_week.pk])
        self.assertTrue(section["items"][0]["overdue"])
        self.assertIsNone(section["items"][0]["payment_status"])
        self.assertEqual(section["items"][1]["payment_status"], "REQUESTED")
        # The "view all" link target agrees with the panel.
        numbers = self.list_numbers(user="ACCOUNTANT", status="APPROVED", due_before=str(section["due_before"]))
        self.assertEqual(numbers, sorted([overdue.invoice_number, this_week.invoice_number]))

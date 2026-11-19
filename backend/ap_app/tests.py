import json
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from decimal import Decimal
from unittest.mock import patch
from tempfile import NamedTemporaryFile
from email.message import EmailMessage
from django.core.management import call_command, CommandError
from unittest.mock import MagicMock
from .models import APNotification, User, Vendor, PurchaseOrder, Invoice, ApprovalRule, Approval, Payment, IntegrationDelivery, AuditLog, VendorBankChange
from .services import extract_invoice_fields, extract_ocr


class AccountsPayableTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user("admin", password="StrongPass123!", role="ADMIN")
        self.client.force_authenticate(self.admin)
        self.vendor = Vendor.objects.create(code="V001", name="Acme Supplies", email="v@acme.test", status="ACTIVE")

    def test_vendor_crud_and_search(self):
        response = self.client.post("/api/vendors/", {"code": "V002", "name": "Beta", "email": "b@test.com", "status": "ACTIVE"})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["status"], "PENDING")
        self.assertEqual(response.data["onboarding_status"], "SUBMITTED")
        response = self.client.get("/api/vendors/", {"search": "Beta"})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(any(v["code"] == "V002" for v in response.json()["results"]))

    def test_admin_approves_vendor_onboarding_before_activation(self):
        created = self.client.post("/api/vendors/", {
            "code": "V-ONBOARD", "name": "Pending Vendor", "email": "pending@example.test",
        })
        vendor_id = created.data["id"]
        response = self.client.post(f"/api/vendors/{vendor_id}/approve_onboarding/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["status"], "ACTIVE")
        self.assertEqual(response.data["onboarding_status"], "APPROVED")
        self.assertTrue(APNotification.objects.filter(recipient=self.admin, entity_id=vendor_id).exists())

    def test_non_admin_cannot_approve_vendor_onboarding(self):
        created = self.client.post("/api/vendors/", {
            "code": "V-ONBOARD-2", "name": "Pending Vendor 2", "email": "pending2@example.test",
        })
        clerk = User.objects.create_user("clerk", password="StrongPass123!", role="AP_CLERK")
        self.client.force_authenticate(clerk)
        response = self.client.post(f"/api/vendors/{created.data['id']}/approve_onboarding/")
        self.assertEqual(response.status_code, 403)

    def test_public_registration_is_disabled_and_employee_accounts_require_admin_activation(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post("/api/auth/register/", {
            "username": "public-admin", "password": "NoPublicAccount123!", "role": "ADMIN",
        }).status_code, 403)
        self.client.force_authenticate(self.admin)
        created = self.client.post("/api/employees/", {
            "username": "managed-approver", "email": "managed@example.test",
            "password": "v3ry-L0ng_Random#Word91", "role": "APPROVER",
        })
        self.assertEqual(created.status_code, 201, created.data)
        self.assertFalse(created.data["is_active"])
        activated = self.client.patch(f"/api/employees/{created.data['id']}/activation/", {"is_active": True})
        self.assertEqual(activated.status_code, 200, activated.data)
        self.assertTrue(activated.data["is_active"])

    def test_vendor_list_masks_bank_account_and_admin_changes_are_audited(self):
        self.vendor.bank_name = "Example Bank"
        self.vendor.bank_account = "123456789012"
        self.vendor.ifsc = "ABCD0123456"
        self.vendor.save()
        listed = self.client.get("/api/vendors/")
        self.assertNotIn("123456789012", str(listed.data))
        self.assertIn("••••••••9012", str(listed.data))
        changed = self.client.post(f"/api/vendors/{self.vendor.id}/bank-details/", {
            "bank_name": "Example Bank", "bank_account": "998877665544", "ifsc": "ABCD0123456",
        })
        self.assertEqual(changed.status_code, 200, changed.data)
        self.assertNotIn("998877665544", str(changed.data))
        self.assertTrue(AuditLog.objects.filter(action="vendor.bank_details_changed", entity_id=self.vendor.id).exists())
        self.assertEqual(VendorBankChange.objects.filter(vendor=self.vendor).count(), 1)

    def test_non_admin_cannot_read_audit_or_financial_reports(self):
        clerk = User.objects.create_user("report-clerk", password="StrongPass123!", role="AP_CLERK")
        self.client.force_authenticate(clerk)
        self.assertEqual(self.client.get("/api/audit-logs/").status_code, 403)
        self.assertEqual(self.client.get("/api/reports/?kind=aging").status_code, 403)

    def test_approver_can_only_read_assigned_approvals(self):
        from .models import ApprovalRule

        assigned = User.objects.create_user("assigned-approver", password="StrongPass123!", role="APPROVER")
        other = User.objects.create_user("other-approver", password="StrongPass123!", role="APPROVER")
        invoice = Invoice.objects.create(
            invoice_number="INV-APPROVAL-SCOPE", vendor=self.vendor,
            invoice_date=timezone.localdate(), due_date=timezone.localdate(),
            subtotal=Decimal("100"), tax_amount=Decimal("18"), total_amount=Decimal("118"),
            file=SimpleUploadedFile("approval-scope.png", b"test", content_type="image/png"),
            created_by=self.admin,
        )
        rule = ApprovalRule.objects.create(name="Approval scope", min_amount=0, max_amount=500, role=assigned)
        assigned_approval = Approval.objects.create(invoice=invoice, approver=assigned, rule=rule, sequence=1)
        other_rule = ApprovalRule.objects.create(name="Other approval scope", min_amount=0, max_amount=500, role=other)
        other_approval = Approval.objects.create(invoice=invoice, approver=other, rule=other_rule, sequence=1)

        self.client.force_authenticate(assigned)
        response = self.client.get("/api/approvals/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.data["results"]], [assigned_approval.id])
        self.assertEqual(self.client.get(f"/api/approvals/{other_approval.id}/").status_code, 404)

    def test_roles_cannot_bypass_approval_and_payment_actions(self):
        approver = User.objects.create_user("approval-action-user", password="StrongPass123!", role="APPROVER")
        rule = ApprovalRule.objects.create(name="Protected rule", min_amount=0, max_amount=500, role=approver)
        invoice = Invoice.objects.create(
            invoice_number="INV-ROLE-GUARD", vendor=self.vendor,
            invoice_date=timezone.localdate(), due_date=timezone.localdate(),
            subtotal=Decimal("100"), tax_amount=Decimal("18"), total_amount=Decimal("118"),
            file=SimpleUploadedFile("role-guard.png", b"test", content_type="image/png"),
            created_by=self.admin,
        )
        approval = Approval.objects.create(invoice=invoice, approver=approver, rule=rule, sequence=1)
        payment = Payment.objects.create(invoice=invoice, reference="PAY-ROLE-GUARD", amount=invoice.total_amount)

        self.client.force_authenticate(approver)
        self.assertIn(self.client.patch(f"/api/approvals/{approval.id}/", {"status": "APPROVED"}).status_code, (403, 405))

        clerk = User.objects.create_user("role-guard-clerk", password="StrongPass123!", role="AP_CLERK")
        self.client.force_authenticate(clerk)
        self.assertEqual(self.client.post("/api/approval-rules/", {
            "name": "Clerk rule", "min_amount": "0", "max_amount": "1000", "role": approver.id,
        }).status_code, 403)
        self.assertEqual(self.client.post(f"/api/payments/{payment.id}/mark_paid/").status_code, 403)

    def test_duplicate_invoice_is_rejected_by_validation(self):
        file = SimpleUploadedFile("invoice.png", b"test", content_type="image/png")
        first = Invoice.objects.create(
            invoice_number="INV-100", vendor=self.vendor, invoice_date=timezone.localdate(),
            due_date=timezone.localdate(), subtotal=Decimal("100"), tax_amount=Decimal("18"),
            total_amount=Decimal("118"), file=file, created_by=self.admin,
        )
        second = Invoice(
            invoice_number="INV-100", vendor=self.vendor, invoice_date=timezone.localdate(),
            due_date=timezone.localdate(), subtotal=Decimal("100"), tax_amount=Decimal("18"),
            total_amount=Decimal("118"), file=file, created_by=self.admin,
        )
        from .services import validate_and_match
        errors = validate_and_match(second)
        self.assertTrue(errors)

    @patch("ap_app.views.extract_ocr", return_value=("invoice", 90.0))
    def test_duplicate_invoice_api_returns_validation_error(self, _ocr):
        payload = {
            "invoice_number": "INV-DUPLICATE-API", "vendor": self.vendor.id,
            "invoice_date": str(timezone.localdate()), "due_date": str(timezone.localdate()),
            "subtotal": "100", "tax_amount": "18", "total_amount": "118",
            "file": SimpleUploadedFile("duplicate-api.png", b"test", content_type="image/png"),
        }
        first = self.client.post("/api/invoices/", payload, format="multipart")
        self.assertEqual(first.status_code, 201, first.data)
        payload["file"] = SimpleUploadedFile("duplicate-api-again.png", b"test", content_type="image/png")
        duplicate = self.client.post("/api/invoices/", payload, format="multipart")
        self.assertEqual(duplicate.status_code, 400, duplicate.data)
        self.assertIn("invoice number already exists", str(duplicate.data).lower())

    @patch("ap_app.views.extract_ocr", return_value=("sample invoice text", 95.0))
    def test_purchase_order_grn_and_three_way_invoice_flow(self, _ocr):
        po_response = self.client.post("/api/purchase-orders/", {
            "number": "PO-3WAY-1",
            "vendor": self.vendor.id,
            "order_date": str(timezone.localdate()),
            "total_amount": "500.00",
            "lines": [{"description": "Paper", "quantity": "5", "unit_price": "50.00"}],
        }, format="json")
        self.assertEqual(po_response.status_code, 201, po_response.data)
        po_line_id = po_response.data["lines"][0]["id"]

        grn_response = self.client.post("/api/grns/", {
            "number": "GRN-3WAY-1",
            "purchase_order": po_response.data["id"],
            "received_date": str(timezone.localdate()),
            "received_by": self.admin.id,
            "lines": [{"po_line": po_line_id, "quantity": "2"}],
        }, format="json")
        self.assertEqual(grn_response.status_code, 201, grn_response.data)

        invoice_response = self.client.post("/api/invoices/", {
            "invoice_number": "INV-3WAY-1",
            "vendor": self.vendor.id,
            "purchase_order": po_response.data["id"],
            "invoice_date": str(timezone.localdate()),
            "due_date": str(timezone.localdate()),
            "subtotal": "100.00",
            "tax_amount": "18.00",
            "total_amount": "118.00",
            "match_type": "3WAY",
            "line_items": '[{"po_line": %s, "description": "Paper", "quantity": "2", "unit_price": "50.00", "tax_rate": "18.00", "amount": "100.00"}]' % po_line_id,
            "file": SimpleUploadedFile("invoice.png", b"test", content_type="image/png"),
        }, format="multipart")
        self.assertEqual(invoice_response.status_code, 201, invoice_response.data)
        self.assertEqual(invoice_response.data["status"], "MATCHED")
        self.assertEqual(invoice_response.data["ocr_accuracy"], "95.00")

    def test_goods_receipt_cannot_exceed_po_line_quantity(self):
        po = PurchaseOrder.objects.create(
            number="PO-LIMIT-1", vendor=self.vendor, order_date=timezone.localdate(),
            total_amount=Decimal("100"),
        )
        from .models import POLine
        line = POLine.objects.create(
            purchase_order=po, description="Paper", quantity=Decimal("2"),
            unit_price=Decimal("50"),
        )
        response = self.client.post("/api/grns/", {
            "number": "GRN-LIMIT-1",
            "purchase_order": po.id,
            "received_date": str(timezone.localdate()),
            "received_by": self.admin.id,
            "lines": [{"po_line": line.id, "quantity": "3"}],
        }, format="json")
        self.assertEqual(response.status_code, 400)

    def test_ocr_field_suggestions_parse_common_invoice_labels(self):
        suggestions = extract_invoice_fields(
            "Invoice No: INV-2026-01\nInvoice Date: 18/11/2026\n"
            "Due Date: 30/11/2026\nSubtotal: 1,000.00\nTax Amount: 180.00\n"
            "Grand Total: 1,180.00\nGSTIN: 29ABCDE1234F1Z5"
        )
        self.assertEqual(suggestions["invoice_number"], "INV-2026-01")
        self.assertEqual(suggestions["invoice_date"], "2026-11-18")
        self.assertEqual(suggestions["due_date"], "2026-11-30")
        self.assertEqual(suggestions["subtotal"], Decimal("1000.00"))
        self.assertEqual(suggestions["tax_amount"], Decimal("180.00"))
        self.assertEqual(suggestions["total_amount"], Decimal("1180.00"))
        self.assertEqual(suggestions["gstin"], "29ABCDE1234F1Z5")

    def test_ocr_suggests_only_arithmetic_consistent_material_rows(self):
        suggestions = extract_invoice_fields(
            "Description Qty Rate Amount\n1 A4 Paper 2 50.00 100.00\n"
            "2 Toner 1 900.00 850.00\nSubtotal 100.00"
        )
        self.assertEqual(suggestions["line_items"], [{
            "description": "A4 Paper", "quantity": Decimal("2"),
            "unit_price": Decimal("50.00"), "tax_rate": Decimal("0"),
            "amount": Decimal("100.00"),
        }])

    @patch("ap_app.services.urlopen")
    def test_local_model_fills_missing_invoice_fields_and_filters_lines(self, mock_urlopen):
        from django.test import override_settings
        from .services import extract_invoice_fields

        response = MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps({
            "choices": [{"message": {"content": json.dumps({
                "invoice_number": "LOCAL-001", "invoice_date": "2026-11-18",
                "due_date": None, "subtotal": 100, "tax_amount": 18,
                "total_amount": 118, "gstin": None,
                "line_items": [
                    {"description": "Paper", "quantity": 2, "unit_price": 50, "amount": 100},
                    {"description": "Bad math", "quantity": 2, "unit_price": 50, "amount": 80},
                ],
            })}}]
        }).encode()
        mock_urlopen.return_value = response
        with override_settings(
            LOCAL_LLM_BASE_URL="http://127.0.0.1:11434/v1", LOCAL_LLM_MODEL="test-model",
        ):
            fields = extract_invoice_fields("OCR text without labeled fields")
        self.assertEqual(fields["invoice_number"], "LOCAL-001")
        self.assertEqual(fields["total_amount"], Decimal("118"))
        self.assertEqual(len(fields["line_items"]), 1)
        self.assertEqual(fields["line_items"][0]["description"], "Paper")
        self.assertEqual(mock_urlopen.call_args.args[0].full_url, "http://127.0.0.1:11434/v1/chat/completions")

    @patch("ap_app.services.urlopen")
    def test_local_model_is_disabled_without_model_or_for_non_loopback_endpoint(self, mock_urlopen):
        from django.test import override_settings
        from .services import extract_invoice_fields

        with override_settings(LOCAL_LLM_BASE_URL="http://127.0.0.1:11434/v1", LOCAL_LLM_MODEL=""):
            extract_invoice_fields("Invoice text")
        with override_settings(LOCAL_LLM_BASE_URL="https://remote.example/v1", LOCAL_LLM_MODEL="test-model"):
            extract_invoice_fields("Invoice text")
        mock_urlopen.assert_not_called()

    @patch(
        "ap_app.services.extract_ocr",
        return_value=(
            "Invoice No: BULK-001\nInvoice Date: 01/11/2026\nDue Date: 30/11/2026\n"
            "Subtotal: 100.00\nTax Amount: 18.00\nGrand Total: 118.00\n"
            "Description Qty Rate Amount\n1 Paper 2 50.00 100.00",
            92.5,
        ),
    )
    def test_bulk_upload_saves_extracted_invoice_data_and_lines(self, _ocr):
        response = self.client.post("/api/invoices/bulk/", {
            "vendor": str(self.vendor.id),
            "files": [SimpleUploadedFile("bulk.png", b"image", content_type="image/png")],
        }, format="multipart")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["created"], 1)
        invoice = Invoice.objects.get(pk=response.data["invoice_ids"][0])
        self.assertEqual(invoice.invoice_number, "BULK-001")
        self.assertEqual(invoice.total_amount, Decimal("118.00"))
        self.assertEqual(invoice.capture_source, "BULK")
        self.assertEqual(invoice.lines.get().description, "Paper")

    @patch("ap_app.services.extract_ocr", side_effect=RuntimeError("Tesseract is unavailable"))
    def test_bulk_upload_preserves_file_when_ocr_is_unavailable(self, _ocr):
        response = self.client.post("/api/invoices/bulk/", {
            "vendor": str(self.vendor.id),
            "files": [SimpleUploadedFile("unreadable.png", b"image", content_type="image/png")],
        }, format="multipart")
        self.assertEqual(response.status_code, 201, response.data)
        invoice = Invoice.objects.get(pk=response.data["invoice_ids"][0])
        self.assertEqual(invoice.status, Invoice.Status.VALIDATION_FAILED)
        self.assertTrue(invoice.file)
        self.assertIn("OCR is unavailable", " ".join(invoice.exceptions))

    def test_bulk_upload_reports_unsupported_file_without_silent_skip(self):
        response = self.client.post("/api/invoices/bulk/", {
            "vendor": str(self.vendor.id),
            "files": [SimpleUploadedFile("invoice.docx", b"file", content_type="application/octet-stream")],
        }, format="multipart")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["created"], 0)
        self.assertEqual(response.data["errors"][0]["filename"], "invoice.docx")

    def test_audit_report_is_downloadable_csv(self):
        from .models import AuditLog

        AuditLog.objects.create(actor=self.admin, action="test.action", entity_type="Invoice", entity_id=7)
        response = self.client.get("/api/reports/?kind=audit")
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/csv", response["Content-Type"])
        self.assertIn("test.action", response.content.decode())
        self.assertEqual(self.client.get("/api/reports/?kind=bogus").status_code, 400)

    def test_payment_advice_is_returned_and_paid_transition_requires_reference(self):
        accountant = User.objects.create_user("payment-accountant", password="StrongPass123!", role="ACCOUNTANT")
        invoice = Invoice.objects.create(
            invoice_number="INV-PAYMENT-ADVICE", vendor=self.vendor,
            invoice_date=timezone.localdate(), due_date=timezone.localdate(),
            subtotal=Decimal("100"), tax_amount=Decimal("18"), total_amount=Decimal("118"),
            status=Invoice.Status.APPROVED,
            file=SimpleUploadedFile("payment-advice.png", b"test", content_type="image/png"),
            created_by=self.admin,
        )
        self.client.force_authenticate(accountant)
        generated = self.client.post("/api/payments/generate/", {"invoice": invoice.id, "payment_method": "BANK_TRANSFER"})
        self.assertEqual(generated.status_code, 201, generated.data)
        self.assertIn("PAYMENT ADVICE", generated.data["advice"])
        self.assertEqual(self.client.post(f"/api/payments/{generated.data['id']}/mark_paid/").status_code, 400)
        paid = self.client.post(f"/api/payments/{generated.data['id']}/mark_paid/", {"bank_reference": "BANK-REF-001"})
        self.assertEqual(paid.status_code, 200, paid.data)
        self.assertEqual(paid.data["status"], Payment.Status.PAID)

    def test_ocr_reports_invalid_image_contents_clearly(self):
        with NamedTemporaryFile(suffix=".png") as invalid_file:
            invalid_file.write(b"not an image")
            invalid_file.flush()
            with self.assertRaisesRegex(RuntimeError, "not a readable image"):
                extract_ocr(invalid_file.name)

    @patch("ap_app.views.extract_ocr", return_value=("Invoice No: OCR-001\nGrand Total: 118.00", 91.25))
    def test_ocr_preview_returns_text_confidence_and_suggestions(self, _ocr):
        response = self.client.post(
            "/api/invoices/ocr-preview/",
            {"file": SimpleUploadedFile("preview.pdf", b"%PDF-1.4", content_type="application/pdf")},
            format="multipart",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["fields"]["invoice_number"], "OCR-001")
        self.assertEqual(response.data["fields"]["total_amount"], Decimal("118.00"))

    def test_admin_can_process_overdue_approval_escalations(self):
        approver = User.objects.create_user("approver-test", password="StrongPass123!", role="APPROVER")
        rule = ApprovalRule.objects.create(
            name="Escalation test", min_amount=Decimal("0"),
            max_amount=Decimal("1000"), role=approver, escalation_hours=1,
        )
        invoice = Invoice.objects.create(
            invoice_number="INV-ESC-1", vendor=self.vendor, invoice_date=timezone.localdate(),
            due_date=timezone.localdate(), subtotal=Decimal("100"), tax_amount=Decimal("18"),
            total_amount=Decimal("118"), file=SimpleUploadedFile("esc.png", b"test"),
            created_by=self.admin,
        )
        approval = Approval.objects.create(
            invoice=invoice, approver=approver, rule=rule, due_at=timezone.now()-timezone.timedelta(minutes=1),
        )
        response = self.client.post("/api/approvals/escalate-overdue/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["escalated"], 1)
        approval.refresh_from_db()
        self.assertEqual(approval.status, "ESCALATED")
        self.assertTrue(APNotification.objects.filter(recipient=approver, title="Your approval is overdue").exists())

    @patch.dict("os.environ", {}, clear=True)
    def test_external_integrations_fail_explicitly_when_not_configured(self):
        invoice = Invoice.objects.create(
            invoice_number="INV-ERP-1", vendor=self.vendor,
            invoice_date=timezone.localdate(), due_date=timezone.localdate(),
            subtotal=Decimal("100"), tax_amount=Decimal("18"), total_amount=Decimal("118"),
            status=Invoice.Status.APPROVED,
            file=SimpleUploadedFile("erp.png", b"test", content_type="image/png"),
            created_by=self.admin,
        )
        response = self.client.post(f"/api/invoices/{invoice.pk}/sync-erp/")
        self.assertEqual(response.status_code, 503)
        self.assertIn("ERP_API_URL", response.data["detail"])

        payment = Payment.objects.create(
            invoice=invoice, reference="PAY-BANK-1", amount=invoice.total_amount,
        )
        response = self.client.post(f"/api/payments/{payment.pk}/submit-bank/")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(payment.status, Payment.Status.REQUESTED)

    @patch("ap_app.integrations.urlopen")
    @patch.dict("os.environ", {"ERP_API_URL": "https://erp.example.test/invoices", "ERP_API_TOKEN": "test-token"})
    def test_configured_erp_delivery_records_success(self, mocked_urlopen):
        response = MagicMock()
        response.status = 202
        response.read.return_value = b"accepted"
        mocked_urlopen.return_value.__enter__.return_value = response
        invoice = Invoice.objects.create(
            invoice_number="INV-ERP-2", vendor=self.vendor,
            invoice_date=timezone.localdate(), due_date=timezone.localdate(),
            subtotal=Decimal("100"), tax_amount=Decimal("18"), total_amount=Decimal("118"),
            status=Invoice.Status.APPROVED,
            file=SimpleUploadedFile("erp-success.png", b"test", content_type="image/png"),
            created_by=self.admin,
        )

        result = self.client.post(f"/api/invoices/{invoice.pk}/sync-erp/")

        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data["status"], "SUCCEEDED")
        delivery = IntegrationDelivery.objects.get(entity_type="Invoice", entity_id=invoice.pk)
        self.assertEqual(delivery.status, IntegrationDelivery.Status.SUCCEEDED)
        self.assertEqual(delivery.response_status, 202)

    @patch.dict("os.environ", {}, clear=True)
    def test_email_ingestion_requires_mailbox_configuration(self):
        with self.assertRaisesMessage(CommandError, "Set IMAP_HOST"):
            call_command("ingest_email_invoices", once=True)

    @patch(
        "ap_app.management.commands.ingest_email_invoices.extract_ocr",
        return_value=(
            "Invoice No: MAIL-001\nInvoice Date: 01/01/2020\nDue Date: 15/01/2020\n"
            "Subtotal: 100.00\nTax Amount: 18.00\nGrand Total: 118.00\n"
            "Paper 2 50.00 100.00",
            92.0,
        ),
    )
    def test_email_attachment_creates_invoice_and_ingestion_record(self, _ocr):
        message = EmailMessage()
        message["From"] = self.vendor.email
        message["Subject"] = "Invoice MAIL-001"
        message["Message-ID"] = "<mail-001@example.test>"
        message.set_content("Please find the invoice attached.")
        message.add_attachment(b"image-bytes", maintype="image", subtype="png", filename="invoice.png")

        from .management.commands.ingest_email_invoices import Command
        event = Command()._ingest_message(message, b"raw-message", "<mail-001@example.test>")

        self.assertEqual(event.status, "PROCESSED")
        self.assertEqual(event.invoice.invoice_number, "MAIL-001")
        self.assertEqual(event.invoice.capture_source, "EMAIL")
        self.assertEqual(event.invoice.status, Invoice.Status.PENDING_APPROVAL)

    @patch("ap_app.views.extract_ocr", return_value=("invoice", 90.0))
    def test_sequential_approval_blocks_later_step_until_earlier_approved(self, _ocr):
        first_approver = User.objects.create_user("first-approver", password="StrongPass123!", role="APPROVER")
        second_approver = User.objects.create_user("second-approver", password="StrongPass123!", role="APPROVER")
        ApprovalRule.objects.create(name="First stage", min_amount=Decimal("0"), max_amount=Decimal("500"), role=first_approver, sequence=1)
        ApprovalRule.objects.create(name="Second stage", min_amount=Decimal("0"), max_amount=Decimal("500"), role=second_approver, sequence=2)
        invoice_response = self.client.post("/api/invoices/", {
            "invoice_number": "INV-SEQUENCE-1", "vendor": self.vendor.id,
            "invoice_date": str(timezone.localdate()), "due_date": str(timezone.localdate()),
            "subtotal": "100", "tax_amount": "18", "total_amount": "118",
            "line_items": '[{"description":"Paper","quantity":"2","unit_price":"50.00","tax_rate":"18.00","amount":"100.00"}]',
            "file": SimpleUploadedFile("sequence.png", b"test", content_type="image/png"),
        }, format="multipart")
        self.assertEqual(invoice_response.status_code, 201, invoice_response.data)
        self.assertEqual(self.client.post(f"/api/invoices/{invoice_response.data['id']}/review-extraction/", {"confirmed": True}).status_code, 200)
        submit_response = self.client.post(f"/api/invoices/{invoice_response.data['id']}/submit_approval/")
        self.assertEqual(submit_response.status_code, 200, submit_response.data)
        self.assertEqual(APNotification.objects.filter(title="Invoice approval requested").count(), 1)
        second_step = Approval.objects.get(invoice_id=invoice_response.data["id"], sequence=2)
        self.assertIsNone(second_step.due_at)
        self.client.force_authenticate(second_approver)
        blocked = self.client.post(f"/api/approvals/{second_step.id}/approve/")
        self.assertEqual(blocked.status_code, 400)
        first_step = Approval.objects.get(invoice_id=invoice_response.data["id"], sequence=1)
        self.client.force_authenticate(first_approver)
        approved = self.client.post(f"/api/approvals/{first_step.id}/approve/")
        self.assertEqual(approved.status_code, 200, approved.data)
        self.assertEqual(APNotification.objects.filter(recipient=second_approver, title="Invoice approval requested").count(), 1)
        second_step.refresh_from_db()
        self.assertIsNotNone(second_step.due_at)

    @patch("ap_app.views.extract_ocr", return_value=("invoice", 90.0))
    def test_parallel_same_sequence_approvals_are_notified_together(self, _ocr):
        first_approver = User.objects.create_user("parallel-one", password="StrongPass123!", role="APPROVER")
        second_approver = User.objects.create_user("parallel-two", password="StrongPass123!", role="APPROVER")
        ApprovalRule.objects.create(name="Parallel one", min_amount=Decimal("0"), max_amount=Decimal("500"), role=first_approver, sequence=1, parallel=True)
        ApprovalRule.objects.create(name="Parallel two", min_amount=Decimal("0"), max_amount=Decimal("500"), role=second_approver, sequence=1, parallel=True)
        invoice_response = self.client.post("/api/invoices/", {
            "invoice_number": "INV-PARALLEL-1", "vendor": self.vendor.id,
            "invoice_date": str(timezone.localdate()), "due_date": str(timezone.localdate()),
            "subtotal": "100", "tax_amount": "18", "total_amount": "118",
            "line_items": '[{"description":"Paper","quantity":"2","unit_price":"50.00","tax_rate":"18.00","amount":"100.00"}]',
            "file": SimpleUploadedFile("parallel.png", b"test", content_type="image/png"),
        }, format="multipart")
        self.assertEqual(invoice_response.status_code, 201, invoice_response.data)
        self.assertEqual(self.client.post(f"/api/invoices/{invoice_response.data['id']}/review-extraction/", {"confirmed": True}).status_code, 200)
        submit_response = self.client.post(f"/api/invoices/{invoice_response.data['id']}/submit_approval/")
        self.assertEqual(submit_response.status_code, 200, submit_response.data)
        self.assertEqual(APNotification.objects.filter(title="Invoice approval requested").count(), 2)
        first_step = Approval.objects.get(invoice_id=invoice_response.data["id"], approver=first_approver)
        second_step = Approval.objects.get(invoice_id=invoice_response.data["id"], approver=second_approver)
        self.client.force_authenticate(first_approver)
        self.assertEqual(self.client.post(f"/api/approvals/{first_step.id}/approve/").status_code, 200)
        invoice = Invoice.objects.get(pk=invoice_response.data["id"])
        self.assertEqual(invoice.status, Invoice.Status.PENDING_APPROVAL)
        self.client.force_authenticate(second_approver)
        self.assertEqual(self.client.post(f"/api/approvals/{second_step.id}/approve/").status_code, 200)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.APPROVED)

# API Documentation

Interactive Swagger/OpenAPI documentation:

- `http://localhost:8000/api/docs/`
- `http://localhost:8000/api/schema/`

## Authentication

- `POST /api/auth/register/` (disabled; returns `403`)
- `GET|POST /api/employees/` (administrator only; created accounts start inactive)
- `PATCH /api/employees/{id}/activation/` (administrator only)
- `POST /api/auth/login/`
- `POST /api/auth/refresh/`
- `GET /api/auth/me/`

All resources use bearer JWT authentication.

Administrators can review all approval records. Other roles can only list or retrieve approvals assigned to their own account; approval and rejection actions also require the request user to be the assigned approver (or an administrator).
Approval-rule changes are administrator-only. Approvers cannot edit approval status through generic update requests. AP clerks create and maintain capture, vendor, purchase-order, and receipt records; accountants use the payment workflow; auditors are read-only.

## Main resources

- `/api/vendors/` (general responses mask bank account and IFSC to the last 4 characters, for every role)
- `/api/vendors/{id}/bank-details/` (administrator-only secure bank detail update; response remains masked)
- `/api/vendors/{id}/bank-history/` (administrator-only masked audit history)
- `/api/vendors/{id}/full-bank-details/` (GET; administrator and accountant only; returns unmasked bank account and IFSC; every view is recorded as a `vendor.bank_details_viewed` audit event)
- `/api/purchase-orders/`
- `/api/grns/`
- `/api/invoices/` (list filters, all optional: `search`, `status=A,B`, `outstanding=1`, `aging=<bucket>`, `due_before=YYYY-MM-DD`, `needs_review=1`, `vendor=<id>`, `date_from` / `date_to=YYYY-MM-DD` (invoice date, inclusive); unknown values return 400. `ordering=` one of `invoice_number`, `vendor__name`, `invoice_date`, `due_date`, `total_amount`, `status`, `ocr_accuracy`, `created_at`, `-` prefix for descending; default stays newest first)
- `/api/invoices/match-settings/` (GET → PO match tolerances `{line_amount, invoice_amount, quantity_percent, price_percent}` as decimal strings, used for the capture screen's match preview)
- `/api/invoices/{id}/activity/` (GET, read-only detail for the invoice drawer → `{invoice, match_type, purchase_order_number, match_tolerances, lines, approvals, payment, audit, restricted}`; see below)
- `/api/invoices/bulk/`
- `/api/invoices/email/`
- `/api/invoices/ocr-preview/`
- `/api/invoices/{id}/validate/`
- `/api/invoices/{id}/ocr/`
- `/api/invoices/{id}/submit_approval/`
- `/api/invoices/{id}/sync-erp/` (approved/paid invoices; configured ERP required)
- `/api/invoices/{id}/verify-gst/` (optional configured external GST provider)
- `/api/approval-rules/`
- `/api/approvals/` (each row also carries read-only invoice context: `vendor_name`, `invoice_total_amount`, `invoice_due_date`, `invoice_status`)
- `/api/approvals/reminders/`
- `/api/approvals/pending-count/` (GET → `{count}`: the caller's own PENDING/ESCALATED approvals on invoices awaiting approval; used for the sidebar badge)
- `/api/approvals/{id}/approve/`
- `/api/approvals/{id}/reject/`
- `/api/approvals/escalate-overdue/` (administrator only)
- `/api/notifications/`
- `/api/notifications/{id}/mark_read/` (recipient only)
- `/api/notifications/unread-count/` (GET → `{count}` of the caller's unread notifications)
- `/api/notifications/mark-all-read/` (POST → `{marked}`; marks all of the caller's unread notifications read)
- `/api/vendor-onboardings/` (optional `?vendor=<id>`; non-numeric → 400)
- `/api/vendors/{id}/approve_onboarding/` (administrator only)
- `/api/vendors/{id}/reject_onboarding/` (administrator only)
- `/api/payments/`
- `/api/payments/generate/`
- `/api/payments/{id}/mark_paid/` (local reconciliation/demo status action; not a bank transfer)
- `/api/payments/{id}/mark-failed/`
- `/api/payments/{id}/submit-bank/` (configured bank provider required)
- `/api/integrations/status/`
- `/api/integration-deliveries/` (administrator only)
- `/api/inbound-emails/` (read-only ingestion history)
- `/api/audit-logs/` (optional `?entity_type=<Model>` and `?entity_id=<id>`; non-numeric id → 400)
- `/api/dashboard/`
- `/api/reports/?kind=aging|invoice-status|exceptions|gst|audit`

Payment responses include the generated `advice` text. The frontend exposes it from each payment record. Bulk capture returns successfully created invoice IDs and per-file errors; incomplete OCR captures are stored with `VALIDATION_FAILED` and review exceptions rather than silently discarded. The email attachment endpoint uses the same file validation and OCR extraction path.

OCR preview returns page text, Tesseract word confidence, labeled field suggestions, and conservative material-row suggestions. Rule-based suggestions are used by default. An optional local Ollama-compatible model may provide draft semantic suggestions if configured; all suggestions require human review.
Dashboard `aging` buckets are by days overdue: `Not yet due`, `0-30`, `31-60`, `61-90`, `90+` (91 or more), each with `amount` and `count`. The dashboard extraction-accuracy percentage (`verified_extraction_accuracy`, with `verified_extraction_field_count`) uses `InvoiceFieldVerification` human review records (correct suggestions / reviewed fields); it is `0` with no reviewed fields and is not Tesseract confidence. Invoice screens separately display Tesseract word confidence.

IMAP mailbox polling and SMTP delivery are management commands rather than HTTP endpoints:

- `python manage.py ingest_email_invoices --once`
- `python manage.py send_ap_notifications`
- `python manage.py process_approvals`

Provider endpoints and bearer tokens are configured using the optional variables in `backend/.env.example`. Missing configuration returns an explicit service-unavailable response for outbound API actions; no live service credentials are included.

Dashboard fields added for the redesigned dashboard (additive; existing fields unchanged):

- `outstanding_amount`, `outstanding_count`: unpaid invoices with a due date (`PENDING_APPROVAL`, `APPROVED`, `MATCHED`); equals the sum of the `aging` buckets.
- `average_ocr_confidence` (null when no invoice was OCR-captured), `ocr_confidence_invoice_count`, `ocr_review_pending_count`: Tesseract engine confidence averaged over OCR-captured invoices. A confidence, not accuracy.
- `attention`: the caller's work queue, with only the sections their role can act on or audit. ADMIN gets all three; AP_CLERK gets `exceptions`; APPROVER gets `my_approvals`; ACCOUNTANT gets `payments_due`; AUDITOR gets `exceptions` and `payments_due`.
  - `my_approvals`: `{count, items[{approval_id, invoice_id, invoice_number, vendor_name, total_amount, status, due_at, overdue}]}`. Lists the caller's actionable steps, oldest deadline first.
  - `exceptions`: `{count, items[{invoice_id, invoice_number, vendor_name, total_amount, exception, updated_at}]}`.
  - `payments_due`: `{count, amount, due_before, items[{invoice_id, invoice_number, vendor_name, total_amount, due_date, overdue, payment_status}]}`. Covers approved invoices due within 7 days, including overdue ones.

Each section lists at most 5 items.

### Invoice workspace (additive)

`POST /api/invoices/ocr-preview/` `fields` (and the stored `ocr_suggestions`) may include `field_confidence`, present when Tesseract word data was available:
`{invoice_number|invoice_date|due_date|subtotal|tax_amount|total_amount|gstin: {score, level, source}, line_items: [{score, level, source}]}`.
`score` is the mean Tesseract word confidence (0-100) of the OCR line the value was read from. `level` is `high` (>= 85), `medium` (>= 60), `low`, or `missing` (not found). `source` is `ocr`, `model` (filled in by the local model, so no OCR line was scored and `level` is `low`) or `none`.

`GET /api/invoices/{id}/activity/` uses the invoice's normal read scoping (404 outside it). Sections follow the existing read rules, and a section the role can't read elsewhere is `null` and is named in `restricted`:
- `lines` (every role): `[{line_id, description, quantity, unit_price, tax_rate, amount, po_line: {id, description, quantity, unit_price, received_quantity} | null, receipts: [{grn_id, grn_number, received_date, quantity}], previously_invoiced_quantity, quantity_basis: "ordered"|"received", checks: {description, unit_price, quantity, amount: "ok"|"fail"}, status: "matched"|"mismatch"|"unlinked"|"not_required"}]`. These are the same checks `validate_and_match` runs; the invoice's `exceptions` remain authoritative.
- `approvals` (ADMIN, AUDITOR; APPROVER sees only their own steps and gets `other_approvals` in `restricted`): `[{id, sequence, parallel, rule_name, approver_name, status, due_at, decided_at, comments}]`.
- `payment` (ADMIN, ACCOUNTANT, AUDITOR): the payment serializer output, or null when there is no payment yet.
- `audit` (ADMIN, AUDITOR): up to 100 AuditLog rows for the invoice, its approvals and its payment, newest first.


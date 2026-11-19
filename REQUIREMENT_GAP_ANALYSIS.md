# Templegate Technologies AP Automation — Requirement Gap Analysis

**Audit date:** 18 November 2026  
**Assignment source:** `/home/divum/Downloads/Accounts Payable automation.pdf`  
**Scope:** Read-only review of the existing React/Vite, Django REST Framework, and PostgreSQL project. No implementation files were changed for this audit. The only deliverable created is this report.

## 1. Executive summary

The project has a substantial local accounts-payable workflow: authenticated role-aware APIs; vendor onboarding; PO and GRN records; invoice upload and bulk capture; Tesseract OCR; rule-based field/line suggestions; validation; partial PO matching; sequential and parallel approvals; in-app notification records; payment requests and advice; dashboard endpoints; CSV reports; audit events; and optional provider connectors. It is a real implementation rather than a set of UI-only placeholders, and the repository contains tests for many important service and API paths.

It does **not yet satisfy the assignment end to end without qualifications**. OCR field identification is predominantly label/regex based; semantic extraction is an optional local-model path and was not exercised against a running model. GST verification, IMAP, SMTP, bank and ERP behavior depend on external endpoints/credentials and/or a scheduled command. Two-way matching checks PO/vendor totals but does not reconcile invoice lines against PO lines. Three-way matching has line/receipt checks but lacks full tolerance-based comparison and was not executed in this audit. The dashboard reports an OCR confidence average rather than measured extraction accuracy; its aging buckets include future due dates in the “0–30” bucket. Mobile layouts exist, but mobile approval behavior has not been tested. Payment “mark paid” is a local status change and does not transfer money.

**Readiness:** suitable for a local demonstration of the implemented workflow, with truthful disclosure of the limits below. Not demonstrated production-ready or fully assignment-compliant. The actual PostgreSQL-backed test suite and migration-history check could not be completed from this audit shell, and live provider behavior was not verifiable.

### Validation performed

| Command/action | Result |
|---|---|
| Read the assignment PDF with `pdftotext` | Requirements extracted and used as the audit checklist. |
| `cd backend && python3 manage.py check` | Passed: “System check identified no issues (0 silenced).” |
| `cd backend && python3 manage.py makemigrations --check --dry-run` | “No changes detected”; Django also warned it could not connect to PostgreSQL to check migration history. This verifies model/migration state, **not** the actual database’s applied migrations. |
| `cd backend && python3 manage.py test ap_app -v 1` | Not run to completion: Django found 27 tests, then could not connect to PostgreSQL while creating the test database (`psycopg2.OperationalError`). No test passed in this invocation. |
| `cd backend && python3 -m compileall -q ap_app ap_backend` | Passed (exit code 0). |
| `cd frontend && npm run build -- --outDir /tmp/ap-audit-vite-build` | Passed. Vite reports the main minified JS bundle is 701.94 kB (>500 kB warning). Output was directed to `/tmp`, leaving project build output alone. |
| `command -v tesseract`; `command -v pdftoppm` | Found `/usr/bin/tesseract` and `/usr/bin/pdftoppm` on the audit host. This does not prove OCR works for every input file or in another deployment environment. |
| PostgreSQL-backed app flow / provider calls | Not verified in this run. No secrets were read or printed. The previous user-provided terminal output says their local `migrate` and `runserver` succeeded, but this audit could not independently connect to that database. |

The test suite contains 27 tests, including API tests for vendor decisions, role enforcement, duplicate detection, PO/GRN/3-way capture, bulk uploads, OCR suggestion parsing, local-model response filtering, payment advice, escalation, integrations, IMAP ingestion, and sequential/parallel approvals. It does not include real OCR fixtures for each required format, a multi-page OCR fixture, mobile/browser tests, full dashboard/report assertions, or a running external provider contract test.

## 2. Requirement-by-requirement compliance

**Status meanings:** FULLY IMPLEMENTED means the code path is present and sufficiently complete for the stated local behavior; PARTIALLY IMPLEMENTED means important behavior is missing or materially limited; NOT IMPLEMENTED means no relevant implementation was found; CONFIGURATION REQUIRED means code exists but requires a provider/runtime configuration; NEEDS TESTING means implementation is visible but the requested behavior could not be verified in this audit.

### 1. Invoice Capture

| Requirement | Status | Evidence and audit finding |
|---|---|---|
| Upload PDF invoices | NEEDS TESTING | `backend/ap_app/services.py` accepts `.pdf`; `extract_ocr()` calls `pdf2image.convert_from_path`. `backend/ap_app/serializers.py` and `InvoiceViewSet.ocr_preview` validate extensions and size. `frontend/src/pages/Invoices.jsx` provides upload and preview. OCR was not exercised on a real PDF in this run. |
| Upload JPG/JPEG, PNG, and TIFF | NEEDS TESTING | Extension validation allows JPG/JPEG, PNG, TIF/TIFF; PIL `ImageSequence.Iterator` supports image frames in `extract_ocr()`. Tests exercise mocked OCR and rejection of unsupported files, not real OCR for each required format. |
| Drag-and-drop capture | PARTIALLY IMPLEMENTED | `frontend/src/pages/Invoices.jsx` has a drop zone whose `onDrop` calls OCR preview for the first dropped file. It previews/sets the file but does not provide an equivalent drop target for bulk invoice processing; no browser interaction test exists. |
| Email ingestion | CONFIGURATION REQUIRED | IMAP worker in `backend/ap_app/management/commands/ingest_email_invoices.py` polls unseen messages, matches sender email to vendor, and ingests supported attachments; `/api/invoices/email/` also accepts an uploaded attachment labeled EMAIL. Actual mailbox ingestion needs IMAP credentials, a valid `EMAIL_INGEST_USER`, and a running/scheduled command. No mailbox was configured. |
| Bulk invoice processing | FULLY IMPLEMENTED | `POST /api/invoices/bulk/` accepts up to 50 files, returns created IDs and per-file errors, and captures each file in its own transaction (`backend/ap_app/views.py`, `InvoiceViewSet.bulk`). `frontend/src/pages/Invoices.jsx` exposes multi-file selection. Tests cover successful capture, OCR unavailable, and unsupported format; database test execution was blocked. |
| Preserve incomplete OCR captures for review | FULLY IMPLEMENTED | `capture_invoice_upload()` creates a reviewable draft with exceptions and `VALIDATION_FAILED` when required values are missing or OCR is unavailable. Bulk test covers OCR-unavailable capture. |

### 2. OCR & AI Extraction

| Requirement | Status | Evidence and audit finding |
|---|---|---|
| OCR text extraction | NEEDS TESTING | `extract_ocr()` uses `pytesseract.image_to_data`; audit host has Tesseract and Poppler. OCR API is `POST /api/invoices/ocr-preview/`; text and confidence are stored on Invoice. No live OCR run completed. |
| Multi-page PDF OCR | NEEDS TESTING | PDF is converted to all pages and each is iterated with `[Page N]` markers in `backend/ap_app/services.py`. No multipage fixture/test was found; cannot certify page handling on real PDFs. |
| Read material/line items from invoice tables | PARTIALLY IMPLEMENTED | `extract_invoice_fields()` parses only text rows matching a narrow description/quantity/unit-price/amount pattern and arithmetic check. `InvoiceLine` stores lines; `Invoices.jsx` offers manual review/editing. This is not general table detection and does not reliably cover varied invoice layouts. |
| AI-based field identification | CONFIGURATION REQUIRED | An optional OpenAI-compatible loopback model path exists in `enrich_invoice_fields_with_local_model()` and is disabled without `LOCAL_LLM_MODEL`; `.env.example` documents Ollama-compatible setup. It fills missing deterministic suggestions only. No model runtime was available/configured and no actual AI extraction was verified. |
| Identify invoice number, dates, totals, GSTIN | PARTIALLY IMPLEMENTED | Label/regex extraction in `extract_invoice_fields()` recognizes common labels. It is layout- and language-dependent; missing values become a review exception or fallback value. There is no confidence calibrated per field. |
| Extract tables/line items using semantic AI | CONFIGURATION REQUIRED | Optional local model may suggest lines; it filters malformed/non-arithmetic lines. It does not replace deterministic values or perform PO-line mapping. Requires a running compatible local model and name. |
| Distinguish OCR confidence from extraction accuracy | PARTIALLY IMPLEMENTED | Code computes an average Tesseract word confidence. Dashboard key is `ocr_accuracy`, and UI calls it “OCR confidence” but the dashboard card label and README also use accuracy terminology. This is OCR engine confidence, not measured field accuracy. |

### 3. Invoice Validation Engine

| Requirement | Status | Evidence and audit finding |
|---|---|---|
| Mandatory invoice/vendor/date/amount validation | FULLY IMPLEMENTED | Model fields/serializer validation in `backend/ap_app/models.py` and `serializers.py`; `validate_and_match()` enforces invoice number/vendor, positive total, nonnegative tax, due-date order, and subtotal+tax arithmetic. Incomplete OCR capture is marked for review rather than silently approved. |
| Duplicate invoice detection | FULLY IMPLEMENTED | Serializer/service check plus DB unique constraint `(vendor, invoice_number)` in `Invoice.Meta`; duplicate API test exists. Concurrency behavior is protected by the database constraint, though database test could not run. |
| GSTIN/TIN validation | PARTIALLY IMPLEMENTED | GSTIN/PAN syntax is checked in `VendorSerializer`; matching also checks GSTIN regex. There is no TIN field or tax-authority validation by default. `POST /api/vendors/{id}/verify-gstin/` requires external GST provider URL/token. Syntax is not proof of an active/valid tax registration. |
| Amount/tax calculations | PARTIALLY IMPLEMENTED | Invoice subtotal + tax = total and invoice line amount arithmetic are checked. Tax rates and tax amounts are not recalculated or reconciled per line/jurisdiction; OCR line suggestions set `tax_rate=0`. |
| Vendor master validation | PARTIALLY IMPLEMENTED | Vendor code unique, GSTIN/PAN/IFSC formats validated, and inactive vendor rejected by match validation. Vendor bank fields are optional and not verified against a bank. GSTIN regex only checks format. |
| Validation result and exception handling | FULLY IMPLEMENTED | `POST /api/invoices/{id}/validate/` returns status/exceptions; exceptions are stored on invoice and exported. `Invoices.jsx` surfaces API errors. |

### 4. PO Matching (2-way and 3-way)

| Requirement | Status | Evidence and audit finding |
|---|---|---|
| PO/vendor relationship check | FULLY IMPLEMENTED | `validate_and_match()` ensures PO vendor matches invoice vendor and PO is selected for 2-way/3-way. Serializer blocks linking to non-open PO. |
| 2-way PO vs invoice matching | PARTIALLY IMPLEMENTED | It checks invoice total does not exceed PO total and the vendor matches. It does **not** compare invoice lines/descriptions/quantities/unit prices with PO lines or reconcile invoice amount against PO line totals. A test covers 3-way workflow, not a dedicated 2-way mismatch matrix. |
| 3-way PO vs GRN vs invoice | PARTIALLY IMPLEMENTED | Models connect PO lines, GRN lines, and invoice lines. `GRNSerializer` checks receipt lines belong to PO and cumulative received quantity does not exceed ordered quantity. `validate_and_match()` requires invoice line links, received quantity, and matching unit price. It does not fully compare descriptions, line totals/tax, configurable tolerances, or currency, and it is not independently tested against failure cases beyond GRN over-receipt. |
| Goods receipt capture | FULLY IMPLEMENTED | `POST /api/grns/`, `GRNSerializer` nested line validation, and atomic quantity updates with row locking. API test covers over-receipt rejection. |
| Match exceptions | FULLY IMPLEMENTED | Mismatches become `EXCEPTION` when a PO is selected and are exposed through invoice and exception-report APIs. |

### 5. Workflow & Approval Engine

| Requirement | Status | Evidence and audit finding |
|---|---|---|
| Configurable approval matrix | FULLY IMPLEMENTED | `ApprovalRule` contains amount range, approver, sequence, parallel flag, escalation hours; `/api/approval-rules/`; admin UI in `frontend/src/pages/Approvals.jsx`. Rule serializer validates range/approver. No overlap/gap warning is provided, so invoices outside all ranges fail submission explicitly. |
| Sequential approvals | FULLY IMPLEMENTED | `create_approval_steps()` creates ordered steps; approve/reject actions reject out-of-order decisions. Test `test_sequential_approval_blocks_later_step_until_earlier_approved` exists. |
| Parallel approvals | FULLY IMPLEMENTED | Rules at a parallel sequence are notified together; approvals remain pending until all are decided. Test `test_parallel_same_sequence_approvals_are_notified_together` exists. Database tests were blocked in this run. |
| Role-based approvals and permissions | PARTIALLY IMPLEMENTED | `APRolePermission` and approval queryset/action restrict approvers to assigned items; admin can act for any approval. Tests cover scope and role bypass. However, every authenticated role can use safe GET methods for most resources, including reading invoice/vendor data; vendor serializer returns bank account/IFSC. This is a broad sensitive-data exposure risk. |
| Escalation and reminders | CONFIGURATION REQUIRED | Due timestamps and `process_approval_deadlines()` create in-app reminders/escalations; command `python manage.py process_approvals` must be run/scheduled. SMTP email delivery needs credentials and `send_ap_notifications`. No scheduler is configured by the code. |
| Notification delivery | PARTIALLY IMPLEMENTED | Notifications persist in app and recipient-only read endpoint exists. Email worker exists but requires SMTP setup and command execution. Assignment’s operational notification expectation is therefore not automatic in a fresh installation. |
| Mobile approval support | NEEDS TESTING | `frontend/src/styles.css` has responsive breakpoints and a mobile navigation/table overflow layout. There are no device/browser tests to verify approval review and decision usability on mobile. |

### 6. Vendor Management

| Requirement | Status | Evidence and audit finding |
|---|---|---|
| Vendor master creation/maintenance | FULLY IMPLEMENTED | `Vendor`, `VendorSerializer`, `/api/vendors/`, and `frontend/src/pages/Vendors.jsx` create vendor master records. New vendors are pending onboarding. |
| Bank details | PARTIALLY IMPLEMENTED | Vendor model/UI capture bank name/account/IFSC, with IFSC syntax validation. Bank account is stored as plaintext and included by `VendorSerializer(fields="__all__")`; all authenticated roles can GET vendors. Masking/encryption and field-level authorization are absent. This needs security remediation before real banking data. |
| GST/TIN data | PARTIALLY IMPLEMENTED | GSTIN/PAN fields and format checks exist; no TIN identifier. Remote GSTIN status check is optional and requires credentials/provider contract. |
| Vendor onboarding/administrator decisions | FULLY IMPLEMENTED | Vendor creation creates `VendorOnboarding`; `approve_onboarding`/`reject_onboarding` are admin-only, activate/block vendor, notify submitter, and audit. Tests cover approval and non-admin denial. |
| External vendor portal/self-service | NOT IMPLEMENTED | No vendor user role or external vendor portal/API flow found. Assignment description asks vendor management/onboarding, which is internally performed by staff; if self-service is expected, this is a gap. |

### 7. Payment Processing

| Requirement | Status | Evidence and audit finding |
|---|---|---|
| Payment request generation | FULLY IMPLEMENTED | `POST /api/payments/generate/` creates one payment per approved invoice, reference, amount, and advice. Accountant role has action access; `Payments.jsx` exposes request generation. |
| Payment tracking/status | FULLY IMPLEMENTED | `Payment` status, bank reference, timestamps, read-only resource, dashboard counts/amount, and UI table are implemented. |
| Payment advice | FULLY IMPLEMENTED | Advice text is generated and returned by serializer; frontend displays it. |
| Local “mark paid” flow | PARTIALLY IMPLEMENTED | `POST /api/payments/{id}/mark_paid/` changes Payment and Invoice to PAID after a supplied reference. UI generates `DEMO-...` reference and explicitly says this does not transfer funds. This is only a demo/manual reconciliation action. |
| Banking integration / real transfer | CONFIGURATION REQUIRED | `submit-bank` posts payload to configured `BANK_API_URL` with bearer token and idempotency key, recording `IntegrationDelivery`; requires compatible, authorized provider API. Successful HTTP response sets PROCESSING, not confirmed settlement. No configured bank/provider was tested. |
| ERP/accounting integration | CONFIGURATION REQUIRED | `/api/invoices/{id}/sync-erp/` posts approved/paid invoice payload to `ERP_API_URL` with token/idempotency key. Provider-specific contract, credentials, and live acceptance were not verified. |

### 8. Dashboard Features

| Metric | Status | Evidence and audit finding |
|---|---|---|
| AP aging | PARTIALLY IMPLEMENTED | `GET /api/dashboard/` computes date buckets and UI charts them. The `0-30` query only has a lower date bound, so it includes invoices due more than 30 days in the future; buckets are not an accurate aging distribution. Status filter excludes exceptions and includes matched invoices. |
| Pending approvals | FULLY IMPLEMENTED | Counts pending and escalated approval records; displayed by Dashboard. |
| Processing turnaround | PARTIALLY IMPLEMENTED | Average created-to-updated elapsed hours for PAID invoices, not specifically processing duration/approval turnaround. `updated_at` can change after payment or other update. |
| OCR accuracy percentage | PARTIALLY IMPLEMENTED | Average Tesseract word confidence for nonzero OCR records; it is not field-extraction accuracy. This metric should be named and described accurately. |
| Vendor-wise analytics | FULLY IMPLEMENTED | Top ten vendor invoice total/count aggregates, displayed as vendor spend. It represents captured invoice totals, not necessarily approved or paid spend. |
| Payment tracking | FULLY IMPLEMENTED | Dashboard aggregates payment count and amount by status; payment page exposes individual rows. |
| All six metrics wired into frontend | FULLY IMPLEMENTED | `frontend/src/pages/Dashboard.jsx` renders aging, approvals, OCR confidence, turnaround, vendor spend, and payment records/status. Runtime data behavior was not DB-tested. |

### 9. Reports

| Report | Status | Evidence and audit finding |
|---|---|---|
| AP aging | FULLY IMPLEMENTED | `GET /api/reports/?kind=aging` exports vendor, invoice, due date, amount, days overdue for outstanding statuses. It does not bucket future/overdue aging and is inconsistent with the dashboard’s bucketing defect. |
| Invoice status | FULLY IMPLEMENTED | `kind=invoice-status` exports each invoice’s vendor, dates, amount, status. |
| Exception report | FULLY IMPLEMENTED | `kind=exceptions` exports invoices whose exception JSON is nonempty. |
| Audit log report | FULLY IMPLEMENTED | `kind=audit` exports timestamp, actor, action, entity, ID, details. Audit API is read-only; events are written from workflows. Tests include CSV download, but this run could not execute them. |
| GST/tax report | FULLY IMPLEMENTED | `kind=gst` exports vendor GSTIN and invoice tax amounts. This is a data report, not tax filing or tax correctness certification. |
| Frontend download for all five | FULLY IMPLEMENTED | `frontend/src/pages/Reports.jsx` lists and downloads the five CSV kinds. Actual DB data/export contents were not verified in this audit. |

## 3. Missing functionality

1. **Full AI extraction by default:** AI semantics are optional and require a local Ollama-compatible service and model. Without it, extraction is deterministic regex/row parsing. Neither path provides robust layout-aware table detection across arbitrary invoices.
2. **True 2-way line matching:** The implementation checks vendor and total ceiling but does not compare PO line items to invoice line items.
3. **Complete 3-way reconciliation:** PO/GRN/invoice quantities and prices have basic checks, but no configurable tolerance/variance rules or comprehensive line reconciliation were found.
4. **TIN and authoritative GST status:** No TIN field or built-in tax authority validation. External GST verification must be configured.
5. **Real bank settlement:** No bank integration can be considered live until configured and provider-tested; current manual paid operation is a local status transition.
6. **Automated scheduling:** Approval deadline processing is a command; a scheduler is not part of the project runtime configuration.
7. **Vendor self-service portal:** No external vendor login/onboarding workflow was found.
8. **Verified mobile behavior:** Responsive CSS exists, but touch/browser end-to-end approval testing does not.
9. **Verified supported-format and multipage OCR:** Code paths exist, but real PDF/JPG/PNG/TIFF and multi-page OCR tests were not executed.

## 4. Partially implemented functionality and technical findings

### Business behavior

- **Dashboard aging bug:** `backend/ap_app/views.py` applies `due_date__gte=now-30 days` for the first bucket but no `due_date__lte=now`; future invoices are counted as 0–30 days. Other buckets are also defined by due date but do not clearly state that future invoices are excluded. The dashboard can misstate aging.
- **Metric naming:** OCR engine word confidence is labeled `ocr_accuracy` in API/model and some docs, despite not measuring extraction correctness. Avoid presenting it as AI or field accuracy.
- **2-way matching is total-only:** no invoice-to-PO line comparison. 3-way matching requires invoice line linked PO lines, received quantity and exact unit price, but has no tolerance handling and lacks line-description/total reconciliation.
- **Tax checks are arithmetic/basic format:** subtotal + tax = total and format checks are useful, but the system does not calculate jurisdictional GST or verify actual registration status without a provider.
- **Approval command cadence:** reminders/escalation depend on `process_approvals` running periodically. A fresh setup will not send timed notifications automatically. SMTP notification delivery is another explicitly run command.
- **Partial OCR fallback:** upload capture uses a synthetic `CAPTURE-*` invoice number and zero values when OCR fails, then marks the invoice validation-failed. This is reviewable and safe from automatic approval, but users must correct the placeholder before submission.

### Security and API controls

- **Sensitive vendor data exposure:** `VendorSerializer` includes every model field, including bank account and IFSC. `APRolePermission` allows any authenticated user safe GET requests on most viewsets; approvers/auditors can therefore fetch vendor bank details. The UI displays bank name but this does not remove API exposure. Do not use real vendor bank data until field-level access/masking/encryption is addressed.
- **Production settings defaults:** `backend/ap_backend/settings.py` defaults `DEBUG=true`, `SECRET_KEY=development-only-change-me`, and local-only allowed hosts. `.env.example` documents placeholders, but deployment must set strong secret, `DEBUG=false`, and correct hosts. `manage.py check --deploy` was not run; production deployment readiness is not established.
- **Authentication:** JWT authentication is configured (8-hour access, 7-day refresh). Public registration always forces role `AP_CLERK`; password minimum length is 8 with similarity and length validators. No rate limiting/throttling or refresh rotation/blacklisting configuration was found. Production hardening and abuse testing remain.
- **Permissions are broad for reads:** role restrictions are strongest for write actions and approval records. General safe reads are allowed to authenticated roles; sensitive fields/data need narrower query/serializer policies.
- **Validation location:** Django serializer/business validation is used in API, but model `clean()` is not automatically invoked by ordinary `.save()`. API behavior is guarded by serializers/services; direct ORM/admin paths may bypass some model validation. Vendor is editable in Django admin and audit log is not registered there.
- **Error behavior:** OCR preview converts known OCR failures to 503; upload validation returns 400; provider failures return explicit 502/503. Frontend invoice/payment/approval screens surface many errors. Some list loading paths rely on `.finally()` and do not set a visible error state (for example initial invoice/vendor/PO loads and payment loads), so API/network failures can appear as empty screens. External ERP UI currently displays “Invoice synced…” on any HTTP-success response; server marks success on any 2xx provider result.
- **External endpoint trust:** ERP/bank/GST URLs are configurable and credentials are bearer tokens. Validate destinations/provider TLS and payload handling in deployment; no provider-specific signature/callback/settlement verification was found.
- **File handling:** extension and 25 MB checks exist, but MIME/content inspection, malware scanning, PDF page count/CPU bounds, and storage access policy were not verified. `backend/ap_backend/urls.py` serves media through Django’s `static()` helper in DEBUG mode; production media access/storage policy must be explicitly secured.

### Database and migrations

- Models use relational FKs for vendor–PO–invoice–payment, PO lines–GRN/invoice lines, approvals/rules/users, notifications and audit. Uniqueness includes vendor code, PO number, message ID, payment reference, vendor+invoice number, and approval uniqueness.
- Migration files exist: `0001_initial.py`, `0002_invoiceline_po_line.py`, `0003_vendoronboarding_inboundemail_integrationdelivery_and_more.py`.
- `makemigrations --check --dry-run` found no model changes, but could not query the database’s migration history. The user previously pasted a local “No migrations to apply” output; this report does not independently confirm that database state.
- No destructive schema migration was identified by file names/review. Actual PostgreSQL migration execution and data-preservation behavior were not repeated because the audit environment could not connect.

## 5. External configuration requirements

Configuration names are documented in `backend/.env.example`. This audit did not read or disclose `backend/.env` values.

| Capability | Required setup beyond code |
|---|---|
| PostgreSQL | Running PostgreSQL, valid local `POSTGRES_*` values, applied migrations, and a database role that can create a test database or an explicitly configured separate test DB. |
| OCR | Tesseract and Poppler installed on the backend host; audit host binaries exist, but production/container setup must install them too. |
| Semantic local extraction | Install/run Ollama-compatible service on loopback, pull model, set `LOCAL_LLM_MODEL` and optionally `LOCAL_LLM_BASE_URL`. No model is bundled. |
| Email invoice intake | `IMAP_HOST`, `IMAP_PORT`, `IMAP_USER`, `IMAP_PASSWORD`, matching vendor email, valid `EMAIL_INGEST_USER`; run/schedule `python manage.py ingest_email_invoices`. |
| Email notifications | SMTP host/user/password/from address; run/schedule `python manage.py send_ap_notifications`. |
| Reminders/escalation | Schedule `python manage.py process_approvals` at a chosen cadence. No cron/system scheduler is installed by application code. |
| Bank submission | Authorized compatible `BANK_API_URL` and `BANK_API_TOKEN`, provider contract/idempotency expectations, and provider testing. A 2xx submission only sets PROCESSING. |
| ERP posting | Compatible `ERP_API_URL`, token, field mapping and provider contract. |
| GST verification | Authorized GST verification URL and token with the response shape expected by the code (`{"valid": boolean}`). |
| Production deployment | Strong `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=false`, production `DJANGO_ALLOWED_HOSTS`, HTTPS/reverse proxy, secure media handling, backup/monitoring, and frontend API URL/CORS configuration. |

## 6. Bugs and technical issues discovered

| Priority | Issue | Impact / evidence |
|---|---|---|
| P0 | Vendor bank account and IFSC returned by general vendor API to any authenticated role | Sensitive financial data exposure. `VendorSerializer(fields="__all__")` plus `APRolePermission` safe-method allowance. |
| P1 | Dashboard “0–30” aging includes future-due invoices | Misleading AP aging metric; `backend/ap_app/views.py` bucket query omits upper due-date bound. |
| P1 | 2-way match does not compare invoice/PO lines | Quantity, unit price, or item mismatch can pass if invoice total remains under PO total. |
| P1 | Default Django settings are development unsafe | If deployed without env overrides, weak default secret and `DEBUG=true`; production checks not run. |
| P1 | Automated approval reminders are not automatic until command is scheduled | SLA/escalation requirements can silently lapse on a fresh deployment. |
| P2 | OCR confidence exposed/labeled as “accuracy” | Dashboard metric can be interpreted as field extraction accuracy when it is word confidence. |
| P2 | Test execution cannot be confirmed in this audit environment | All 27 tests require PostgreSQL test DB; connection failed before tests ran. |
| P2 | Frontend initial load errors may look like empty data | Several `load()` effects do not catch and render API errors, limiting diagnosis. |
| P2 | Local-model response with valid JSON but a non-object top level can raise an uncaught error | `enrich_invoice_fields_with_local_model()` parses JSON inside its guarded block, then immediately calls `suggestions.get(...)`; a JSON array/string is syntactically valid but has no `.get()`. Current tests cover valid object output and disabled model, not this malformed shape. |
| P2 | No observed real-format/multipage OCR test coverage | Extensions/code support formats, but failure modes and extraction quality are unknown. |
| P2 | Large frontend bundle warning (701.94 kB) | Build succeeds, but first-load performance may suffer on slower networks/devices. |
| P3 | No page-count/processing-time guard for large PDFs/TIFFs | 25 MB limit alone does not bound decompressed page count or OCR CPU time. |
| P3 | Vendor deletion allowed to AP clerks by action permission | FKs protect some related records, but policy may be too broad; validate intended lifecycle and test 409/protected behavior. |

## 7. Prioritized implementation roadmap

### P0 — Protect financial data and production secrets

1. Exclude/mask bank account and IFSC from general vendor serializers; add role/need-to-know access for full bank data, encryption at rest where appropriate, and audit access.
2. Require secure production configuration; fail startup/check when the development secret or `DEBUG=true` is used in production. Run Django deployment checks after configuring the actual deployment environment.

### P1 — Complete core financial controls

3. Correct dashboard aging bucket boundaries and define outstanding-status policy; add fixtures for future, current, 30/31/60/90+ day records.
4. Implement 2-way line matching and a documented variance/tolerance policy; make 3-way checks reconcile PO quantity/price/line totals/tax against receipt and invoice.
5. Add comprehensive validation tests for GST/tax arithmetic, vendor status, PO status, duplicate race, malformed/missing OCR values, and mismatches.
6. Decide whether notifications must be automatic; if so, deploy a managed scheduler/worker and alert on failed runs rather than relying on undocumented operator action.

### P2 — Meet capture and usability expectations

7. Add real image/PDF/TIFF and multipage OCR fixtures; add safe page/resource limits and content validation.
8. Confirm assignment expectation for AI: if semantic extraction is required, provision local inference and test it with representative redacted invoices; retain human review and store field-level confidence/provenance.
9. Add responsive browser tests for approval flow and improve visible loading/error states on all pages.
10. Rename/document OCR confidence accurately and define processing turnaround with explicit start/end events.

### P3 — Prove external integrations and operational readiness

11. Test IMAP/SMTP/GST/ERP/bank with sandbox provider accounts, provider contracts, retry/idempotency, failure callbacks, and audit trail. Never treat a bank 2xx response as settlement without provider confirmation.
12. Run the application against the user’s PostgreSQL instance, verify applied migrations, run full tests on an isolated test DB, confirm backup/restore, and publish only after deployment hardening.
13. Split the main frontend bundle (e.g. route-level lazy loading) and measure on representative mobile bandwidth.

## 8. Recommended tests by incomplete module

| Module | Recommended test cases |
|---|---|
| Invoice capture | Multipart API uploads with valid PDF/JPG/PNG/TIFF files; invalid extension, empty file, oversized file; drag/drop browser test; 50-file limit, mixed success/failure, duplicate in batch, bulk partial commit behavior; IMAP duplicate Message-ID and sender/vendor mismatch. |
| OCR & extraction | Real multipage PDF with page markers; JPG/PNG/TIFF and multi-frame TIFF; corrupt/encrypted PDF; Poppler/Tesseract unavailable; representative scans with tables, currencies, date layouts, GSTIN, line wraps; model disabled, timeout, malformed/non-object JSON, hallucinated totals, model-only fields. |
| Validation | Required/missing fields; duplicate vendor+invoice including concurrent inserts; GSTIN/PAN/IFSC format and invalid authority state; subtotal/tax/total rounding boundaries; line sum; inactive vendor; date ordering; errors appear in API and exception CSV. |
| PO matching | 2-way vendor mismatch, amount overrun, line description/quantity/price mismatch, partial invoices, tolerances and multiple invoices against a PO; 3-way partial receipts, multiple GRNs, overbilling received quantity, wrong PO line, exact and tolerated price variance, line/tax reconciliation. |
| Workflow | Multiple amount bands/gaps/overlaps; sequential cannot skip; parallel all-approve/reject combinations; unauthorized approver; admin override; rejection notification; escalated approval behavior; reminder dedupe; command repeat/idempotency and scheduler health. |
| Vendor | Onboarding approve/reject/duplicate decision; role access; bank account serialization and masking across all roles; authorized user updates; field validation; external GST provider timeout/invalid schema/success. |
| Payments | Only approved invoices; duplicate generation race; advice content; mark-paid requires reference and does not imply transfer; accountant/admin permissions; bank 4xx/5xx/timeout/2xx handling; idempotent retry; settlement callback/reconciliation; payment CSV/dashboard agreement. |
| Dashboard | Each metric against deterministic DB fixture; future due date excluded from overdue buckets; exact day boundaries; paid/exception/cancelled statuses; OCR confidence semantics; turnaround event definitions; vendor grouping; payment totals. |
| Reports/audit | Assert CSV headers, row values and empty reports for all five kinds; timezone and escaping; audit every mutation and failed decision policy; verify read-only API and retention/immutability policy; sensitive data absent from exports unless authorized. |
| Security/API/frontend | Anonymous vs authenticated endpoints; role matrix for all methods; object-level access; registration cannot self-assign privileged role; JWT expiry/refresh; throttling; upload content limits; frontend API outage errors; mobile viewport approval interaction. |

## 9. Final assessment of assignment readiness

**Overall: PARTIALLY IMPLEMENTED; not yet verified as fully compliant.** Most named modules have real backend models, endpoints, frontend surfaces, and meaningful local behavior. Several assignment features are only basic versions (OCR/table understanding, line matching, dashboard aging, GST/TIN validation), while integrations require configuration and operational scheduling. The most important immediate concern is exposing vendor banking fields to every authenticated role. The real PostgreSQL test suite did not run in this audit environment; therefore code evidence and existing test definitions must not be presented as a fresh passing test result.

Before describing the assignment as complete, address P0 security, fix and test dashboard aging, strengthen 2-way/3-way match rules, verify OCR on each required input format including multipage PDFs, exercise mobile approvals, and run all 27 tests plus migration checks against the intended PostgreSQL configuration. Configure and sandbox-test whichever external integrations are part of the expected demo, while clearly distinguishing provider submission from actual payment settlement. GitHub hosting, a deployed live URL, and the recorded demo video are submission deliverables outside the current local code and are not present as completed artifacts in this workspace.


## 10. Implementation follow-up (19 November 2026)

This section updates the 18 November baseline. The original audit rows above describe the code at that earlier point and must not be read as current where this section says a fix was made.

### Changes made

- Hardened employee provisioning: public registration responds with 403; administrators create inactive employees and activate/deactivate them through a dedicated API. Added `create_ap_admin` for initial bootstrap without printing passwords. JWT access/refresh lifetimes were shortened, refresh rotation/blacklisting enabled, password minimum raised, and request throttles added.
- Restricted resource writes by role and scoped approval/invoice access. General vendor API responses mask bank account and IFSC; administrator-only bank changes have masked change history and audit events. Audit exports and financial report endpoints are role-restricted.
- Added exact-upload duplicate detection per vendor, nullable invoice number/date capture for uncertain OCR, explicit invoice field corrections and human review records, GSTIN format/cross-check handling, and field-level verified extraction reporting. Tesseract confidence is labeled separately from measured extraction accuracy.
- Added configurable PO price/amount tolerances and line checks for 2-way and 3-way matching, vendor/PO identity checks, received/invoiced quantity limits, and readable exceptions. Critical matching errors block approval submission.
- Added payment method and status history, failure handling, local demo labeling, CSV report filters, CSV formula-injection mitigation, and dashboard aging buckets including future due invoices.
- Added bounded multi-page OCR work, clearer OCR failures, role-aware frontend actions, employee administration, invoice field/line review, and documented PostgreSQL/bootstrap setup. Added `.gitignore` rules for local environment secrets and generated files.

### Current verification evidence

| Command | Result |
|---|---|
| `cd backend && python3 -m compileall -q ap_app ap_backend` | Passed (syntax compilation). |
| `cd backend && python3 manage.py check` | Passed; no system-check issues. |
| `cd backend && python3 manage.py makemigrations ap_app` | Created additive `0006_vendorbankchange_new_bank_name_and_more.py`. |
| `cd backend && python3 manage.py makemigrations --check --dry-run` | Passed: no model changes pending. Django warned it could not reach PostgreSQL to verify migration history. |
| `cd backend && python3 manage.py test ap_app -v 1` | Did not execute tests: Django could not connect to PostgreSQL / create its test database (`psycopg2.OperationalError`). There are 30 discovered tests. |
| `cd frontend && npm run build -- --outDir /tmp/ap-frontend-build` | Passed. Vite reports the main JavaScript chunk is 721.59 kB and above its 500 kB advisory threshold. |

No database migration was applied in this audit environment; existing records were not modified. The actual local PostgreSQL migration state remains to be checked from the user's configured environment.

### Remaining partial/configuration-dependent requirements

- Semantic extraction depends on an installed local Ollama-compatible runtime and selected model. Without it, deterministic rule/regex suggestions remain; varied invoice layouts and robust table extraction are not guaranteed.
- External GST status, bank, ERP, IMAP and SMTP operations require authorized credentials/endpoints and provider contract tests. Bank processing acceptance is not settlement. Reminder/escalation and outbound email need scheduled management commands.
- PO amount/price tolerance is configurable, but jurisdiction-specific tax recalculation and real vendor/bank verification are not implemented. Matching behavior has not been database-backed test-executed in this environment.
- Responsive layout exists, but dedicated mobile browser/device interaction testing was not run.
- The database test suite cannot be claimed passing until it runs against a reachable PostgreSQL instance. Production/deployment readiness is not established by local compilation/build checks.

### Updated readiness assessment

The project has substantially improved security and workflow coverage and is suitable for a carefully labeled local demonstration after the new migrations are applied to the intended PostgreSQL database and the end-to-end flow is manually verified there. It is not yet proven fully compliant or production-ready: test execution is blocked by database connectivity, optional integrations are unconfigured, and general semantic OCR coverage/mobile interaction remain incomplete.

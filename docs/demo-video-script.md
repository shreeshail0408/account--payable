# Demo Video Recording Guide

Suggested length: 6–8 minutes. Record the running application and narrate the sections below. Use clearly labeled test records and avoid showing passwords, tokens, real bank account numbers, or real vendor/customer personal information.

## Walkthrough and narration

### 0:00–0:40 — Introduction and architecture

Show the landing/login screen. Explain that the project is an Accounts Payable workflow built with React and Vite, Django REST Framework, and PostgreSQL. The frontend calls authenticated REST endpoints using JWTs. Django applies role permissions and business validation; PostgreSQL stores the business records and audit events.

### 0:40–1:30 — Vendor onboarding

Show Vendors and create a clearly labeled test vendor. Explain that a newly submitted vendor is pending and an administrator reviews and approves onboarding. Show the masked bank display; do not expose a full account number. If available, show employee activation by the administrator. The app records the vendor relationship; it does not procure goods from the vendor automatically.

### 1:30–2:20 — Purchase order and receipt

Create a test purchase order with an item line. Explain that the business sends the PO to the supplier outside this app. Record a goods receipt after delivery and show how received quantities connect to PO lines.

### 2:20–3:30 — Invoice capture and matching

Capture an invoice and show the OCR preview, extracted text, editable suggestions, field-level corrections, and human review record. Explain that OCR uses Tesseract and PDF conversion uses Poppler. Field suggestions are rule-based by default; optional semantic extraction uses a separately installed local model. Show the 2-way or 3-way match and validation result. Make clear that the bundled sample image is for demonstration and is not a valid tax invoice.

### 3:30–4:30 — Approval workflow

Show the approval rule and assigned approver, submit the invoice, then review and approve or reject it. Explain sequential/parallel routing and role restrictions if configured in the demo environment.

### 4:30–5:15 — Payment request

Generate a payment request and show payment advice and status. State clearly that this local workflow records a request; it does not transfer funds. Bank submission works only when an authorized provider endpoint and credentials are configured.

### 5:15–6:00 — Dashboard, reports, and audit

Show dashboard aging (including future due dates), approval queue, approval turnaround, reviewed-field extraction accuracy, vendor spend, payment tracking and exceptions. Download invoice-status, aging, exception, GST/tax, and audit CSV reports. Explain that reports reflect database records and can be empty when no records match the report. Audit timestamps are shown in the configured application timezone.

### 6:00–7:00 — Challenges, design choices, and limits

Summarize OCR/PDF system dependencies, vendor and invoice validation, matching checks, database migrations, and role-scoped actions. Distinguish local working features from optional IMAP, SMTP, GST verification, ERP, and bank integrations that require provider configuration and scheduling. Point to `docs/database-schema.md` and `docs/challenges-and-solutions.md`.

## Before recording

- Start PostgreSQL, apply migrations, then start Django and Vite using the README setup.
- Confirm the demo flow works with the database you intend to show.
- Use test data that is clearly labeled. Do not mark a payment as paid unless it actually settled; a local status change is not a transfer.
- Close terminals or redact any `.env` values, passwords, tokens, private vendor data, and unrelated browser tabs.
- End with the repository/docs location and state whether external integrations are configured.

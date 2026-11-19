# Challenges and Solutions

## OCR environment dependencies

OCR requires a Tesseract binary and PDF conversion tools such as Poppler. The application separates OCR invocation into a service, supports bounded multipage documents, and stores extracted text and Tesseract word confidence. Field extraction accuracy is separately calculated from human-verified field comparisons; OCR confidence is never treated as accuracy. If the binaries are unavailable, OCR is reported as unavailable; production should install Tesseract/Poppler in the server container. A valid demo invoice image is in `docs/assets/sample-invoice.png`.

Rule-based material-row suggestions are used when description, quantity, unit price, and amount parse and quantity multiplied by price matches the row amount. An optional local semantic extraction path can be enabled with an Ollama-compatible local model by setting `LOCAL_LLM_MODEL` and `LOCAL_LLM_BASE_URL` in `backend/.env`. The URL is restricted to HTTP loopback, and the model is called only when a model name is configured. The backend sends OCR text to that local runtime, validates its JSON suggestions and arithmetic-consistent lines, and falls back to rule-based extraction if the endpoint is unavailable. Users still review all suggestions; 3-way matching requires mapping each line to its PO line. Install Ollama and obtain a model separately; no model weights or runtime are bundled.

## Email ingestion

No mailbox credentials were supplied. The application supports optional IMAP polling for unread PDF/image attachments, matching sender addresses to vendor records, OCR extraction, duplicate-message tracking, and invoice capture. Configure mailbox credentials in the backend environment and run `python manage.py ingest_email_invoices --once` or schedule the polling command. Sender matching and OCR-derived values still require review; uncertain or incomplete extraction is marked for validation.

## Banking integration

No bank credentials or provider contract were supplied. An optional credential-based bank connector submits payment details with an idempotency key and records delivery outcomes. The integration reports an explicit configuration/provider error when unavailable; the local demo payment action does not transfer funds. Provider-specific authentication, payload, and certification must be confirmed before production use.

## ERP/accounting integration

No ERP vendor or API details were supplied. An optional configured ERP endpoint receives approved invoice payloads with idempotency keys, and every delivery outcome is recorded. Provider-specific field mapping and credentials remain deployment inputs.

## Approval scheduling and notifications

The app stores in-app notifications and supports optional SMTP delivery. `process_approvals` must be scheduled by the operator to issue due-soon reminders and escalate overdue approvals; the system does not assume a scheduler is installed. `send_ap_notifications` delivers unsent notifications when SMTP is configured.

## GST verification

Local GSTIN format validation is available. Remote GST-status checks require the organization's authorized provider URL and credentials and are not represented as a live check until configured.

## Security, secrets, and verification limits

Public registration is disabled. An administrator bootstraps the first admin and provisions employees, which start inactive. General vendor listings return masked bank account/IFSC values; bank changes are administrator-only and stored in a masked change history. Local `.env` files and generated artifacts are ignored by `.gitignore`; use `backend/.env.example` only as the configuration template.

Backend checks and frontend production compilation can run without external provider credentials, but the Django test suite needs a reachable PostgreSQL service and permission to create the test database. A successful local test result must be reported only after that test command completes. Mobile responsive CSS is present, but device/browser testing remains a separate verification step.

## Duplicate, tax and vendor rules

Invoice uniqueness is enforced by a database constraint. GST and invoice fields receive application validation, and vendor activity is validated before matching.

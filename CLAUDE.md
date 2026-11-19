# CLAUDE.md

Accounts Payable automation ("PayFlow AP"): invoice capture + OCR, validation, PO 2-way/3-way matching, approval routing, vendor onboarding, payments, dashboard and CSV reports.

## Stack

- **Backend:** Python 3, Django 4.2, Django REST Framework, SimpleJWT (rotating refresh tokens), drf-spectacular (Swagger), django-cors-headers, PostgreSQL (psycopg2), Tesseract via pytesseract + pdf2image + Pillow.
- **Frontend:** React 18, Vite 6, react-router-dom 6, axios, recharts, lucide-react. Plain CSS (no Tailwind/CSS-in-JS). No TypeScript, no frontend test runner or linter configured.
- **Optional integrations** (off unless configured in `backend/.env`): local Ollama-compatible LLM, IMAP intake, SMTP, ERP, bank, GST verification.

## Running

Backend (PostgreSQL must be running; configure `backend/.env` from `.env.example`):

```bash
cd backend
python3 -m pip install -r requirements.txt
python3 manage.py migrate
python3 manage.py create_ap_admin          # first admin, interactive
python3 manage.py runserver 0.0.0.0:8000   # API http://localhost:8000/api/, Swagger /api/docs/
```

Management commands: `ingest_email_invoices --once|--poll-seconds N`, `send_ap_notifications`, `process_approvals`, `seed_demo` (local only; needs `DEBUG=true`, `AP_ALLOW_DEMO_SEED=true`).

Frontend (`VITE_API_URL` in `frontend/.env`, default `http://localhost:8000/api`):

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
npm run build    # production build check
```

Tests (backend only; need a reachable PostgreSQL to create the test DB):

```bash
cd backend
python3 manage.py test ap_app -v 2
python3 manage.py check
python3 manage.py makemigrations --check --dry-run
```

For frontend changes, at minimum run `npm run build` to confirm it compiles.

## Folder structure

```
backend/
  ap_backend/          settings.py (DRF config: JWT, PageNumberPagination PAGE_SIZE=20, Search/Ordering filters, throttles), urls.py
  ap_app/
    models.py          User(role), Vendor, VendorOnboarding, VendorBankChange, PurchaseOrder, POLine,
                       GoodsReceipt, GRNLine, Invoice, InvoiceLine, InvoiceFieldVerification,
                       ApprovalRule, Approval, Payment, PaymentStatusEvent, AuditLog, APNotification,
                       IntegrationDelivery, InboundEmail
    views.py           ViewSets + function views (auth, employees, dashboard, reports, integrations)
    serializers.py     DRF serializers (vendor bank fields masked in general responses)
    services.py        OCR, field extraction, capture, validate_and_match, approval steps, deadlines, audit()
    permissions.py     APRolePermission: per-resource read roles and per-action write roles
    integrations.py    ERP / bank / GST / SMTP connectors
    management/commands/
    tests.py
frontend/src/
  main.jsx             Router + CSS imports
  App.jsx              AuthContext (useAuth), Shell (sidebar, notifications, topbar), Protected routes
  services/api.js      axios instance, bearer token, 401 -> refresh -> retry, else logout
  components/UI.jsx    PageHeader, Modal, Status, Loader, Empty
  pages/               Login, Dashboard, Invoices, Vendors, PurchaseOrders, GoodsReceipts,
                       Approvals, Payments, Reports, Employees
  styles.css, line-items.css, notifications.css
docs/                  api.md, database-schema.md, challenges-and-solutions.md, demo-video-script.md, assets/
```

## Roles

Enforced server-side in `backend/ap_app/permissions.py`; the frontend only hides UI (`App.jsx` nav `items`, `Protected roles`, per-page `user.role` checks). Keep both in sync.

| Role | Can do |
|---|---|
| `ADMIN` | Everything: employees, approval rules, vendor onboarding decisions, bank details, vendor block/activate, escalate overdue, ERP sync, integration deliveries. |
| `AP_CLERK` | Read/write vendors (create/update), POs, GRNs (create), invoices (create, update, OCR preview, bulk, email, validate, submit approval, review extraction). |
| `APPROVER` | Read invoices and only approvals assigned to them; approve/reject. |
| `ACCOUNTANT` | Read vendors, invoices, payments; generate / mark paid / mark failed / submit-to-bank payments; verify vendor GSTIN. |
| `AUDITOR` | Read-only: vendors, POs, GRNs, invoices, approvals, payments, audit logs, onboardings, inbound emails; reports. |

## API endpoints used by the frontend

All under `/api/`, bearer JWT. List endpoints are paginated (`{count, next, previous, results}`); the frontend reads `data.results || data`. Search via `?search=`.

| Area | Endpoints |
|---|---|
| Auth | `POST auth/login/` (returns `access`, `refresh`, `user`), `POST auth/refresh/` |
| Employees | `GET/POST employees/`, `PATCH employees/{id}/activation/` `{is_active}` |
| Notifications | `GET notifications/`, `POST notifications/{id}/mark_read/` |
| Dashboard | `GET dashboard/` → `aging`, `invoice_status`, `payment_status`, `vendor_analytics`, `pending_approvals`, `verified_extraction_accuracy`, `verified_extraction_field_count` (deprecated aliases `ocr_accuracy`, `ocr_verified_field_count`), `processing_turnaround_hours`, `exceptions_count` |
| Vendors | `GET/POST vendors/`, `GET/POST vendors/{id}/bank-details/`, `GET vendors/{id}/full-bank-details/` (ADMIN/ACCOUNTANT, audited; not yet used by UI), `POST vendors/{id}/approve_onboarding/`, `POST vendors/{id}/reject_onboarding/` `{comments}`, `POST vendors/{id}/set-status/` `{status}`, `POST vendors/{id}/verify-gstin/` |
| Purchase orders | `GET/POST purchase-orders/` (optional nested `lines`) |
| Goods receipts | `GET/POST grns/` (`lines: [{po_line, quantity}]`) |
| Invoices | `GET/POST invoices/` (multipart, `line_items` JSON string), `PATCH invoices/{id}/`, `POST invoices/ocr-preview/`, `POST invoices/bulk/` (`vendor`, `files[]`), `POST invoices/{id}/submit_approval/`, `POST invoices/{id}/review-extraction/` `{confirmed}`, `POST invoices/{id}/sync-erp/` |
| Approvals | `GET approvals/`, `GET approvals/reminders/`, `POST approvals/{id}/approve/`, `POST approvals/{id}/reject/` `{comments}`, `POST approvals/escalate-overdue/`, `GET/POST/DELETE approval-rules/`, `GET approval-rules/approvers/` |
| Payments | `GET payments/` (includes `advice`, `status_events`), `POST payments/generate/` `{invoice, payment_method}`, `POST payments/{id}/mark_paid/` `{bank_reference}`, `POST payments/{id}/mark-failed/` `{reason}`, `POST payments/{id}/submit-bank/` |
| Reports | `GET reports/?kind=aging|invoice-status|exceptions|gst|audit` (+ `search`, `date_from`, `date_to`, `vendor`, `status`; CSV blob), `GET integrations/status/`, `GET integration-deliveries/` |

Full list: `docs/api.md` and Swagger at `/api/docs/`.

## Coding rules

1. **Readable multi-line JSX.** One element/prop group per line when it doesn't fit comfortably; no one-line components, no chains of `&&`/ternaries crammed into a single line. Extract sub-components and handlers instead of inlining large arrow functions. Existing pages are dense one-liners; reformat the parts you touch.
2. **No minified source CSS.** Source stylesheets are formatted one declaration per line. `styles.css` is currently minified; when editing it, expand the touched rules (or the whole file in a dedicated formatting change). Only `dist/` may contain minified output.
3. **Every page handles loading, error and empty states.** Show `<Loader/>` while fetching, a visible `alert error` when a request fails (never let a failed load look like an empty list), and `<Empty/>` with a helpful message when there is no data. This applies to secondary fetches (dropdown sources, integration status) too.
4. **Never break existing API contracts.** Don't rename/remove endpoints, fields, query params, payload shapes, status values or role names. Backend changes must be additive and backward compatible; frontend changes must work with the current API. If a contract change is unavoidable, stop and ask.
5. Role checks: server-side permission is the source of truth; any UI gating must match `permissions.py`.
6. Surface API errors via DRF `detail` or flattened field errors (see `formatApiError` in `Invoices.jsx`); don't swallow them.
7. Don't present demo/local actions (e.g. "Record demo payment") or unconfigured integrations as real money movement or live verification.
8. Don't commit secrets; `backend/.env` is local only.

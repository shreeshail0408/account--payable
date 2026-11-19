# CLAUDE.md

Accounts Payable automation ("PayFlow AP"): invoice capture + OCR, validation, PO 2-way/3-way matching, approval routing, vendor onboarding, payments, dashboard and CSV reports.

## Stack

- **Backend:** Python 3, Django 4.2, Django REST Framework, SimpleJWT (rotating refresh tokens), drf-spectacular (Swagger), django-cors-headers, PostgreSQL (psycopg2), Tesseract via pytesseract + pdf2image + Pillow.
- **Frontend:** React 18, Vite 6 (JS, no TypeScript), react-router-dom 6, axios, recharts, lucide-react. Styling: Tailwind CSS v4 (`@tailwindcss/vite`) + shadcn/ui-style components on Radix primitives, sonner (toasts), cmdk (command menu). Legacy plain CSS still styles un-migrated pages. No frontend test runner or linter configured.
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
frontend/
  vite.config.js       react + tailwind plugins, `@` -> src alias (jsconfig.json mirrors it)
frontend/src/
  main.jsx             ThemeProvider, TooltipProvider, Router, Toaster, CSS imports
  App.jsx              routes: React.lazy page per chunk, RequireAuth -> AppShell, RequireRole (nav.js roles),
                       LegacyPage wrapper for un-migrated pages; re-exports useAuth for legacy imports
  auth.jsx             AuthProvider, useAuth {user, signIn, logout}, ROLE_LABELS
  layout/              nav.js (NAV_ITEMS/NAV_GROUPS/MOBILE_TABS, roles per page: the single source for nav
                       + route guards), AppShell, Sidebar (collapsible, `[` key), Topbar (breadcrumb),
                       CommandPalette (Ctrl/⌘K, downloaded on first open; ?search= on invoices/vendors/POs), NotificationsMenu,
                       UserMenu (theme), MobileTabBar, RouteErrorBoundary, PageFallback, LegacyPage,
                       useShellData (polled pending-approvals + unread counts)
  hooks/               useDebouncedValue, useLocalStorageState, useMediaQuery, useUrlIntent (?search=, ?new=1)
  services/api.js      axios instance, bearer token, 401 -> refresh -> retry, else logout
  styles/theme.css     design tokens (light + dark CSS variables), Tailwind theme mapping, scoped base
  lib/utils.js         cn() class merge
  lib/api-errors.js    apiErrorMessage(error, {fallback, forbidden}): network/403/5xx/DRF field errors -> text
  lib/format.js        formatCurrency (INR, en-IN), formatCurrencyCompact, formatNumber, formatPercent,
                       formatDate, formatDateTime, daysFromToday
  components/ui/       Button, Input, Textarea, Label, Select, Badge, Card, Dialog, Sheet, DropdownMenu,
                       Tabs, Tooltip, Skeleton, Table, Toast (sonner), Command (cmdk)
  components/status-badge.jsx  StatusBadge: every backend status -> label, color, icon (pass `kind`)
  components/states.jsx        LoadingState, EmptyState, ErrorState
  components/amount.jsx        <Amount value/> (formatted INR, tabular numbers)
  components/theme-provider.jsx  light/dark/system, `dark` class on <html>, default light
  components/UI.jsx    LEGACY: PageHeader, Modal, Status, Loader, Empty
  pages/               Login, Dashboard (migrated; cards in pages/dashboard/), Invoices, Vendors, PurchaseOrders, GoodsReceipts,
                       Approvals, Payments, Reports, Employees (all legacy CSS for now),
                       Styleguide (ADMIN-only /styleguide, renders every new component)
  styles.css, line-items.css, notifications.css   LEGACY, delete after every page is migrated
  styles/legacy-bridge.css   shell <-> legacy overrides (.legacy-page light island); delete with the legacy CSS
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
| Notifications | `GET notifications/`, `GET notifications/unread-count/`, `POST notifications/{id}/mark_read/`, `POST notifications/mark-all-read/` |
| Dashboard | `GET dashboard/` → `aging`, `invoice_status`, `payment_status`, `vendor_analytics`, `pending_approvals`, `verified_extraction_accuracy`, `verified_extraction_field_count`, `processing_turnaround_hours`, `exceptions_count`, `outstanding_amount/_count`, `average_ocr_confidence`, `ocr_review_pending_count`, `attention` (role-tailored work queue) |
| Vendors | `GET/POST vendors/`, `GET/POST vendors/{id}/bank-details/`, `GET vendors/{id}/full-bank-details/` (ADMIN/ACCOUNTANT, audited; not yet used by UI), `POST vendors/{id}/approve_onboarding/`, `POST vendors/{id}/reject_onboarding/` `{comments}`, `POST vendors/{id}/set-status/` `{status}`, `POST vendors/{id}/verify-gstin/` |
| Purchase orders | `GET/POST purchase-orders/` (optional nested `lines`) |
| Goods receipts | `GET/POST grns/` (`lines: [{po_line, quantity}]`) |
| Invoices | `GET/POST invoices/` (multipart, `line_items` JSON string; list filters `status=A,B`, `outstanding`, `aging`, `due_before`, `needs_review`, read from the page URL), `PATCH invoices/{id}/`, `POST invoices/ocr-preview/`, `POST invoices/bulk/` (`vendor`, `files[]`), `POST invoices/{id}/submit_approval/`, `POST invoices/{id}/review-extraction/` `{confirmed}`, `POST invoices/{id}/sync-erp/` |
| Approvals | `GET approvals/`, `GET approvals/pending-count/`, `GET approvals/reminders/`, `POST approvals/{id}/approve/`, `POST approvals/{id}/reject/` `{comments}`, `POST approvals/escalate-overdue/`, `GET/POST/DELETE approval-rules/`, `GET approval-rules/approvers/` |
| Payments | `GET payments/` (includes `advice`, `status_events`), `POST payments/generate/` `{invoice, payment_method}`, `POST payments/{id}/mark_paid/` `{bank_reference}`, `POST payments/{id}/mark-failed/` `{reason}`, `POST payments/{id}/submit-bank/` |
| Reports | `GET reports/?kind=aging|invoice-status|exceptions|gst|audit` (+ `search`, `date_from`, `date_to`, `vendor`, `status`; CSV blob), `GET integrations/status/`, `GET integration-deliveries/` |

Full list: `docs/api.md` and Swagger at `/api/docs/`.

## Coding rules

1. **Readable multi-line JSX.** One element/prop group per line when it doesn't fit comfortably; no one-line components, no chains of `&&`/ternaries crammed into a single line. Extract sub-components and handlers instead of inlining large arrow functions. Existing pages are dense one-liners; reformat the parts you touch.
2. **No minified source CSS.** Source stylesheets are formatted one declaration per line. `styles.css` is currently minified; when editing it, expand the touched rules (or the whole file in a dedicated formatting change). Only `dist/` may contain minified output.
3. **Every page handles loading, error and empty states.** Show `<LoadingState/>` (legacy: `<Loader/>`) while fetching, a visible `alert error` when a request fails (never let a failed load look like an empty list), and `<Empty/>` with a helpful message when there is no data. This applies to secondary fetches (dropdown sources, integration status) too.
4. **Never break existing API contracts.** Don't rename/remove endpoints, fields, query params, payload shapes, status values or role names. Backend changes must be additive and backward compatible; frontend changes must work with the current API. If a contract change is unavoidable, stop and ask.
5. Role checks: server-side permission is the source of truth; any UI gating must match `permissions.py`.
6. Surface API errors via DRF `detail` or flattened field errors (see `formatApiError` in `Invoices.jsx`); don't swallow them.
7. Don't present demo/local actions (e.g. "Record demo payment") or unconfigured integrations as real money movement or live verification.
8. Don't commit secrets; `backend/.env` is local only.

## Frontend design system

- New and migrated UI uses `src/components/ui` + Tailwind utilities and the tokens in `src/styles/theme.css`. Never hard-code hex/rgb colors; use token classes (`bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`, `text-danger`, `bg-success-subtle`, …). Every token has light and dark values.
- **Coexistence:** Tailwind preflight is not loaded globally. The reset only applies inside `data-ui` elements, so a migrated page's root must have `data-ui=""`. Portal components already set it. Legacy CSS is unlayered and beats Tailwind layers, so don't reuse legacy class names (`status`, `panel`, `modal`, `primary`, …) in new markup. Un-migrated pages render inside `<LegacyPage>` (light-only island, even in dark mode); a migrated page drops `legacy: true` in `App.jsx`. Once all pages are migrated, delete the three legacy stylesheets, `styles/legacy-bridge.css`, `layout/LegacyPage.jsx` and `components/UI.jsx`, switch `theme.css` to `@import "tailwindcss";`, remove the scoped reset and change the ThemeProvider default to `"system"`.
- Charts: recharts, colored with CSS variables (`fill="var(--chart-1)"`). Data palettes live in `theme.css` as raw tokens: `--stage-1..6` for invoice lifecycle stages (fixed order) and `--aging-0..4` for not-yet-due plus the overdue warning-to-danger ramp. Each has light and dark values and was checked with the dataviz palette validator. Reference raw tokens (`var(--stage-3)`) as literal strings; Tailwind drops theme variables whose names are only built at runtime. Every chart gets a legend or list beside it that carries the values and a keyboard path.
- Money: always `formatCurrency`/`<Amount>`; numeric table columns use `<TableHead numeric>`/`<TableCell numeric>` (right-aligned, tabular-nums). Dates: `formatDate`/`formatDateTime`.
- Statuses: always `<StatusBadge kind="invoice|payment|vendor|onboarding|approval|purchaseOrder|verification|delivery|inboundEmail|employee" status={value}/>`; add new backend statuses to `STATUS_MAP`.
- Spacing on an 8px grid (Tailwind steps 2/4/6/8/12…); 4px half-steps only inside controls. Cards are `rounded-lg` with a border, not heavy shadows.
- Feedback: `toast` from `@/components/ui/toast` after actions; `LoadingState`/`ErrorState`/`EmptyState` for data views; `Dialog` for short confirmations, `Sheet` for record details and long forms. No `window.prompt`/`confirm`.
- Radix `SelectItem` can't have `value=""`; use a sentinel like `"all"` and map it before calling the API.
- Review visual changes on `/styleguide` (ADMIN) in light and dark.

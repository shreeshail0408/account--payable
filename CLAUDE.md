# CLAUDE.md

Accounts Payable automation ("PayFlow AP"): invoice capture + OCR, validation, PO 2-way/3-way matching, approval routing, vendor onboarding, payments, dashboard and CSV reports.

## Stack

- **Backend:** Python 3, Django 4.2, Django REST Framework, SimpleJWT (rotating refresh tokens), drf-spectacular (Swagger), django-cors-headers, PostgreSQL (psycopg2), Tesseract via pytesseract + pdf2image + Pillow.
- **Frontend:** React 18, Vite 6 (JS, no TypeScript), react-router-dom 6, axios, recharts, lucide-react, @tanstack/react-table (DataTable), pdfjs-dist (invoice preview; lazy chunk). Styling: Tailwind CSS v4 (`@tailwindcss/vite`) + shadcn/ui-style components on Radix primitives, sonner (toasts), cmdk (command menu). Playwright (+ @axe-core/playwright) for e2e/accessibility tests; no unit-test runner or linter.
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

For frontend changes, at minimum run `npm run build` to confirm it compiles. For UI changes also run the e2e suite:

```bash
cd frontend
npx playwright install chromium   # once
npm run test:smoke    # login, dashboard, upload → review → submit, bulk upload, 375px approve, theme toggle
npm run test:a11y     # axe WCAG 2.1 AA (incl. contrast) on every page, light + dark, dialogs, keyboard, reduced motion
npm run screenshots   # regenerates docs/screenshots/ (light/dark × 1440/375)
npm run test:e2e      # all of the above
```

The e2e backend (`frontend/e2e/start-backend.sh`) DROPS and recreates the `ap_e2e` database and serves on :8020 (Vite on :5190); it never touches the dev database or :8000/:5173. `e2e/auth.setup.js` signs users in once (login is throttled to 30/hour per IP), takes the admin-created test users through the required password change, and seeds the PO/GRN the sample invoice matches.

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
  playwright.config.js e2e projects: setup -> smoke, a11y; screenshots (after smoke). webServers: e2e backend + Vite
  e2e/                 start-backend.sh, auth.setup.js, helpers.js (PAGES, USERS), smoke/a11y/screenshots specs
  vite.config.js       react + tailwind plugins, `@` -> src alias (jsconfig.json mirrors it)
frontend/src/
  main.jsx             ThemeProvider, TooltipProvider, Router, Toaster, CSS imports
  App.jsx              routes: React.lazy page per chunk, RequireAuth -> AppShell, RequireRole (nav.js roles)
  auth.jsx             AuthProvider, useAuth {user, signIn, logout}, ROLE_LABELS
  layout/              nav.js (NAV_ITEMS/NAV_GROUPS/MOBILE_TABS, roles per page: the single source for nav
                       + route guards), AppShell, Sidebar (collapsible, `[` key), Topbar (breadcrumb),
                       CommandPalette (Ctrl/⌘K, downloaded on first open; ?search= on invoices/vendors/POs), NotificationsMenu,
                       UserMenu (theme), MobileTabBar, RouteErrorBoundary, PageFallback,
                       useShellData (polled pending-approvals + unread counts)
  hooks/               useDebouncedValue, useLocalStorageState, useMediaQuery, useUrlIntent (?search=, ?new=1),
                       useListQuery (URL-synced filters + page), useRemoteData (loader -> {data, loading, error, reload};
                       keeps last good data), useReferenceList (all pages of a dropdown source, with error/truncation)
  services/api.js      axios instance, bearer token, 401 -> refresh -> retry, else logout
  styles/theme.css     design tokens (light + dark CSS variables), Tailwind theme mapping, base layer (full Tailwind + preflight)
  lib/utils.js         cn() class merge
  lib/api-errors.js    apiErrorMessage(error, {fallback, forbidden}): network/403/5xx/DRF field errors -> text;
                       fieldErrorsFrom(error, fields) -> {field: message} for inline form errors
  lib/money.js         toPaise/fromPaise/lineAmountPaise/toMilli: integer money and quantity arithmetic
  lib/pagination.js    fetchAllPages(path, params) -> {rows, truncated}; rowsOf(data)
  lib/format.js        formatCurrency (INR, en-IN), formatCurrencyCompact, formatNumber, formatPercent,
                       formatDate, formatDateTime, daysFromToday
  components/ui/       Button, Input, Textarea, Label, Select, Badge, Card, Dialog, Sheet, DropdownMenu, SegmentedControl,
                       Tabs, Tooltip, Skeleton, Table, Toast (sonner), Command (cmdk)
  components/status-badge.jsx  StatusBadge: every backend status -> label, color, icon (pass `kind`)
  components/states.jsx        LoadingState, EmptyState, ErrorState
  components/amount.jsx        <Amount value/> (formatted INR, tabular numbers)
  components/theme-provider.jsx  light/dark/system, `dark` class on <html>, default system
  components/data-table.jsx     DataTable (@tanstack/react-table; server or client pagination/sorting, row click,
                                mobile card renderer, meta.numeric), SortHeader, sortNumeric, Pagination
  components/page.jsx           Page (data-ui root + padding), PageHeader, DescriptionList, Section
  components/confirm-dialog.jsx ConfirmDialog (optional required comment; shows API errors inline)
  components/field.jsx, inline-alert.jsx, progress.jsx (Progress, QuantityProgress), search-input.jsx (debounced),
  timeline.jsx
  features/invoices/   Invoices (migrated): InvoicesPage, api.js, model.js (roles, URL filters, file limits, money,
                       validation, match preview, CSV), useInvoiceList (URL-synced query), InvoiceToolbar, InvoiceTable
                       (@tanstack/react-table, server sort/pagination), UploadDialog (drop zone; 1 file -> review,
                       many -> bulk), review/ (ReviewWorkspace split view, DocumentPreview + lazy pdf.js, fields,
                       LineItemsEditor, MatchPanel), detail/ (InvoiceDetailSheet, ApprovalStepper, LineMatchTable,
                       AuditTimeline, ExceptionCallouts)
  features/vendors/    VendorsPage, VendorDetailSheet (tabs: Profile, Bank (masked; audited reveal), GSTIN, Invoices,
                       Onboarding timeline), VendorFormDialog, BankDetailsDialog
  features/purchasing/ PurchaseOrdersPage + PoFormSheet/PoDetailSheet, GoodsReceiptsPage + GrnFormSheet/GrnDetailSheet
                       (line editors, running totals, received-vs-ordered progress)
  features/approvals/  ApprovalsPage (>=1024 table + preview pane, 768-1023 table + sheet, <768 MobileApproval cards),
                       DecisionForm, useDecision, InvoicePreview, RulesCard (ADMIN approval matrix)
  features/payments/   PaymentsPage (stage pipeline, ?stage=), PaymentDetailSheet (stepper, advice download, history),
                       RecordPaidDialog, GeneratePaymentDialog, DemoBadge
  features/reports/    ReportsPage (report cards, filters, CSV preview parsed client-side, export), IntegrationsCard
  features/employees/  EmployeesPage (last sign-in, Locked / Temporary password badges), EmployeeFormDialog (accounts are
                       created inactive), TemporaryPasswordDialog (admin reset; shown once)
  features/account/    ChangePasswordForm, ChangePasswordDialog (account menu), ChangePasswordPage (forced, /change-password)
  pages/               Login, Dashboard (cards in pages/dashboard/), thin re-exports of each features/* page,
                       Styleguide (ADMIN-only /styleguide, renders every shared component; page patterns in pages/styleguide/)
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
| Auth | `POST auth/login/` (returns `access`, `refresh`, `user` incl. `must_change_password`; 429 `{code: "account_locked"}` after repeated failures), `POST auth/refresh/`, `POST auth/change-password/` `{current_password, new_password}` (returns a fresh `access`, `refresh`, `user`; other sessions are revoked) |
| Employees | `GET/POST employees/` (rows add `last_login`, `must_change_password`, `is_locked`, `locked_until`), `PATCH employees/{id}/activation/` `{is_active}`, `POST employees/{id}/reset-password/` (ADMIN; returns `temporary_password` once) |
| Notifications | `GET notifications/`, `GET notifications/unread-count/`, `POST notifications/{id}/mark_read/`, `POST notifications/mark-all-read/` |
| Dashboard | `GET dashboard/` → `aging`, `invoice_status`, `payment_status`, `vendor_analytics`, `pending_approvals`, `verified_extraction_accuracy`, `verified_extraction_field_count`, `processing_turnaround_hours`, `exceptions_count`, `outstanding_amount/_count`, `average_ocr_confidence`, `ocr_review_pending_count`, `attention` (role-tailored work queue) |
| Vendors | `GET/POST vendors/`, `GET/POST vendors/{id}/bank-details/`, `GET vendors/{id}/full-bank-details/` (ADMIN/ACCOUNTANT, audited; the Bank tab's "Reveal"), `POST vendors/{id}/approve_onboarding/`, `POST vendors/{id}/reject_onboarding/` `{comments}`, `POST vendors/{id}/set-status/` `{status}`, `POST vendors/{id}/verify-gstin/`, `GET vendor-onboardings/?vendor=`, `GET audit-logs/?entity_type=Vendor&entity_id=` (ADMIN/AUDITOR; onboarding timeline) |
| Purchase orders | `GET/POST purchase-orders/` (optional nested `lines`) |
| Goods receipts | `GET/POST grns/` (`lines: [{po_line, quantity}]`) |
| Invoices | `GET/POST invoices/` (multipart, `line_items` JSON string; list filters `status=A,B`, `outstanding`, `aging`, `due_before`, `needs_review`, `vendor`, `date_from`, `date_to`, `ordering`, `page`, all read from the page URL), `GET/PATCH invoices/{id}/`, `GET invoices/{id}/activity/` (drawer: line match, approvals, payment, audit; role-restricted sections are null), `GET invoices/match-settings/`, `POST invoices/ocr-preview/` (`fields.field_confidence`), `POST invoices/bulk/` (`vendor`, `files[]`; the UI sends one file per request for per-file progress), `POST invoices/{id}/submit_approval/`, `POST invoices/{id}/review-extraction/` `{confirmed}`, `POST invoices/{id}/sync-erp/` |
| Approvals | `GET approvals/` (rows include `vendor_name`, `invoice_total_amount`, `invoice_due_date`, `invoice_status`), `GET approvals/pending-count/`, `GET approvals/reminders/`, `POST approvals/{id}/approve/`, `POST approvals/{id}/reject/` `{comments}`, `POST approvals/escalate-overdue/`, `GET/POST/DELETE approval-rules/`, `GET approval-rules/approvers/` |
| Payments | `GET payments/` (includes `advice`, `status_events`), `POST payments/generate/` `{invoice, payment_method}`, `POST payments/{id}/mark_paid/` `{bank_reference}`, `POST payments/{id}/mark-failed/` `{reason}`, `POST payments/{id}/submit-bank/` |
| Reports | `GET reports/?kind=aging|invoice-status|exceptions|gst|audit` (+ `search`, `date_from`, `date_to`, `vendor`, `status`; CSV blob), `GET integrations/status/`, `GET integration-deliveries/` |

Full list: `docs/api.md` and Swagger at `/api/docs/`.

## Coding rules

1. **Readable multi-line JSX.** One element/prop group per line when it doesn't fit comfortably; no one-line components, no chains of `&&`/ternaries crammed into a single line. Extract sub-components and handlers instead of inlining large arrow functions. Existing pages are dense one-liners; reformat the parts you touch.
2. **No minified source CSS.** Source stylesheets are formatted one declaration per line. Only `dist/` may contain minified output. Prefer Tailwind utilities over new CSS.
3. **Every page handles loading, error and empty states.** Show `<LoadingState/>` while fetching, `<ErrorState onRetry/>` or `<InlineAlert tone="danger" onRetry/>` when a request fails (never let a failed load look like an empty list), and `<EmptyState/>` with a helpful message and, where the role allows, a CTA when there is no data. This applies to secondary fetches (dropdown sources, integration status) too.
4. **Never break existing API contracts.** Don't rename/remove endpoints, fields, query params, payload shapes, status values or role names. Backend changes must be additive and backward compatible; frontend changes must work with the current API. If a contract change is unavoidable, stop and ask.
5. Role checks: server-side permission is the source of truth; any UI gating must match `permissions.py`.
6. Surface API errors via DRF `detail` or flattened field errors (`apiErrorMessage` / `fieldErrorsFrom` in `lib/api-errors.js`); don't swallow them.
7. Don't present demo/local actions (e.g. "Record demo payment") or unconfigured integrations as real money movement or live verification.
8. Don't commit secrets; `backend/.env` is local only.
9. Sign-in security: admin-created or admin-reset accounts have `must_change_password`; `APJWTAuthentication`
   (`ap_app/authentication.py`) answers every other endpoint with 403 `{code: "password_change_required"}` until
   `auth/change-password/` succeeds, and the frontend routes them to `/change-password`. Accounts lock for
   `LOGIN_LOCKOUT_MINUTES` after `LOGIN_LOCKOUT_ATTEMPTS` failures; an admin reset unlocks. Sign-ins
   (`login.succeeded/failed/blocked_locked`), password changes and resets are audit-logged; passwords never are.

## Frontend design system

- New and migrated UI uses `src/components/ui` + Tailwind utilities and the tokens in `src/styles/theme.css`. Never hard-code hex/rgb colors; use token classes (`bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`, `text-danger`, `bg-success-subtle`, …). Every token has light and dark values.
- Tailwind (with preflight) is loaded globally from `theme.css`; there is no legacy CSS. Page roots use `<Page>` (sets `data-ui`, kept for portal/compat hooks). Pages live in `src/features/<area>/` with `api.js` (endpoint calls) and `model.js` (roles mirroring `permissions.py`, validation, pure helpers); `src/pages/*` only re-export them.
- Charts: recharts, colored with CSS variables (`fill="var(--chart-1)"`). Data palettes live in `theme.css` as raw tokens: `--stage-1..6` for invoice lifecycle stages (fixed order) and `--aging-0..4` for not-yet-due plus the overdue warning-to-danger ramp. Each has light and dark values and was checked with the dataviz palette validator. Reference raw tokens (`var(--stage-3)`) as literal strings; Tailwind drops theme variables whose names are only built at runtime. Every chart gets a legend or list beside it that carries the values and a keyboard path.
- Money: always `formatCurrency`/`<Amount>`; numeric table columns use `<TableHead numeric>`/`<TableCell numeric>` (right-aligned, tabular-nums). Dates: `formatDate`/`formatDateTime`.
- Statuses: always `<StatusBadge kind="invoice|payment|vendor|onboarding|approval|purchaseOrder|verification|delivery|inboundEmail|employee" status={value}/>`; add new backend statuses to `STATUS_MAP`.
- Spacing on an 8px grid (Tailwind steps 2/4/6/8/12…); 4px half-steps only inside controls. Cards are `rounded-lg` with a border, not heavy shadows.
- Feedback: `toast` from `@/components/ui/toast` after actions; `LoadingState`/`ErrorState`/`EmptyState` for data views; `Dialog` for short confirmations, `Sheet` for record details and long forms. No `window.prompt`/`confirm`.
- Radix `SelectItem` can't have `value=""`; use a sentinel like `"all"` and map it before calling the API.
- Review visual changes on `/styleguide` (ADMIN) in light and dark.
- Accessibility (enforced by `npm run test:a11y`): text meets WCAG AA 4.5:1 in both themes. Primary-colored text uses `text-link` (not `text-primary`), solid destructive fills use `bg-danger-solid`, and colored text on a `*-subtle` background uses `text-*-subtle-foreground`. Icon-only buttons need `aria-label`. Interactive elements keep the `focus-visible:ring-[3px] focus-visible:ring-ring/35` ring. Use Radix `Tabs` only when they switch a `TabsContent` panel; use `SegmentedControl` for a plain choice. Scrollable regions must be focusable (`Table` does this automatically when it overflows).
- Motion: dialogs, sheets and pages (`animate-page-in`) animate briefly, and buttons scale slightly when pressed; `prefers-reduced-motion` turns all of these off (`theme.css`). Toast after every create, update, approve/reject and failed action.

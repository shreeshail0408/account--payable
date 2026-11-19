# Demo Video Recording Guide

Suggested length: 8–9 minutes. Record the running application and narrate the sections below. Use clearly labeled test records and avoid showing passwords, tokens, real bank account numbers, or real vendor/customer personal information.

Screens referenced below are in [`docs/screenshots/`](screenshots/) (light and dark, 1440px and 375px).

## Walkthrough and narration

### 0:00–0:40 — Introduction and architecture

Show the sign-in screen, then the dashboard. Explain that the project is an Accounts Payable workflow built with React and Vite, Django REST Framework, and PostgreSQL. The frontend calls authenticated REST endpoints using JWTs. Django applies role permissions and business validation; PostgreSQL stores the business records and audit events. Open the account menu and switch between light and dark to show both themes; the default follows the operating system.

### 0:40–1:30 — Vendor onboarding

Open Vendors and create a clearly labeled test vendor with **Add vendor**. Open it to show the detail drawer and its tabs:

- **Profile** — master data and status badges.
- **Bank details** — values stay masked; administrators and accountants can reveal them, and each reveal is written to the audit log. Do not reveal a real account on camera.
- **GSTIN** — the "Format valid" badge is a local format check. The **Verify** button appears only when a GST provider is configured; otherwise an info note says live verification is off.
- **Onboarding** — the status timeline (submitted, approved or rejected, status changes).

Approve the onboarding from the drawer footer and point out the confirmation dialog. Rejecting requires a reason, which the submitter sees.

### 1:30–2:20 — Purchase order and receipt

Open Purchase Orders → **Create PO**. Add two lines with **Add line**, show the per-line amount and the running lines total, and that the PO total follows the lines unless overridden. Save, open the PO, and use **Record goods receipt**. In the receipt form, use **Fill remaining quantities** and show the progress bars for received vs ordered (the lighter segment is this receipt). Back on the PO list, the Received column shows the same progress.

### 2:20–4:00 — Invoice capture and the OCR review screen

Use the bundled [sample invoice](assets/sample-invoice.png) (a demo document, not a valid tax invoice). Its PO number matches a PO you created with an "A4 paper" line (2 × ₹50, PO total ₹118 incl. tax).

1. Invoices → **Capture invoices**, drop the file. A single file goes straight to the review workspace; several files become a batch with per-file progress.
2. **Split view.** The document is on the left (zoom, rotate, fit; switch to **OCR text** to show the raw Tesseract output). Fields are on the right. On a phone the two panes become tabs.
3. **Confidence.** Each extracted field has a High / Medium / Low marker based on Tesseract word confidence for the line it came from; hover it for the percentage. The header shows the document's mean word confidence. Explain that this is engine confidence, not accuracy: accuracy on the dashboard comes from human field reviews.
4. **Vendor match.** The vendor was matched from the GSTIN on the invoice.
5. **Corrections.** Add the line item OCR did not pick up (description, quantity, unit price). The totals check updates live: lines total = subtotal, subtotal + tax = total.
6. **Matching.** Choose **3-way**, pick the PO. Lines link to PO lines by description, and the match preview shows ordered vs received vs invoiced per line before anything is saved.
7. The footer lists anything still to fix. Tick "I checked these fields…", then **Confirm & submit**. The toast confirms the invoice was sent for approval and the row shows *Pending approval*.

Open the invoice drawer to show the exception callouts (if any), line matching, approval stepper and audit timeline.

### 4:00–5:30 — Approvals, on desktop and on a phone

On desktop, open Approvals as the approver: a queue table with tabs (To decide / Open / All) and a preview pane with the invoice summary, line match and the approve/reject form. Administrators also see the approval matrix and **Process overdue**.

Then show **mobile approvals** (a requirement in the scope document). Use a phone, or browser dev tools at 375px:

1. Sign in as the approver. The bottom tab bar has Approvals; the badge shows how many wait.
2. Each invoice is a card: invoice number, vendor, large amount, due date and step. Overdue cards have a red border.
3. **View invoice details** opens a full-height sheet with the summary, exceptions, line match and approval steps.
4. The **Approve** and **Reject** buttons are full width and 48px tall. No swipe gestures are needed.
5. Tap **Reject**: the confirm button stays disabled until a reason is typed, because a rejection reason is required. Cancel.
6. Tap **Approve**: a bottom sheet opens within thumb reach. Optionally add a comment, then tap **Approve invoice**. A toast confirms, the card leaves the "To decide" list, and the empty state reads "You're all caught up".

### 5:30–6:30 — Payment request

Open Payments → **Generate payment request** for the approved invoice. Show the pipeline (Requested → Processing → Paid / Failed); each stage card filters the list. Open the payment: stepper, status history and the payment advice with **Download advice**.

State clearly: when no bank integration is configured, the page shows **"Demo mode – no real money transfer"** and the action is labeled **Record demo payment**. This only updates PayFlow's records and does not transfer funds. **Submit to bank** appears only when an authorized provider endpoint and credentials are configured.

### 6:30–7:30 — Dashboard, reports and audit

Show the dashboard: outstanding payables, aging chart with its legend, invoice status by stage, and the role-specific "Needs your attention" list. In Reports, pick each card (AP aging, Invoice status, Exceptions, Audit log, GST/tax), apply a vendor or date filter, show the preview table and **Export CSV**. Reports reflect database records and can be empty when nothing matches. Audit timestamps use the configured application timezone.

### 7:30–8:30 — Quality, challenges and limits

- Accessibility: every page is keyboard operable (skip link, ⌘/Ctrl+K command palette, visible focus rings) and passes automated WCAG 2.1 AA checks, including color contrast, in both themes. Animations respect *reduce motion*.
- Tests: backend unit tests plus Playwright smoke tests for sign-in, dashboard, single and bulk capture, mobile approval and the theme toggle.
- Distinguish local working features from optional IMAP, SMTP, GST verification, ERP and bank integrations that need provider configuration and scheduling. Point to `docs/database-schema.md` and `docs/challenges-and-solutions.md`.

## Before recording

- Start PostgreSQL, apply migrations, then start Django and Vite using the README setup.
- Create the demo data: a vendor whose GSTIN is `29ABCDE1234F1Z5`, an approval rule covering ₹118, and a PO numbered `PO-3WAY-DEMO-001` with one "A4 paper" line (2 × ₹50, total ₹118) plus a goods receipt for 2. `npm run test:e2e` sets up the same data on its own throwaway database if you want to rehearse.
- Confirm the demo flow works with the database you intend to show.
- Use test data that is clearly labeled. Do not mark a payment as paid unless it actually settled; a local status change is not a transfer.
- Close terminals or redact any `.env` values, passwords, tokens, private vendor data and unrelated browser tabs.
- End with the repository/docs location and state whether external integrations are configured.

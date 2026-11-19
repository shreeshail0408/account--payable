# UI Plan

Current state of each frontend page and the UX gaps to fix. Cross-cutting issues first, then per page.

## Cross-cutting

- **Pagination:** API pages at 20 rows; every list and every dropdown source (vendors, POs, approved invoices) only reads page 1. There are no paging controls, so data past row 20 is silently missing.
- **Silent load failures:** Invoices, Vendors, PurchaseOrders, GoodsReceipts and Payments `load()` only use `.finally()`, so a failed request shows "No records found". Secondary fetches (vendors/POs/integration status) have no error handling at all.
- **Code style:** all pages are dense one-line JSX; `styles.css` is minified. Reformat as pages are touched (see CLAUDE.md).
- **Native dialogs:** `window.prompt` is used for vendor rejection and payment failure reasons. Replace with in-app modals.
- **No success feedback:** creates/approvals/payments close the modal without a confirmation toast. ERP sync shows its success message in the red error alert.
- **No detail views:** there is no invoice, vendor, PO or GRN detail page; everything is a table row plus modals.
- **Topbar:** the global "Search records..." input does nothing. The notification unread dot only appears after the bell is opened once (no load on mount, no unread count).
- **Search:** inputs fire a request on every keystroke (no debounce) and reset `loading` only once.
- **Mobile:** wide tables only scroll horizontally; approval review on mobile has not been tested.
- **Missing pieces:** no 404 page (unknown routes redirect to `/`), no confirm step for destructive actions (delete rule, block vendor), modals have no focus trap or Esc-to-close.

## Pages

| Page | Currently shows | Missing UX |
|---|---|---|
| **Login** | Username/password form, specific error messages for network/401, loading button text. | Fine overall. Remove the stray `e.preventEvent?.()`. No show-password toggle. |
| **Dashboard** | 5 metric cards (pending approvals, verified extraction accuracy, processing time, payment records, open exceptions); charts for aging, invoice status (pie), payment status; top vendor spend list. Has loading and error states. | No empty state for charts or the vendor list on a fresh install. Pie chart has no legend or labels. Cards don't link to the filtered list. No currency format on chart axes. Same view for every role. |
| **Invoices** | Searchable table (number, vendor, due date, amount, OCR %, status). Bulk upload (vendor + files). Capture modal: fields, line items, drop zone with OCR preview and "Use suggestions". Review modal: editable fields/lines, OCR text, confirmation. Submit / Sync ERP actions. | Silent load errors; vendors/POs dropdown capped at 20. No status filter or tabs (e.g. needs review, exceptions). Exceptions only visible inside the review modal. No preview of the original document next to the fields. Bulk upload has no drop zone, no progress or per-file result list (errors are one long string). Capture modal is very long, so it should be split into steps (upload → review fields → lines). No line totals or subtotal check shown. Approvers/auditors see "Review" but can only read it. |
| **Vendors** | Searchable table (code, name/email, GSTIN + verification, masked bank, status, onboarding). Add-vendor modal. Admin bank-details modal, approve/reject onboarding, block/activate, verify GSTIN. | Silent load errors. Rejection uses `window.prompt`. No filter for pending onboarding (admin's main queue). No bank-change history view (API `bank-history/` exists, unused). No vendor detail (POs, invoices, spend). Can't edit vendor fields after creation. Error alert sits behind the open modal. |
| **Purchase Orders** | Searchable table (number, vendor, date, amount, status). Create modal with a single optional line. | **No error handling on create** (failed POST is an uncaught rejection, modal just stays). Only one line item; no add/remove lines. Total isn't derived from lines. No PO lines or received quantities shown. No status filter. Vendor dropdown lists every vendor, including blocked/pending ones. |
| **Goods Receipts** | Table (GRN, PO number, date, notes). Record-receipt modal: pick open PO, enter quantity per remaining line. | Silent load errors. "Record receipt" is shown only to AP_CLERK; ADMIN is allowed by the API but can't see the button. Table doesn't show received lines or quantities. PO name falls back to `PO #id` when the PO isn't on page 1. No search. |
| **Approvals** | Reminder banner; admin approval-matrix table plus add/delete rule; queue (invoice, approver, sequence, status, due). Review modal with comments → approve/reject. Has load error handling. | **Review modal shows no invoice details** (vendor, amount, lines, exceptions, document), so approvers decide blind. No "my pending" vs history split. No overdue highlighting. No confirm on rule delete; rules can't be edited. No warning about gaps or overlaps between rule ranges. Queue isn't grouped by invoice. |
| **Payments** | Bank-not-configured notice; table (reference, invoice, vendor, amount, method, status/date); advice modal, history modal; generate request, submit to bank, demo mark paid, mark failed. | Silent load errors; approved-invoice dropdown capped at 20 and errors on it are swallowed. Generate modal gives no hint when there are no approved invoices. "Mark failed" uses `window.prompt`. Too many inline link actions per row, so they should go into an action menu. History modal has no empty state. Advice can't be printed or copied. No status filter. |
| **Reports** | Filter bar (search, dates, vendor, status), 5 CSV download cards, static audit-log text, integration status list, admin delivery table. | No in-app audit log viewer (just points to `/api/audit-logs/`). No loading state on download buttons. Vendor filter capped at 20. Integration errors are only shown to ADMIN, while other roles get an endless loader. No indication of which filters apply to which report. |
| **Employees** | Create-account form (inactive by default); table with role and active status; activate/deactivate. Has loading/error/empty. | No success message after create. Can't change role or reset password. No confirmation on deactivate. Form is always expanded above the list. |

## Suggested order

1. Fix the cross-cutting load-error and pagination issues (shared `useList` hook plus pager component).
2. Approvals: invoice details in the review modal (this blocks real decisions).
3. Purchase Orders: create error handling and multi-line POs.
4. Replace `window.prompt` with modals; add a toast system.
5. Invoices: status filters, exception visibility, step-based capture, bulk results.
6. Detail views, audit log viewer, dashboard empty states and polish.

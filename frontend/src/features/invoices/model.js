import { lineAmountPaise, toPaise } from "@/lib/money";

/*
 * Invoice workspace logic with no React: role gates, URL filters, file checks, money math,
 * review validation, the client-side match preview and CSV export.
 */
import { getStatusMeta } from "@/components/status-badge";
import { formatDate } from "@/lib/format";

/* ---------- Roles (mirror backend/ap_app/permissions.py) ---------- */

/** Create, OCR preview, bulk, edit, review extraction, submit for approval. */
export const CAPTURE_ROLES = ["ADMIN", "AP_CLERK"];
/** Roles that can read GET /vendors/ (vendor filter source). */
export const VENDOR_READ_ROLES = ["ADMIN", "AP_CLERK", "ACCOUNTANT", "AUDITOR"];

export const canCapture = (role) => CAPTURE_ROLES.includes(role);
export const canReadVendors = (role) => VENDOR_READ_ROLES.includes(role);
export const canSyncErp = (role) => role === "ADMIN";

export const SUBMITTABLE_STATUSES = ["MATCHED", "PENDING_APPROVAL"];
export const ERP_SYNC_STATUSES = ["APPROVED", "PAID"];
export const LOCKED_STATUSES = ["APPROVED", "PAID", "REJECTED"];

/* ---------- URL filters ---------- */

export const INVOICE_STATUSES = [
  "CAPTURED",
  "VALIDATION_FAILED",
  "MATCH_PENDING",
  "MATCHED",
  "EXCEPTION",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "PAID",
];

/** Filters that get their own control in the toolbar. */
export const TOOLBAR_FILTER_KEYS = ["search", "status", "vendor", "date_from", "date_to"];
/** Filters other pages link in with (dashboard); shown as removable chips. */
export const LINKED_FILTER_KEYS = ["aging", "outstanding", "due_before", "needs_review"];
export const FILTER_KEYS = [...TOOLBAR_FILTER_KEYS, ...LINKED_FILTER_KEYS];

/** Columns the API can sort by (?ordering=), keyed by table column id. */
export const SORTABLE_COLUMNS = {
  invoice_number: "invoice_number",
  vendor_name: "vendor__name",
  invoice_date: "invoice_date",
  due_date: "due_date",
  total_amount: "total_amount",
  ocr_accuracy: "ocr_accuracy",
  status: "status",
};

export function parseStatuses(value) {
  return (value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

export function sortingFromOrdering(ordering) {
  if (!ordering) {
    return [];
  }
  const desc = ordering.startsWith("-");
  const field = desc ? ordering.slice(1) : ordering;
  const id = Object.keys(SORTABLE_COLUMNS).find((key) => SORTABLE_COLUMNS[key] === field);
  return id ? [{ id, desc }] : [];
}

export function orderingFromSorting(sorting) {
  const [first] = sorting;
  if (!first || !SORTABLE_COLUMNS[first.id]) {
    return "";
  }
  return `${first.desc ? "-" : ""}${SORTABLE_COLUMNS[first.id]}`;
}

export function linkedFilterLabel(key, value) {
  switch (key) {
    case "aging":
      return value === "Not yet due" ? "Not yet due" : `${value} days overdue`;
    case "outstanding":
      return "Unpaid (outstanding)";
    case "due_before":
      return `Due by ${formatDate(value)}`;
    case "needs_review":
      return "OCR extraction not reviewed";
    default:
      return `${key}: ${value}`;
  }
}

export function statusLabel(status) {
  return getStatusMeta(status, "invoice").label;
}

/* ---------- Files ---------- */

export const ACCEPTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".tif", ".tiff"];
export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.join(",");
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_BATCH_FILES = 50;
export const MAX_BATCH_BYTES = 250 * 1024 * 1024;

export function fileExtension(name = "") {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

export function fileKind(file) {
  const extension = fileExtension(file?.name);
  if (extension === ".pdf" || file?.type === "application/pdf") {
    return "pdf";
  }
  if (extension === ".tif" || extension === ".tiff") {
    return "tiff";
  }
  return "image";
}

export function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Same limits the API enforces (ocr-preview / create: 25 MB; bulk: 50 files, 250 MB). */
export function checkFile(file) {
  if (!ACCEPTED_EXTENSIONS.includes(fileExtension(file.name))) {
    return "Not a PDF, JPG, PNG or TIFF file.";
  }
  if (file.size === 0) {
    return "The file is empty.";
  }
  if (file.size > MAX_FILE_BYTES) {
    return `${formatBytes(file.size)} is over the 25 MB limit.`;
  }
  return "";
}

export function checkBatch(files) {
  if (files.length > MAX_BATCH_FILES) {
    return `Choose up to ${MAX_BATCH_FILES} files at a time (${files.length} selected).`;
  }
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_BATCH_BYTES) {
    return `These files add up to ${formatBytes(total)}; the batch limit is 250 MB.`;
  }
  return "";
}

/* ---------- Money ---------- */

export { fromPaise, lineAmountPaise, toPaise } from "@/lib/money";

/** Payload line for the API: amount = quantity x unit price, 2 dp (as before the rebuild). */
export function toApiLine(line) {
  return {
    description: line.description,
    quantity: line.quantity,
    unit_price: line.unit_price,
    tax_rate: line.tax_rate || "0",
    po_line: line.po_line || null,
    amount: (lineAmountPaise(line) / 100).toFixed(2),
  };
}

export function emptyLine() {
  return { key: newKey(), description: "", quantity: "1", unit_price: "", tax_rate: "0", po_line: "" };
}

let keyCounter = 0;
export function newKey() {
  keyCounter += 1;
  return `line-${keyCounter}`;
}

/** Live arithmetic for the review screen. Differences are in paise. */
export function totalsCheck(fields, lines) {
  const subtotal = toPaise(fields.subtotal);
  const tax = toPaise(fields.tax_amount) ?? 0;
  const total = toPaise(fields.total_amount);
  const lineSum = lines.reduce((sum, line) => sum + lineAmountPaise(line), 0);
  return {
    lineSum,
    subtotal,
    tax,
    total,
    linesMatchSubtotal: subtotal !== null && lines.length > 0 && Math.abs(lineSum - subtotal) <= 1,
    linesDiff: subtotal === null ? null : lineSum - subtotal,
    totalMatches: subtotal !== null && total !== null && Math.abs(subtotal + tax - total) <= 1,
    totalDiff: subtotal === null || total === null ? null : subtotal + tax - total,
  };
}

/* ---------- Review validation ---------- */

const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Client-side checks that gate "Confirm & submit". They mirror the server's required-field and
 * arithmetic rules; the server still runs the full validation and PO match.
 */
export function validateReview(fields, lines, { requireVendor = true } = {}) {
  const errors = {};
  if (!String(fields.invoice_number || "").trim()) {
    errors.invoice_number = "Enter the invoice number.";
  }
  if (requireVendor && !fields.vendor) {
    errors.vendor = "Choose the vendor.";
  }
  if (!DATE_PATTERN.test(fields.invoice_date || "")) {
    errors.invoice_date = "Enter the invoice date.";
  }
  if (!DATE_PATTERN.test(fields.due_date || "")) {
    errors.due_date = "Enter the due date.";
  } else if (fields.invoice_date && fields.due_date < fields.invoice_date) {
    errors.due_date = "Due date is before the invoice date.";
  }
  if (fields.extracted_gstin && !GSTIN_PATTERN.test(fields.extracted_gstin)) {
    errors.extracted_gstin = "GSTIN should be 15 characters, e.g. 29ABCDE1234F1Z5.";
  }
  const subtotal = toPaise(fields.subtotal);
  const tax = toPaise(fields.tax_amount);
  const total = toPaise(fields.total_amount);
  if (subtotal === null || subtotal < 0) {
    errors.subtotal = "Enter the subtotal.";
  }
  if (tax === null || tax < 0) {
    errors.tax_amount = "Enter the tax amount (0 if none).";
  }
  if (total === null || total <= 0) {
    errors.total_amount = "Enter a total above zero.";
  }
  const matching = fields.match_type && fields.match_type !== "NONE";
  if (matching && !fields.purchase_order) {
    errors.purchase_order = "Choose the purchase order to match against.";
  }

  const lineErrors = lines.map((line) => {
    const lineError = {};
    if (!String(line.description || "").trim()) {
      lineError.description = "Required";
    }
    if (!(Number(line.quantity) > 0)) {
      lineError.quantity = "Above 0";
    }
    if (line.unit_price === "" || !(Number(line.unit_price) >= 0)) {
      lineError.unit_price = "Required";
    }
    if (matching && !line.po_line) {
      lineError.po_line = "Link a PO line";
    }
    return lineError;
  });

  const check = totalsCheck(fields, lines);
  const blocking = [];
  if (!lines.length) {
    blocking.push("Add at least one line item.");
  }
  if (lines.length && subtotal !== null && !check.linesMatchSubtotal) {
    blocking.push("Line items don't add up to the subtotal.");
  }
  if (subtotal !== null && total !== null && !check.totalMatches) {
    blocking.push("Subtotal plus tax doesn't equal the total.");
  }
  const lineProblemCount = lineErrors.filter((item) => Object.keys(item).length).length;
  if (lineProblemCount) {
    blocking.push(`${lineProblemCount} line item${lineProblemCount === 1 ? " needs" : "s need"} attention.`);
  }
  const fieldProblemCount = Object.keys(errors).length;
  return {
    errors,
    lineErrors,
    blocking,
    check,
    ok: fieldProblemCount === 0 && blocking.length === 0,
    problemCount: fieldProblemCount + blocking.length,
  };
}

/* ---------- Match preview ---------- */

const DEFAULT_TOLERANCES = { line_amount: "0.01", invoice_amount: "0.01", quantity_percent: "0", price_percent: "1" };

function normalizeText(text) {
  return String(text || "").toLowerCase().split(/\s+/).filter(Boolean).join(" ");
}

/**
 * Preview of the server's 2-way / 3-way line checks against the chosen PO, using its tolerances.
 * Quantities already invoiced on other invoices for the PO aren't known here, so the server's
 * result can still differ; the screen says so.
 */
export function matchPreview({ matchType, purchaseOrder, lines, fields, tolerances }) {
  if (!matchType || matchType === "NONE") {
    return { state: "none", rows: [], issues: [] };
  }
  if (!purchaseOrder) {
    return { state: "needs_po", rows: [], issues: ["Choose a purchase order."] };
  }
  const limits = { ...DEFAULT_TOLERANCES, ...(tolerances || {}) };
  const pricePercent = Number(limits.price_percent);
  const quantityPercent = Number(limits.quantity_percent);
  const lineTolerance = Math.round(Number(limits.line_amount) * 100);
  const amountTolerance = Math.round(Number(limits.invoice_amount) * 100);
  const poLines = Object.fromEntries((purchaseOrder.lines || []).map((poLine) => [String(poLine.id), poLine]));
  const usedQuantity = {};

  const rows = lines.map((line, index) => {
    const poLine = poLines[String(line.po_line)];
    if (!poLine) {
      return { index, line, poLine: null, status: "unlinked", checks: {} };
    }
    const quantity = Number(line.quantity) || 0;
    const price = toPaise(line.unit_price) ?? 0;
    const poPrice = toPaise(poLine.unit_price) ?? 0;
    const base = Number(matchType === "3WAY" ? poLine.received_quantity : poLine.quantity) || 0;
    usedQuantity[poLine.id] = (usedQuantity[poLine.id] || 0) + quantity;
    const limit = base * (1 + quantityPercent / 100);
    const expected = Math.round(quantity * poPrice);
    const allowedAmount = Math.max(Math.round((expected * pricePercent) / 100), lineTolerance);
    const checks = {
      description: normalizeText(line.description) === normalizeText(poLine.description) ? "ok" : "fail",
      unit_price: Math.abs(price - poPrice) <= (poPrice * pricePercent) / 100 ? "ok" : "fail",
      quantity: limit > 0 && usedQuantity[poLine.id] <= limit + 1e-9 ? "ok" : "fail",
      amount: Math.abs(lineAmountPaise(line) - expected) <= allowedAmount ? "ok" : "fail",
    };
    const ok = Object.values(checks).every((value) => value === "ok");
    return {
      index,
      line,
      poLine,
      basis: matchType === "3WAY" ? "received" : "ordered",
      baseQuantity: base,
      status: ok ? "matched" : "mismatch",
      checks,
    };
  });

  const issues = [];
  if (purchaseOrder.vendor && fields.vendor && String(purchaseOrder.vendor) !== String(fields.vendor)) {
    issues.push("This PO belongs to a different vendor.");
  }
  const total = toPaise(fields.total_amount);
  const poTotal = toPaise(purchaseOrder.total_amount);
  if (total !== null && poTotal !== null && total > poTotal + amountTolerance) {
    issues.push("Invoice total is more than the PO amount.");
  }
  if (!lines.length) {
    issues.push("Add line items to compare with the PO.");
  }
  const failed = rows.filter((row) => row.status !== "matched").length;
  const state = issues.length || failed ? "mismatch" : "matched";
  return { state, rows, issues, failed, tolerances: limits };
}

/* ---------- CSV ---------- */

function csvCell(value) {
  let text = value === null || value === undefined ? "" : String(value);
  // Spreadsheet formula injection: neutralise cells that start with = + - @ (and tab/CR).
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export const CSV_COLUMNS = [
  ["Invoice number", (row) => row.invoice_number],
  ["Vendor", (row) => row.vendor_name],
  ["Invoice date", (row) => row.invoice_date],
  ["Due date", (row) => row.due_date],
  ["Subtotal", (row) => row.subtotal],
  ["Tax", (row) => row.tax_amount],
  ["Total", (row) => row.total_amount],
  ["Status", (row) => statusLabel(row.status)],
  ["Match type", (row) => row.match_type],
  ["Source", (row) => row.capture_source],
  ["OCR confidence %", (row) => row.ocr_accuracy],
  ["Extraction reviewed", (row) => (row.extraction_reviewed_at ? "Yes" : "No")],
  ["Exceptions", (row) => (row.exceptions || []).join(" | ")],
];

export function invoicesToCsv(rows) {
  const lines = [CSV_COLUMNS.map(([header]) => csvCell(header)).join(",")];
  rows.forEach((row) => {
    lines.push(CSV_COLUMNS.map(([, read]) => csvCell(read(row))).join(","));
  });
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function downloadText(text, filename, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- Due dates ---------- */

const OPEN_STATUSES = new Set(["CAPTURED", "VALIDATION_FAILED", "MATCH_PENDING", "MATCHED", "EXCEPTION", "PENDING_APPROVAL", "APPROVED"]);

export function isOverdue(invoice, daysFromToday) {
  if (!invoice.due_date || !OPEN_STATUSES.has(invoice.status)) {
    return false;
  }
  const days = daysFromToday(invoice.due_date);
  return days !== null && days < 0;
}

/*
 * Report catalogue and CSV handling. Roles mirror views.reports: ADMIN, ACCOUNTANT and AUDITOR
 * read reports; only ADMIN and AUDITOR export the audit log. The audit log accepts the date
 * range only; invoice reports also take search, vendor and status.
 */
import { FileText, ReceiptIndianRupee, ScrollText, ShieldCheck, TriangleAlert } from "lucide-react";

export const REPORT_ROLES = ["ADMIN", "ACCOUNTANT", "AUDITOR"];
const AUDIT_ROLES = ["ADMIN", "AUDITOR"];

export const REPORTS = [
  {
    kind: "aging",
    title: "AP aging",
    description: "Open invoices (matched, pending approval, approved) by due date and days overdue.",
    icon: ReceiptIndianRupee,
    filters: ["search", "vendor", "status", "dates"],
  },
  {
    kind: "invoice-status",
    title: "Invoice status",
    description: "Every invoice with its dates, amount and current status.",
    icon: FileText,
    filters: ["search", "vendor", "status", "dates"],
  },
  {
    kind: "exceptions",
    title: "Exceptions",
    description: "Invoices with validation or matching exceptions, and what failed.",
    icon: TriangleAlert,
    filters: ["search", "vendor", "status", "dates"],
  },
  {
    kind: "audit",
    title: "Audit log",
    description: "Timestamped user and system actions on every record.",
    icon: ScrollText,
    filters: ["dates"],
    roles: AUDIT_ROLES,
  },
  {
    kind: "gst",
    title: "GST / tax",
    description: "Tax amount per invoice with the vendor's GSTIN.",
    icon: ShieldCheck,
    filters: ["search", "vendor", "status", "dates"],
  },
];

export function reportsFor(role) {
  return REPORTS.filter((report) => !report.roles || report.roles.includes(role));
}

export const FILTER_KEYS = ["search", "vendor", "status", "date_from", "date_to"];

/** API params for a report: only the filters that report accepts, blanks dropped. */
export function reportParams(report, values) {
  const params = { kind: report.kind };
  const allowed = new Set(report.filters.flatMap((name) => (name === "dates" ? ["date_from", "date_to"] : [name])));
  FILTER_KEYS.forEach((key) => {
    if (values[key] && allowed.has(key)) {
      params[key] = values[key];
    }
  });
  return params;
}

/** RFC 4180 CSV parser (quoted fields, doubled quotes, CRLF). Returns rows of strings. */
export function parseCsv(text) {
  const source = String(text || "").replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") {
        index += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Undo the server's formula-injection guard (a leading ') for display only. */
export function displayCell(value) {
  return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
}

/** How to render a column, by its CSV header. */
export function columnKind(header) {
  if (/amount/i.test(header)) {
    return "money";
  }
  if (/^timestamp$/i.test(header)) {
    return "datetime";
  }
  if (/date$/i.test(header)) {
    return "date";
  }
  if (/^days|entity id/i.test(header)) {
    return "number";
  }
  if (/^status$/i.test(header)) {
    return "status";
  }
  return "text";
}

/** "2026-11-19 10:15:00.123456+05:30" (Python str) -> ISO that every browser parses. */
export function normalizeTimestamp(value) {
  return String(value)
    .replace(" ", "T")
    .replace(/(\.\d{3})\d+/, "$1");
}

export function reportFilename(kind) {
  return `${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
}

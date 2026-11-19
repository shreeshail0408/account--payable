/*
 * Payment rules. ADMIN and ACCOUNTANT act on payments; AUDITOR reads (permissions.py).
 * mark_paid only records a status: it never moves money, with or without a bank integration.
 */
import { Ban, BadgeCheck, LoaderCircle, Send } from "lucide-react";
import { fromPaise, toPaise } from "@/lib/money";

export const canActOnPayments = (role) => ["ADMIN", "ACCOUNTANT"].includes(role);

export const UNPAID_STATUSES = ["REQUESTED", "SCHEDULED", "PROCESSING"];
export const BANK_SUBMITTABLE = ["REQUESTED", "SCHEDULED"];

/** Pipeline stages in order; Failed is the branch off Processing. */
export const STAGES = [
  { key: "requested", label: "Requested", statuses: ["REQUESTED", "SCHEDULED"], icon: Send, tone: "neutral" },
  { key: "processing", label: "Processing", statuses: ["PROCESSING"], icon: LoaderCircle, tone: "info" },
  { key: "paid", label: "Paid", statuses: ["PAID"], icon: BadgeCheck, tone: "success" },
  { key: "failed", label: "Failed", statuses: ["FAILED"], icon: Ban, tone: "danger" },
];

export function stageOf(status) {
  return STAGES.find((stage) => stage.statuses.includes(status)) || STAGES[0];
}

export const PAYMENT_METHODS = [
  ["BANK_TRANSFER", "Bank transfer"],
  ["CHEQUE", "Cheque"],
  ["UPI", "UPI"],
  ["OTHER", "Other"],
];

export function methodLabel(value) {
  return PAYMENT_METHODS.find(([key]) => key === value)?.[1] || value || "—";
}

/** Payments marked paid from the demo flow carry a DEMO- bank reference. */
export function isDemoRecord(payment) {
  return String(payment?.bank_reference || "").toUpperCase().startsWith("DEMO-");
}

export function adviceFilename(payment) {
  return `${payment.reference || "payment"}-advice.txt`;
}

/** Plain-text advice file: the server's advice plus the reference, status and bank reference. */
export function adviceDocument(payment) {
  const lines = [
    (payment.advice || "PAYMENT ADVICE").trimEnd(),
    `Reference: ${payment.reference}`,
    `Method: ${methodLabel(payment.payment_method)}`,
    `Status: ${payment.status}`,
  ];
  if (payment.bank_reference) {
    lines.push(`Bank reference: ${payment.bank_reference}`);
  }
  if (isDemoRecord(payment)) {
    lines.push("", "DEMO RECORD - no money was transferred.");
  }
  lines.push("", "This advice is not proof of bank settlement.");
  return `${lines.join("\r\n")}\r\n`;
}

export function stageSummary(payments) {
  return STAGES.map((stage) => {
    const rows = payments.filter((payment) => stage.statuses.includes(payment.status));
    return {
      ...stage,
      count: rows.length,
      amount: fromPaise(rows.reduce((sum, payment) => sum + (toPaise(payment.amount) ?? 0), 0)),
    };
  });
}

export function matchesSearch(payment, term) {
  if (!term) {
    return true;
  }
  const needle = term.toLowerCase();
  return [payment.reference, payment.invoice_number, payment.vendor_name, payment.bank_reference]
    .some((value) => String(value || "").toLowerCase().includes(needle));
}

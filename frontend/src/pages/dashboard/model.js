/*
 * Dashboard data shaping: turns the /dashboard/ response into the rows each card renders,
 * and builds the filtered list links the cards point to. No React in here.
 */
import { getStatusMeta } from "@/components/status-badge";
import { formatNumber } from "@/lib/format";

/** Build "/invoices?status=EXCEPTION" style links; the invoice list reads these params. */
export function invoicesLink(params = {}) {
  const query = new URLSearchParams(params).toString();
  return query ? `/invoices?${query}` : "/invoices";
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

/*
 * Aging buckets, in API order. Colors: neutral for "not yet due", then an ordinal
 * warning -> danger ramp for days overdue (tokens --aging-0..4 in theme.css).
 */
const AGING_META = {
  "Not yet due": { short: "Not due", label: "Not yet due", legend: "Not yet due", color: "var(--aging-0)", overdue: false },
  "0-30": { short: "0–30", label: "0–30 days overdue", legend: "0–30 days", color: "var(--aging-1)", overdue: true },
  "31-60": { short: "31–60", label: "31–60 days overdue", legend: "31–60 days", color: "var(--aging-2)", overdue: true },
  "61-90": { short: "61–90", label: "61–90 days overdue", legend: "61–90 days", color: "var(--aging-3)", overdue: true },
  "90+": { short: "90+", label: "Over 90 days overdue", legend: "90+ days", color: "var(--aging-4)", overdue: true },
};

export function agingRows(aging = []) {
  return aging.map((row) => {
    const meta = AGING_META[row.bucket] || {
      short: row.bucket,
      label: row.bucket,
      legend: row.bucket,
      color: "var(--aging-0)",
      overdue: false,
    };
    return {
      ...meta,
      bucket: row.bucket,
      amount: toNumber(row.amount),
      count: row.count || 0,
      to: invoicesLink({ aging: row.bucket }),
    };
  });
}

/*
 * Invoice statuses grouped into lifecycle stages for the part-to-whole bar (<= 6 parts).
 * Order is the validated adjacency order of --stage-1..6; don't reorder without re-validating.
 */
const STAGES = [
  { key: "capture", label: "In capture", statuses: ["CAPTURED", "MATCH_PENDING", "MATCHED"] },
  { key: "correction", label: "Needs correction", statuses: ["EXCEPTION", "VALIDATION_FAILED"] },
  { key: "pending", label: "Pending approval", statuses: ["PENDING_APPROVAL"] },
  { key: "approved", label: "Approved, unpaid", statuses: ["APPROVED"] },
  { key: "rejected", label: "Rejected", statuses: ["REJECTED"] },
  { key: "paid", label: "Paid", statuses: ["PAID"] },
];

// Literal strings on purpose: the raw tokens from theme.css, listed in validated order.
const STAGE_COLORS = [
  "var(--stage-1)",
  "var(--stage-2)",
  "var(--stage-3)",
  "var(--stage-4)",
  "var(--stage-5)",
  "var(--stage-6)",
];

export function stageRows(invoiceStatus = []) {
  const counts = Object.fromEntries(invoiceStatus.map((row) => [row.status, row.count || 0]));
  const known = new Set(STAGES.flatMap((stage) => stage.statuses));
  const rows = STAGES.map((stage, index) => ({
    ...stage,
    color: STAGE_COLORS[index],
    breakdown: stage.statuses
      .filter((status) => counts[status])
      .map((status) => ({ status, label: getStatusMeta(status, "invoice").label, count: counts[status] })),
    count: stage.statuses.reduce((total, status) => total + (counts[status] || 0), 0),
  }));
  // A status the UI doesn't know yet folds into "Other" rather than disappearing.
  const unknown = Object.keys(counts).filter((status) => !known.has(status) && counts[status]);
  if (unknown.length) {
    rows.push({
      key: "other",
      label: "Other",
      statuses: unknown,
      color: "var(--aging-0)",
      breakdown: unknown.map((status) => ({ status, label: status, count: counts[status] })),
      count: unknown.reduce((total, status) => total + counts[status], 0),
    });
  }
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return {
    total,
    rows: rows.map((row) => ({
      ...row,
      share: total ? (row.count / total) * 100 : 0,
      to: invoicesLink({ status: row.statuses.join(",") }),
    })),
  };
}

const PAYMENT_ORDER = ["REQUESTED", "SCHEDULED", "PROCESSING", "PAID", "FAILED"];

export function paymentRows(paymentStatus = []) {
  const byStatus = Object.fromEntries(paymentStatus.map((row) => [row.status, row]));
  const extra = paymentStatus.map((row) => row.status).filter((status) => !PAYMENT_ORDER.includes(status));
  return [...PAYMENT_ORDER, ...extra].map((status) => ({
    status,
    label: getStatusMeta(status, "payment").label,
    amount: toNumber(byStatus[status]?.amount),
    count: byStatus[status]?.count || 0,
  }));
}

export function vendorRows(vendorAnalytics = [], limit = 6) {
  const rows = vendorAnalytics.slice(0, limit).map((row) => ({
    name: row.vendor__name || "Unknown vendor",
    total: toNumber(row.total),
    count: row.count || 0,
  }));
  const max = Math.max(0, ...rows.map((row) => row.total));
  return rows.map((row) => ({ ...row, share: max ? (row.total / max) * 100 : 0 }));
}

/** 0.4 -> "24 min", 18.5 -> "18.5 h", 60 -> "2.5 days". */
export function formatDuration(hours) {
  const value = Number(hours);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  if (value < 1) {
    return `${Math.max(1, Math.round(value * 60))} min`;
  }
  if (value < 48) {
    return `${formatNumber(value, { fractionDigits: 1 })} h`;
  }
  return `${formatNumber(value / 24, { fractionDigits: 1 })} days`;
}

export function countBy(rows, status) {
  return rows.find((row) => row.status === status)?.count || 0;
}

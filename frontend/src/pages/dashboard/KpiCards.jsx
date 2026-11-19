import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Clock3, IndianRupee, ScanLine, Timer, TriangleAlert } from "lucide-react";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, canAccess } from "@/layout/nav";
import { countBy, formatDuration, invoicesLink } from "./model";

const TONES = {
  neutral: "bg-muted text-subtle-foreground",
  primary: "bg-primary-subtle text-primary-subtle-foreground",
  warning: "bg-warning-subtle text-warning-subtle-foreground",
  danger: "bg-danger-subtle text-danger-subtle-foreground",
  success: "bg-success-subtle text-success-subtle-foreground",
};

function plural(count, word) {
  return `${formatNumber(count)} ${word}${count === 1 ? "" : "s"}`;
}

function KpiCard({ to, icon: Icon, tone = "neutral", label, value, sublabel, className }) {
  return (
    <Link
      to={to}
      className={cn(
        "group relative flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-card",
        "outline-none transition-colors hover:border-border-strong hover:bg-accent/50",
        "focus-visible:ring-[3px] focus-visible:ring-ring/35",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", TONES[tone])}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <span className="truncate text-2xl font-semibold tracking-tight">{value}</span>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1">{sublabel}</span>
        <ArrowUpRight
          className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden="true"
        />
      </span>
    </Link>
  );
}

export function KpiCards({ data, role }) {
  const overdueAmount = (data.aging || [])
    .filter((row) => row.bucket !== "Not yet due")
    .reduce((total, row) => total + Number(row.amount || 0), 0);
  const pendingInvoices = countBy(data.invoice_status || [], "PENDING_APPROVAL");
  const mine = data.attention?.my_approvals?.count;
  const canOpenApprovals = canAccess(NAV_ITEMS.approvals, role);
  const duration = formatDuration(data.processing_turnaround_hours);
  const ocr = data.average_ocr_confidence;
  const reviewPending = data.ocr_review_pending_count || 0;

  return (
    <section aria-label="Key figures" className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-5">
      <KpiCard
        className="col-span-2 sm:col-span-4 xl:col-span-1"
        to={invoicesLink({ outstanding: 1 })}
        icon={IndianRupee}
        tone="primary"
        label="Outstanding payables"
        value={formatCurrency(data.outstanding_amount ?? 0, { fractionDigits: 0 })}
        sublabel={
          overdueAmount > 0
            ? `${plural(data.outstanding_count || 0, "unpaid invoice")} · ${formatCurrency(overdueAmount, { fractionDigits: 0 })} overdue`
            : `${plural(data.outstanding_count || 0, "unpaid invoice")}, none overdue`
        }
      />
      <KpiCard
        to={canOpenApprovals ? NAV_ITEMS.approvals.path : invoicesLink({ status: "PENDING_APPROVAL" })}
        icon={Clock3}
        tone={mine ? "warning" : "neutral"}
        label="Pending approvals"
        value={formatNumber(pendingInvoices)}
        sublabel={mine !== undefined ? `${formatNumber(mine)} waiting on you` : "Invoices awaiting sign-off"}
      />
      <KpiCard
        to={invoicesLink({ status: "EXCEPTION" })}
        icon={TriangleAlert}
        tone={data.exceptions_count ? "danger" : "success"}
        label="Open exceptions"
        value={formatNumber(data.exceptions_count || 0)}
        sublabel={data.exceptions_count ? "Need correction before approval" : "All clear"}
      />
      <KpiCard
        to={invoicesLink({ status: "APPROVED,PAID" })}
        icon={Timer}
        label="Avg processing time"
        value={duration || "—"}
        sublabel={duration ? "Capture to final approval" : "No completed approvals yet"}
      />
      <KpiCard
        to={invoicesLink({ needs_review: 1 })}
        icon={ScanLine}
        tone={reviewPending ? "warning" : "neutral"}
        label="OCR confidence"
        value={ocr === null || ocr === undefined ? "—" : formatPercent(ocr)}
        sublabel={
          ocr === null || ocr === undefined
            ? "No OCR-captured invoices yet"
            : `Engine average · ${formatNumber(reviewPending)} awaiting review`
        }
      />
    </section>
  );
}

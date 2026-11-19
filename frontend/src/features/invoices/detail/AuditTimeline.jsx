import React from "react";
import {
  BadgeCheck,
  CircleDot,
  CircleX,
  ClipboardCheck,
  FilePlus2,
  PencilLine,
  RefreshCw,
  Send,
  ShieldCheck,
} from "lucide-react";
import { formatDateTime, formatRelativeTime } from "@/lib/format";

const ACTIONS = {
  "invoice.created": { label: "Invoice captured", icon: FilePlus2 },
  "invoice.updated": { label: "Invoice edited", icon: PencilLine },
  "invoice.extraction_reviewed": { label: "OCR extraction reviewed", icon: ShieldCheck },
  "invoice.validated": { label: "Validation re-run", icon: ClipboardCheck },
  "invoice.submitted_for_approval": { label: "Submitted for approval", icon: Send },
  "invoice.synced_to_erp": { label: "Synced to ERP", icon: RefreshCw },
  "approval.approved": { label: "Approval step approved", icon: BadgeCheck },
  "approval.rejected": { label: "Approval step rejected", icon: CircleX },
  "approval.escalated": { label: "Approval escalated", icon: CircleDot },
  "payment.requested": { label: "Payment requested", icon: Send },
  "payment.submitted_to_bank": { label: "Payment submitted to bank", icon: Send },
  "payment.paid": { label: "Payment marked paid", icon: BadgeCheck },
  "payment.failed": { label: "Payment failed", icon: CircleX },
};

const DETAIL_LABELS = {
  source: "Source",
  field_count: "Fields checked",
  correct_suggestions: "OCR values correct",
  line_items_updated: "Lines changed",
  http_status: "ERP response",
  comments: "Comment",
  reason: "Reason",
  bank_reference: "Bank reference",
};

function detailText(details) {
  return Object.entries(details || {})
    .filter(([key, value]) => DETAIL_LABELS[key] && value !== "" && value !== null && value !== undefined)
    .map(([key, value]) => `${DETAIL_LABELS[key]}: ${typeof value === "boolean" ? (value ? "yes" : "no") : value}`)
    .join(" · ");
}

/** Newest first, from AuditLog rows for the invoice, its approvals and its payment. */
export function AuditTimeline({ events }) {
  return (
    <ol className="flex flex-col">
      {events.map((event, index) => {
        const meta = ACTIONS[event.action] || { label: event.action, icon: CircleDot };
        const Icon = meta.icon;
        const extra = detailText(event.details);
        return (
          <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
            {index < events.length - 1 && (
              <span aria-hidden="true" className="absolute left-3 top-7 bottom-0 w-px bg-border" />
            )}
            <span className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
              <Icon className="size-3.5" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-sm">
                <span className="font-medium">{meta.label}</span>
                {event.actor_name && <span className="text-muted-foreground"> by {event.actor_name}</span>}
              </p>
              <time dateTime={event.timestamp} title={formatDateTime(event.timestamp)} className="text-xs text-muted-foreground">
                {formatRelativeTime(event.timestamp)} · {formatDateTime(event.timestamp)}
              </time>
              {extra && <p className="text-xs text-muted-foreground">{extra}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

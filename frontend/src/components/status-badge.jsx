import React from "react";
import {
  AlarmClock,
  Ban,
  BadgeCheck,
  CalendarClock,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleHelp,
  CircleSlash,
  CircleX,
  Clock,
  GitCompareArrows,
  Hourglass,
  LoaderCircle,
  MailX,
  OctagonAlert,
  ScanLine,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/*
 * One place that maps every backend status to a label, color (Badge variant) and icon.
 * Statuses come from backend/ap_app/models.py. The same value can mean different things
 * per record type (e.g. PENDING), so pass `kind` when you know it; without `kind` the
 * generic map is used.
 *
 * Colour language:  success = done/good · warning = waiting on a person ·
 * info = in progress in the system · danger = needs attention/failed · neutral = inactive/closed.
 */
const status = (label, variant, icon) => ({ label, variant, icon });

export const STATUS_MAP = {
  invoice: {
    CAPTURED: status("Captured", "neutral", ScanLine),
    VALIDATION_FAILED: status("Validation failed", "danger", OctagonAlert),
    MATCH_PENDING: status("Match pending", "info", Hourglass),
    MATCHED: status("Matched", "info", GitCompareArrows),
    EXCEPTION: status("Exception", "danger", TriangleAlert),
    PENDING_APPROVAL: status("Pending approval", "warning", Clock),
    APPROVED: status("Approved", "success", CircleCheck),
    REJECTED: status("Rejected", "danger", CircleX),
    PAID: status("Paid", "success", BadgeCheck),
  },
  payment: {
    REQUESTED: status("Requested", "neutral", Send),
    SCHEDULED: status("Scheduled", "info", CalendarClock),
    PROCESSING: status("Processing", "info", LoaderCircle),
    PAID: status("Paid", "success", BadgeCheck),
    FAILED: status("Failed", "danger", CircleX),
  },
  vendor: {
    PENDING: status("Pending onboarding", "warning", Clock),
    ACTIVE: status("Active", "success", CircleCheck),
    BLOCKED: status("Blocked", "danger", Ban),
  },
  onboarding: {
    SUBMITTED: status("Submitted", "warning", Send),
    APPROVED: status("Approved", "success", CircleCheck),
    REJECTED: status("Rejected", "danger", CircleX),
  },
  approval: {
    PENDING: status("Pending", "warning", Clock),
    APPROVED: status("Approved", "success", CircleCheck),
    REJECTED: status("Rejected", "danger", CircleX),
    ESCALATED: status("Escalated", "danger", AlarmClock),
  },
  purchaseOrder: {
    OPEN: status("Open", "info", CircleDot),
    CLOSED: status("Closed", "neutral", CircleCheck),
    CANCELLED: status("Cancelled", "neutral", CircleSlash),
  },
  verification: {
    UNVERIFIED: status("Unverified", "neutral", ShieldQuestion),
    VERIFIED: status("Verified", "success", ShieldCheck),
    FAILED: status("Failed", "danger", ShieldAlert),
    UNAVAILABLE: status("Unavailable", "neutral", CircleDashed),
  },
  delivery: {
    SUCCEEDED: status("Succeeded", "success", CircleCheck),
    FAILED: status("Failed", "danger", CircleX),
  },
  inboundEmail: {
    PROCESSED: status("Processed", "success", CircleCheck),
    IGNORED: status("Ignored", "neutral", MailX),
  },
  employee: {
    ACTIVE: status("Active", "success", CircleCheck),
    BLOCKED: status("Inactive", "neutral", Ban),
  },
};

// Fallback when `kind` is omitted: later maps don't override earlier ones.
const GENERIC = Object.values(STATUS_MAP).reduce(
  (merged, map) => ({ ...map, ...merged }),
  {},
);

function humanize(value) {
  const text = String(value || "").replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function getStatusMeta(value, kind) {
  const key = String(value || "").toUpperCase();
  const meta = (kind && STATUS_MAP[kind]?.[key]) || GENERIC[key];
  return meta || status(humanize(value) || "Unknown", "neutral", CircleHelp);
}

export function StatusBadge({ status: value, kind, className, showIcon = true }) {
  const meta = getStatusMeta(value, kind);
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant} className={className}>
      {showIcon && (
        <Icon
          aria-hidden="true"
          className={cn(Icon === LoaderCircle && "animate-spin [animation-duration:2.5s]")}
        />
      )}
      {meta.label}
    </Badge>
  );
}

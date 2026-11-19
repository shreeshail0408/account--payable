import React from "react";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const TONES = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

/**
 * Horizontal bar for "received vs ordered" style ratios. `extra` draws a second, lighter
 * segment after `value` (e.g. quantities in the receipt being entered). `label` names the bar
 * for screen readers; the visible caption is up to the caller.
 */
export function Progress({ value, max, extra = 0, tone, label, className }) {
  const safeMax = Number(max) > 0 ? Number(max) : 0;
  const done = Math.max(0, Number(value) || 0);
  const pending = Math.max(0, Number(extra) || 0);
  const ratio = safeMax ? Math.min(1, done / safeMax) : 0;
  const extraRatio = safeMax ? Math.min(1 - ratio, pending / safeMax) : 0;
  const over = safeMax > 0 && done + pending > safeMax;
  const resolvedTone = tone || (over ? "danger" : ratio >= 1 ? "success" : "primary");

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={Math.min(done + pending, safeMax)}
      aria-valuetext={`${formatNumber(done + pending)} of ${formatNumber(safeMax)}`}
      className={cn("flex h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <span className={cn("h-full transition-[width]", TONES[resolvedTone])} style={{ width: `${ratio * 100}%` }} />
      {extraRatio > 0 && (
        <span
          className={cn("h-full opacity-40 transition-[width]", over ? "bg-danger" : TONES[resolvedTone])}
          style={{ width: `${extraRatio * 100}%` }}
        />
      )}
    </div>
  );
}

/** Progress plus an "x of y" caption, for table cells. */
export function QuantityProgress({ received, ordered, extra = 0, label, className }) {
  const total = (Number(received) || 0) + (Number(extra) || 0);
  return (
    <div className={cn("flex min-w-28 flex-col gap-1", className)}>
      <Progress value={received} extra={extra} max={ordered} label={label} />
      <span className="text-xs text-muted-foreground tabular-nums">
        {formatNumber(total)} of {formatNumber(ordered)}
      </span>
    </div>
  );
}

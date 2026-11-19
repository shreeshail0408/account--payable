import React from "react";
import { CircleAlert, Info, RotateCw, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const TONES = {
  info: {
    icon: Info,
    className: "border-info-border bg-info-subtle text-info-subtle-foreground",
  },
  warning: {
    icon: TriangleAlert,
    className: "border-warning-border bg-warning-subtle text-warning-subtle-foreground",
  },
  danger: {
    icon: CircleAlert,
    className: "border-danger-border bg-danger-subtle text-danger-subtle-foreground",
  },
};

/**
 * One-line banner for notices and failed secondary loads. Danger alerts get role="alert";
 * pass `onRetry` to offer a retry link next to the message.
 */
export function InlineAlert({ tone = "info", title, children, onRetry, action, className }) {
  const meta = TONES[tone];
  const Icon = meta.icon;
  return (
    <div
      role={tone === "danger" ? "alert" : "note"}
      className={cn("flex gap-3 rounded-md border px-4 py-3 text-sm", meta.className, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {title && <p className="font-medium">{title}</p>}
        {children && <div>{children}</div>}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex shrink-0 items-center gap-1 self-start rounded-sm font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/35"
        >
          <RotateCw className="size-3.5" aria-hidden="true" />
          Retry
        </button>
      )}
      {action && <div className="shrink-0 self-start">{action}</div>}
    </div>
  );
}

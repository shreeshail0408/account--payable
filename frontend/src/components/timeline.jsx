import React from "react";
import { CircleDot } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const TONES = {
  success: "border-success-border bg-success-subtle text-success",
  danger: "border-danger-border bg-danger-subtle text-danger",
  warning: "border-warning-border bg-warning-subtle text-warning-subtle-foreground",
  info: "border-info-border bg-info-subtle text-info",
  neutral: "border-border bg-muted text-muted-foreground",
};

/**
 * Vertical event list (newest last unless the caller sorts otherwise).
 * items: [{ key, title, description, time, actor, tone, icon }]
 */
export function Timeline({ items, className }) {
  return (
    <ol className={cn("flex flex-col", className)}>
      {items.map((item, index) => {
        const Icon = item.icon || CircleDot;
        const last = index === items.length - 1;
        return (
          <li key={item.key} className="relative flex gap-3 pb-6 last:pb-0">
            {!last && (
              <span aria-hidden="true" className="absolute bottom-0 left-4 top-9 w-px bg-border" />
            )}
            <span
              className={cn(
                "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border",
                TONES[item.tone || "neutral"],
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
              <p className="text-sm font-medium">{item.title}</p>
              {(item.time || item.actor) && (
                <p className="text-xs text-muted-foreground">
                  {item.time && formatDateTime(item.time)}
                  {item.time && item.actor && " · "}
                  {item.actor && `by ${item.actor}`}
                </p>
              )}
              {item.description && (
                <div className="text-sm text-muted-foreground">{item.description}</div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

import React from "react";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

/** An INR amount with tabular digits. Use for every money value shown in the UI. */
export function Amount({ value, className, muted = false, ...options }) {
  return (
    <span className={cn("amount tabular-nums", muted && "text-muted-foreground", className)}>
      {formatCurrency(value, options)}
    </span>
  );
}

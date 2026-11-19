import React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-border bg-card text-card-foreground shadow-card",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }) {
  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-1 px-6 pt-6",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }) {
  return (
    <h3
      className={cn("col-start-1 text-base font-semibold leading-tight tracking-tight", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }) {
  return (
    <p className={cn("col-start-1 text-sm text-muted-foreground", className)} {...props} />
  );
}

/** Right-aligned slot in the header row (buttons, menus, badges). */
export function CardAction({ className, ...props }) {
  return (
    <div
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }) {
  return <div className={cn("px-6 py-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }) {
  return (
    <div
      className={cn("flex items-center gap-2 border-t border-border px-6 py-4", className)}
      {...props}
    />
  );
}

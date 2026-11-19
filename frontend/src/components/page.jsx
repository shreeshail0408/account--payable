import React from "react";
import { cn } from "@/lib/utils";

/** Root of every migrated page: tokens' reset (`data-ui`), page padding and vertical rhythm. */
export function Page({ className, children, ...props }) {
  return (
    <div data-ui="" className={cn("flex flex-col gap-6 px-4 py-6 animate-page-in sm:px-6 lg:px-8", className)} {...props}>
      {children}
    </div>
  );
}

/** Page title, one-line description and the page's primary actions (right, wraps on mobile). */
export function PageHeader({ title, description, actions }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/** Label/value pairs for record summaries (detail sheets, preview panes). */
export function DescriptionList({ items, columns = 2, className }) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-4",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-3",
        className,
      )}
    >
      {items.filter(Boolean).map(({ label, value, wide }) => (
        <div key={label} className={cn("flex min-w-0 flex-col gap-0.5", wide && "sm:col-span-full")}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words text-sm">{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Titled block inside a sheet or pane. */
export function Section({ title, description, aside, children, className }) {
  return (
    <section className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

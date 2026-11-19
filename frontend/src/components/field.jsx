import React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Form field: label above, control, then hint or error below. The control should set
 * `id={id}` and `aria-invalid` itself; `aria-describedby` points at `${id}-message`.
 */
export function Field({ id, label, hint, error, required = false, className, children }) {
  const message = error || hint;
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="text-danger" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      {children}
      {message && (
        <p id={`${id}-message`} className={cn("text-xs", error ? "text-danger" : "text-muted-foreground")}>
          {message}
        </p>
      )}
    </div>
  );
}

/** Props for a control inside <Field>: id, aria-invalid and aria-describedby. */
export function fieldProps(id, error, hint) {
  return {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error || hint ? `${id}-message` : undefined,
  };
}

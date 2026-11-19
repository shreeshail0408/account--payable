import React from "react";
import { Bot, CircleAlert, CircleCheck, CircleDashed, PencilLine, TriangleAlert } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/*
 * OCR confidence per field comes from the API (`field_confidence`: Tesseract word confidence of
 * the line a value was read from). Levels: high >= 85, medium >= 60, else low; "missing" when OCR
 * found nothing; source "model" when the local model filled the value (no OCR line to score).
 */
const LEVELS = {
  high: { label: "High", icon: CircleCheck, className: "text-success" },
  medium: { label: "Medium", icon: TriangleAlert, className: "text-warning-subtle-foreground" },
  low: { label: "Low", icon: CircleAlert, className: "text-danger" },
  missing: { label: "Not found", icon: CircleDashed, className: "text-muted-foreground" },
  edited: { label: "Edited", icon: PencilLine, className: "text-info" },
  model: { label: "Model", icon: Bot, className: "text-warning-subtle-foreground" },
};

/** Which indicator a field shows, given its confidence entry and whether the user changed it. */
export function fieldLevel(confidence, edited) {
  if (edited) {
    return "edited";
  }
  if (!confidence) {
    return null;
  }
  if (confidence.source === "model") {
    return "model";
  }
  return confidence.level;
}

export function needsReview(level) {
  return level === "low" || level === "missing" || level === "model";
}

function describe(level, confidence) {
  switch (level) {
    case "edited":
      return "You changed the OCR value.";
    case "model":
      return "Filled in by the local model, not read from a scored OCR line. Check it against the document.";
    case "missing":
      return "OCR didn't find this value. Enter it from the document.";
    default:
      return confidence?.score === null || confidence?.score === undefined
        ? "OCR confidence for this value is unknown."
        : `OCR word confidence ${formatNumber(confidence.score, { fractionDigits: 0 })}% on the line this was read from.`;
  }
}

export function ConfidenceIndicator({ level, confidence, className }) {
  if (!level) {
    return null;
  }
  const meta = LEVELS[level];
  const Icon = meta.icon;
  const text = describe(level, confidence);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            "inline-flex items-center gap-1 rounded-sm text-xs font-medium outline-none",
            "focus-visible:ring-[3px] focus-visible:ring-ring/35",
            meta.className,
            className,
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {meta.label}
          <span className="sr-only">. {text}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{text}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Labelled control with its confidence and error. Low-confidence / missing values get a warning
 * surface until the user edits them, so reviewers can scan for what needs checking.
 */
export function ReviewField({ id, label, required, level, confidence, error, hint, children, className }) {
  const flagged = needsReview(level);
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-md",
        flagged && "-m-2 border border-warning-border bg-warning-subtle p-2",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>
          {label}
          {required && (
            <span className="text-danger" aria-hidden="true">
              {" "}*
            </span>
          )}
        </Label>
        <ConfidenceIndicator level={level} confidence={confidence} />
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

export function FieldGroup({ title, description, action, children }) {
  return (
    <section className="flex flex-col gap-4 border-b border-border px-4 py-6 last:border-b-0 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

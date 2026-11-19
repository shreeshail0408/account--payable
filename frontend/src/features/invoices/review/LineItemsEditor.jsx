import React from "react";
import { CircleCheck, CircleX, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { emptyLine, fromPaise, lineAmountPaise } from "../model";
import { ConfidenceIndicator, needsReview } from "./fields";

const NO_PO_LINE = "none";

/**
 * Editable invoice lines. Amount is always quantity x unit price (as the API payload is built),
 * and the footer checks lines = subtotal and subtotal + tax = total live.
 */
export function LineItemsEditor({
  lines,
  onChange,
  lineErrors,
  lineLevels,
  matching,
  poLines,
  check,
  readOnly,
  showErrors,
}) {
  const update = (index, changes) => {
    onChange(lines.map((line, position) => (position === index ? { ...line, ...changes } : line)));
  };

  return (
    <div className="flex flex-col gap-4">
      {lines.length === 0 && (
        <p className="rounded-md border border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted-foreground">
          No line items yet. Add the materials or services listed on the invoice.
        </p>
      )}

      <ol className="flex flex-col gap-4">
        {lines.map((line, index) => (
          <LineRow
            key={line.key}
            index={index}
            line={line}
            errors={showErrors ? lineErrors[index] || {} : {}}
            level={lineLevels[index]}
            matching={matching}
            poLines={poLines}
            readOnly={readOnly}
            onChange={(changes) => update(index, changes)}
            onRemove={() => onChange(lines.filter((_, position) => position !== index))}
          />
        ))}
      </ol>

      {!readOnly && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => onChange([...lines, emptyLine()])}
        >
          <Plus />
          Add line
        </Button>
      )}

      <TotalsCheck check={check} lineCount={lines.length} />
    </div>
  );
}

function LineRow({ index, line, errors, level, matching, poLines, readOnly, onChange, onRemove }) {
  const id = `line-${line.key}`;
  const flagged = needsReview(level?.level);
  const amount = lineAmountPaise(line);

  return (
    <li
      className={cn(
        "grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_6rem_8rem_7rem_auto] sm:items-start",
        flagged ? "border-warning-border bg-warning-subtle" : "border-border bg-card",
      )}
    >
      <div className="flex min-w-0 flex-col gap-2 sm:col-span-1">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`${id}-description`}>Line {index + 1}</Label>
          <ConfidenceIndicator level={level?.level} confidence={level?.confidence} />
        </div>
        <Input
          id={`${id}-description`}
          value={line.description}
          disabled={readOnly}
          placeholder="Description"
          aria-invalid={Boolean(errors.description) || undefined}
          onChange={(event) => onChange({ description: event.target.value })}
        />
        {matching && (
          <Select
            value={line.po_line ? String(line.po_line) : NO_PO_LINE}
            onValueChange={(value) => onChange({ po_line: value === NO_PO_LINE ? "" : value })}
            disabled={readOnly || poLines.length === 0}
          >
            <SelectTrigger
              size="sm"
              aria-label={`PO line for line ${index + 1}`}
              aria-invalid={Boolean(errors.po_line) || undefined}
            >
              <SelectValue placeholder="Link a PO line" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PO_LINE}>Not linked</SelectItem>
              {poLines.map((poLine) => (
                <SelectItem key={poLine.id} value={String(poLine.id)}>
                  {poLine.description} · {formatNumber(poLine.quantity)} @ {formatCurrency(poLine.unit_price)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {(errors.description || errors.po_line) && (
          <p className="text-xs text-danger">{errors.description ? "Enter a description." : "Link this line to a PO line."}</p>
        )}
      </div>

      <NumberCell
        id={`${id}-quantity`}
        label="Qty"
        value={line.quantity}
        step="0.001"
        min="0"
        error={errors.quantity}
        readOnly={readOnly}
        onChange={(quantity) => onChange({ quantity })}
      />
      <NumberCell
        id={`${id}-price`}
        label="Unit price"
        value={line.unit_price}
        step="0.01"
        min="0"
        error={errors.unit_price}
        readOnly={readOnly}
        onChange={(unit_price) => onChange({ unit_price })}
      />
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium leading-none sm:text-right">Amount</span>
        <span className="flex h-9 items-center text-sm font-medium tabular-nums sm:justify-end">
          {formatCurrency(fromPaise(amount))}
        </span>
      </div>
      {!readOnly && (
        <div className="flex justify-end sm:pt-6">
          <Button variant="ghost" size="icon-sm" aria-label={`Remove line ${index + 1}`} onClick={onRemove}>
            <Trash2 />
          </Button>
        </div>
      )}
    </li>
  );
}

function NumberCell({ id, label, value, step, min, error, readOnly, onChange }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="sm:justify-end">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        value={value}
        disabled={readOnly}
        aria-invalid={Boolean(error) || undefined}
        onChange={(event) => onChange(event.target.value)}
        className="text-right tabular-nums"
      />
    </div>
  );
}

function CheckRow({ label, ok, detail }) {
  const Icon = ok ? CircleCheck : CircleX;
  return (
    <div className="flex items-start gap-2">
      <Icon className={cn("mt-0.5 size-4 shrink-0", ok ? "text-success" : "text-danger")} aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4">
        <span className="text-sm">
          {label}
          <span className="sr-only">{ok ? ": matches" : ": doesn't match"}</span>
        </span>
        <span className={cn("text-sm tabular-nums", ok ? "text-muted-foreground" : "font-medium text-danger")}>
          {detail}
        </span>
      </div>
    </div>
  );
}

function diffText(diff) {
  const sign = diff > 0 ? "+" : "−";
  return `${sign}${formatCurrency(fromPaise(Math.abs(diff)))}`;
}

function checkDetail(target, ok, diff, emptyText) {
  if (target === null) {
    return emptyText;
  }
  if (ok) {
    return formatCurrency(fromPaise(target));
  }
  return `${diffText(diff)} vs ${formatCurrency(fromPaise(target))}`;
}

/** Green tick when the arithmetic holds, red difference when it doesn't. */
function TotalsCheck({ check, lineCount }) {
  if (!lineCount && check.subtotal === null) {
    return null;
  }
  const linesOk = check.linesMatchSubtotal;
  const totalOk = check.totalMatches;
  return (
    <div
      aria-live="polite"
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3",
        linesOk && totalOk ? "border-success-border bg-success-subtle" : "border-danger-border bg-danger-subtle",
      )}
    >
      <CheckRow
        label={`Lines total ${formatCurrency(fromPaise(check.lineSum))} = subtotal`}
        ok={linesOk}
        detail={checkDetail(check.subtotal, linesOk, check.linesDiff, "Enter subtotal")}
      />
      <CheckRow
        label={`Subtotal + tax ${check.subtotal === null ? "" : formatCurrency(fromPaise(check.subtotal + check.tax))} = total`}
        ok={totalOk}
        detail={checkDetail(check.total, totalOk, check.totalDiff, "Enter total")}
      />
    </div>
  );
}

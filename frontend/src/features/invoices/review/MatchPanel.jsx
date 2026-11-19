import React from "react";
import { CircleCheck, CircleMinus, CircleX, Info, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const MATCH_TYPES = [
  { value: "NONE", label: "None", hint: "No PO matching. The invoice goes to approval after validation." },
  { value: "2WAY", label: "2-way", hint: "Invoice vs PO: description, unit price, ordered quantity, line amount." },
  { value: "3WAY", label: "3-way", hint: "Invoice vs PO vs goods receipts: quantity is checked against what was received." },
];

const NO_PO = "none";

/** Segmented radio group for the match type. */
function MatchTypeSelector({ value, onChange, disabled }) {
  const onKeyDown = (event) => {
    const index = MATCH_TYPES.findIndex((type) => type.value === value);
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (step) {
      event.preventDefault();
      const next = MATCH_TYPES[(index + step + MATCH_TYPES.length) % MATCH_TYPES.length];
      onChange(next.value);
      event.currentTarget.querySelector(`[data-value="${next.value}"]`)?.focus();
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Match type"
      onKeyDown={onKeyDown}
      className="inline-flex w-full rounded-lg bg-muted p-1 sm:w-fit"
    >
      {MATCH_TYPES.map((type) => {
        const active = type.value === value;
        return (
          <button
            key={type.value}
            type="button"
            role="radio"
            data-value={type.value}
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(type.value)}
            className={cn(
              "h-8 flex-1 rounded-md px-4 text-sm font-medium outline-none transition-colors sm:flex-none",
              "focus-visible:ring-[3px] focus-visible:ring-ring/35 disabled:opacity-50",
              active ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {type.label}
          </button>
        );
      })}
    </div>
  );
}

export function MatchPanel({
  matchType,
  onMatchTypeChange,
  purchaseOrder,
  purchaseOrders,
  onPurchaseOrderChange,
  purchaseOrdersState,
  preview,
  poError,
  readOnly,
}) {
  const hint = MATCH_TYPES.find((type) => type.value === matchType)?.hint;
  const matching = matchType !== "NONE";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <MatchTypeSelector value={matchType} onChange={onMatchTypeChange} disabled={readOnly} />
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="review-po">
          Purchase order
          {matching && (
            <span className="text-danger" aria-hidden="true">
              {" "}*
            </span>
          )}
        </Label>
        <Select
          value={purchaseOrder ? String(purchaseOrder.id) : NO_PO}
          onValueChange={(value) => onPurchaseOrderChange(value === NO_PO ? "" : value)}
          disabled={readOnly || purchaseOrdersState.loading || Boolean(purchaseOrdersState.error)}
        >
          <SelectTrigger id="review-po" aria-invalid={Boolean(poError) || undefined}>
            <SelectValue placeholder={purchaseOrdersState.loading ? "Loading purchase orders…" : "No purchase order"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_PO}>No purchase order</SelectItem>
            {purchaseOrders.map((po) => (
              <SelectItem key={po.id} value={String(po.id)}>
                {po.number} · {formatCurrency(po.total_amount)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {purchaseOrdersState.error && (
          <p role="alert" className="text-xs text-danger">
            {purchaseOrdersState.error}{" "}
            <button type="button" className="font-medium underline" onClick={purchaseOrdersState.reload}>
              Retry
            </button>
          </p>
        )}
        {poError && <p className="text-xs text-danger">{poError}</p>}
        {!purchaseOrdersState.loading && !purchaseOrdersState.error && purchaseOrders.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No purchase orders for this vendor. Choose the vendor first, or use “None”.
          </p>
        )}
      </div>

      {matching && <MatchPreview preview={preview} matchType={matchType} />}
    </div>
  );
}

const CHECK_LABELS = {
  description: "Description",
  unit_price: "Unit price",
  quantity: "Quantity",
  amount: "Line amount",
};

function MatchPreview({ preview, matchType }) {
  if (preview.state === "needs_po") {
    return (
      <p className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
        <Info className="size-4 shrink-0" aria-hidden="true" />
        Choose a purchase order to preview the match.
      </p>
    );
  }
  const ok = preview.state === "matched";
  return (
    <section aria-label="Match preview" aria-live="polite" className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-medium">Match preview</h4>
        <Badge variant={ok ? "success" : "danger"}>
          {ok ? <CircleCheck /> : <TriangleAlert />}
          {ok ? `${matchType === "3WAY" ? "3-way" : "2-way"} match looks good` : "Won't match yet"}
        </Badge>
      </div>

      {preview.issues.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-danger">
          {preview.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}

      <ul className="flex flex-col divide-y divide-border">
        {preview.rows.map((row) => (
          <PreviewLine key={row.line.key} row={row} />
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        Tolerances: unit price ±{preview.tolerances.price_percent}%, quantity +{preview.tolerances.quantity_percent}%.
        The server re-checks on save and also counts quantities already invoiced against this PO.
      </p>
    </section>
  );
}

function PreviewLine({ row }) {
  const label = row.line.description || `Line ${row.index + 1}`;
  if (!row.poLine) {
    return (
      <li className="flex items-center gap-2 py-2 text-sm">
        <CircleMinus className="size-4 shrink-0 text-danger" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="text-xs text-danger">Not linked to a PO line</span>
      </li>
    );
  }
  return (
    <li className="flex flex-col gap-2 py-2">
      <div className="flex items-center gap-2 text-sm">
        {row.status === "matched" ? (
          <CircleCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
        ) : (
          <CircleX className="size-4 shrink-0 text-danger" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">vs {row.poLine.description}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 pl-6 text-xs sm:grid-cols-4">
        {Object.entries(CHECK_LABELS).map(([key, text]) => (
          <div key={key} className="flex flex-col">
            <dt className="text-muted-foreground">{text}</dt>
            <dd className={cn("tabular-nums", row.checks[key] === "ok" ? "text-foreground" : "font-medium text-danger")}>
              {checkValue(key, row)}
            </dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

function checkValue(key, row) {
  const mark = row.checks[key] === "ok" ? "✓" : "✗";
  switch (key) {
    case "unit_price":
      return `${mark} ${formatCurrency(row.line.unit_price)} / PO ${formatCurrency(row.poLine.unit_price)}`;
    case "quantity":
      return `${mark} ${formatNumber(row.line.quantity)} / ${row.basis} ${formatNumber(row.baseQuantity)}`;
    case "amount":
      return `${mark} ${row.checks.amount === "ok" ? "within tolerance" : "differs from qty × PO price"}`;
    default:
      return `${mark} ${row.checks.description === "ok" ? "same as PO" : "differs from PO"}`;
  }
}

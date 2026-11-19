import React, { useEffect, useState } from "react";
import { Plus, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { Field, fieldProps } from "@/components/field";
import { InlineAlert } from "@/components/inline-alert";
import { Section } from "@/components/page";
import { getStatusMeta } from "@/components/status-badge";
import { useReferenceList } from "@/hooks/useReferenceList";
import { apiErrorMessage } from "@/lib/api-errors";
import { formatCurrency } from "@/lib/format";
import { fromPaise, lineAmountPaise, toPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { createPurchaseOrder } from "./api";
import {
  PO_STATUSES,
  emptyPoForm,
  emptyPoLine,
  hasErrors,
  poLinesToSend,
  poLinesTotalPaise,
  poPayload,
  validatePoForm,
} from "./model";

/** Create a purchase order with its lines; the PO total follows the lines unless overridden. */
export function PoFormSheet({ open, onOpenChange, onCreated }) {
  const vendors = useReferenceList("/vendors/", open, "Vendors");
  const [form, setForm] = useState(emptyPoForm);
  const [totalOverride, setTotalOverride] = useState(null);
  const [showErrors, setShowErrors] = useState(false);
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(emptyPoForm());
      setTotalOverride(null);
      setShowErrors(false);
      setServerError("");
    }
  }, [open]);

  const linesTotal = poLinesTotalPaise(poLinesToSend(form.lines));
  const effectiveTotal = totalOverride ?? (linesTotal > 0 ? fromPaise(linesTotal).toFixed(2) : "");
  const validation = validatePoForm(form, effectiveTotal);
  const errors = showErrors ? validation.errors : {};
  const lineErrors = showErrors ? validation.lineErrors : [];

  const set = (name) => (event) => setForm((current) => ({ ...current, [name]: event.target.value }));
  const setLines = (lines) => setForm((current) => ({ ...current, lines }));

  const submit = async (event) => {
    event.preventDefault();
    setShowErrors(true);
    if (hasErrors(validation)) {
      return;
    }
    setSaving(true);
    setServerError("");
    try {
      const po = await createPurchaseOrder(poPayload(form, effectiveTotal));
      toast.success(`Purchase order ${po.number} created.`);
      onOpenChange(false);
      onCreated(po);
    } catch (error) {
      setServerError(apiErrorMessage(error, { fallback: "The purchase order couldn't be created." }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <SheetContent className="sm:max-w-2xl">
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <SheetHeader>
            <SheetTitle>Create purchase order</SheetTitle>
            <SheetDescription>
              Add every line you expect to be invoiced; lines are needed for 3-way matching and
              goods receipts, and can't be edited after the PO is created.
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="flex flex-col gap-8">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="po-number" label="PO number" required error={errors.number}>
                <Input {...fieldProps("po-number", errors.number)} value={form.number} onChange={set("number")} autoFocus />
              </Field>
              <VendorField
                vendors={vendors}
                value={form.vendor}
                error={errors.vendor}
                onChange={(vendor) => setForm((current) => ({ ...current, vendor }))}
              />
              <Field id="po-order-date" label="Order date" required error={errors.order_date}>
                <Input
                  {...fieldProps("po-order-date", errors.order_date)}
                  type="date"
                  value={form.order_date}
                  onChange={set("order_date")}
                />
              </Field>
              <Field id="po-expected-date" label="Expected delivery" error={errors.expected_date}>
                <Input
                  {...fieldProps("po-expected-date", errors.expected_date)}
                  type="date"
                  min={form.order_date || undefined}
                  value={form.expected_date}
                  onChange={set("expected_date")}
                />
              </Field>
              <Field id="po-status" label="Status" hint="Only open POs can receive goods.">
                <Select value={form.status} onValueChange={(status) => setForm((current) => ({ ...current, status }))}>
                  <SelectTrigger {...fieldProps("po-status", null, true)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PO_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {getStatusMeta(status, "purchaseOrder").label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Section title="Lines" description="Amount = quantity × unit price.">
              <PoLinesEditor lines={form.lines} errors={lineErrors} onChange={setLines} />
            </Section>

            <TotalsPanel
              linesTotal={linesTotal}
              effectiveTotal={effectiveTotal}
              overridden={totalOverride !== null}
              error={errors.total_amount}
              onChange={setTotalOverride}
              onReset={() => setTotalOverride(null)}
            />

            {poLinesToSend(form.lines).length === 0 && (
              <InlineAlert tone="warning">
                Without lines this PO can only be 2-way matched on the total, and goods can't be received against it.
              </InlineAlert>
            )}
            {serverError && <InlineAlert tone="danger">{serverError}</InlineAlert>}
          </SheetBody>
          <SheetFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Create PO
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function VendorField({ vendors, value, error, onChange }) {
  const placeholder = vendors.loading ? "Loading vendors…" : "Choose a vendor";
  return (
    <Field id="po-vendor" label="Vendor" required error={error || vendors.error}>
      <Select value={value} onValueChange={onChange} disabled={vendors.loading || Boolean(vendors.error)}>
        <SelectTrigger {...fieldProps("po-vendor", error || vendors.error)}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {vendors.rows.map((vendor) => (
            <SelectItem key={vendor.id} value={String(vendor.id)}>
              {vendor.name}
              {vendor.status !== "ACTIVE" && ` (${getStatusMeta(vendor.status, "vendor").label.toLowerCase()})`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {vendors.error && (
        <button
          type="button"
          onClick={vendors.reload}
          className="inline-flex items-center gap-1 self-start text-xs font-medium text-danger underline-offset-2 hover:underline"
        >
          <RotateCw className="size-3" aria-hidden="true" />
          Retry loading vendors
        </button>
      )}
      {!vendors.loading && !vendors.error && vendors.rows.length === 0 && (
        <p className="text-xs text-muted-foreground">No vendors yet. Add one on the Vendors page first.</p>
      )}
    </Field>
  );
}

function PoLinesEditor({ lines, errors, onChange }) {
  const update = (index, changes) => {
    onChange(lines.map((line, position) => (position === index ? { ...line, ...changes } : line)));
  };
  return (
    <div className="flex flex-col gap-3">
      {lines.length === 0 && (
        <p className="rounded-md border border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted-foreground">
          No lines. Add the goods or services being ordered.
        </p>
      )}
      <ol className="flex flex-col gap-3">
        {lines.map((line, index) => (
          <PoLineRow
            key={line.key}
            index={index}
            line={line}
            errors={errors[index] || {}}
            onChange={(changes) => update(index, changes)}
            onRemove={() => onChange(lines.filter((_, position) => position !== index))}
          />
        ))}
      </ol>
      <Button variant="outline" size="sm" className="self-start" onClick={() => onChange([...lines, emptyPoLine()])}>
        <Plus />
        Add line
      </Button>
    </div>
  );
}

function PoLineRow({ index, line, errors, onChange, onRemove }) {
  const id = `po-${line.key}`;
  const amount = lineAmountPaise(line);
  return (
    <li className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_6rem_8rem_7rem_auto] sm:items-start">
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor={`${id}-description`}>Line {index + 1}</Label>
        <Input
          id={`${id}-description`}
          value={line.description}
          placeholder="Description"
          aria-invalid={Boolean(errors.description) || undefined}
          onChange={(event) => onChange({ description: event.target.value })}
        />
        <LineError text={errors.description} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-quantity`}>Qty</Label>
        <Input
          id={`${id}-quantity`}
          type="number"
          inputMode="decimal"
          min="0.001"
          step="0.001"
          value={line.quantity}
          aria-invalid={Boolean(errors.quantity) || undefined}
          onChange={(event) => onChange({ quantity: event.target.value })}
          className="tabular-nums"
        />
        <LineError text={errors.quantity} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-price`}>Unit price</Label>
        <Input
          id={`${id}-price`}
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={line.unit_price}
          aria-invalid={Boolean(errors.unit_price) || undefined}
          onChange={(event) => onChange({ unit_price: event.target.value })}
          className="tabular-nums"
        />
        <LineError text={errors.unit_price} />
      </div>
      <div className="flex flex-col gap-2 sm:items-end">
        <span className="text-sm font-medium leading-none">Amount</span>
        <span className="flex h-9 items-center text-sm tabular-nums">{formatCurrency(fromPaise(amount))}</span>
      </div>
      <div className="flex sm:pt-6">
        <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove line ${index + 1}`}>
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

function LineError({ text }) {
  return text ? <p className="text-xs text-danger">{text}</p> : null;
}

function TotalsPanel({ linesTotal, effectiveTotal, overridden, error, onChange, onReset }) {
  const total = toPaise(effectiveTotal) ?? 0;
  const difference = total - linesTotal;
  return (
    <div className={cn("flex flex-col gap-4 rounded-lg border p-4", error ? "border-danger-border bg-danger-subtle" : "border-border bg-muted/50")}>
      <dl className="flex items-center justify-between gap-4 text-sm">
        <dt className="text-muted-foreground">Lines total</dt>
        <dd className="font-medium tabular-nums">{formatCurrency(fromPaise(linesTotal))}</dd>
      </dl>
      <Field
        id="po-total"
        label="PO total"
        required
        error={error}
        hint={overridden
          ? "Set by hand (e.g. to include freight or tax). It must be at least the lines total."
          : "Follows the lines total. Type to override."}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Input
            {...fieldProps("po-total", error, true)}
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={effectiveTotal}
            onChange={(event) => onChange(event.target.value)}
            className="w-40 tabular-nums"
          />
          {overridden && (
            <Button variant="ghost" size="sm" onClick={onReset}>
              Match lines total
            </Button>
          )}
        </div>
      </Field>
      {overridden && linesTotal > 0 && difference > 0 && (
        <p className="text-xs text-muted-foreground tabular-nums">
          {formatCurrency(fromPaise(difference))} above the lines total.
        </p>
      )}
    </div>
  );
}

import React, { useEffect, useRef, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { Field, fieldProps } from "@/components/field";
import { InlineAlert } from "@/components/inline-alert";
import { Section } from "@/components/page";
import { Progress } from "@/components/progress";
import { apiErrorMessage } from "@/lib/api-errors";
import { formatCurrency, formatNumber } from "@/lib/format";
import { fromPaise } from "@/lib/money";
import { createGoodsReceipt } from "./api";
import {
  emptyGrnForm,
  grnPayload,
  grnRowsForPo,
  grnTotals,
  hasErrors,
  newKey,
  receivablePurchaseOrders,
  remainingQuantity,
  validateGrnForm,
} from "./model";

/** Record a delivery against an open PO: one row per PO line received. */
export function GrnFormSheet({ open, initialPo, orders, userId, onOpenChange, onCreated }) {
  const [form, setForm] = useState(emptyGrnForm);
  const [showErrors, setShowErrors] = useState(false);
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);
  const pendingInitial = useRef("");

  const receivable = receivablePurchaseOrders(orders.rows);
  const po = orders.rows.find((order) => String(order.id) === form.purchase_order) || null;

  useEffect(() => {
    if (open) {
      setForm(emptyGrnForm());
      setShowErrors(false);
      setServerError("");
      pendingInitial.current = initialPo || "";
    }
  }, [open, initialPo]);

  // Preselect the PO from ?po= once the PO list has loaded.
  useEffect(() => {
    const wanted = pendingInitial.current;
    if (!open || !wanted || orders.loading) {
      return;
    }
    pendingInitial.current = "";
    const match = receivable.find((order) => String(order.id) === String(wanted));
    if (match) {
      setForm((current) => ({ ...current, purchase_order: String(match.id), lines: grnRowsForPo(match) }));
    }
  }, [open, orders.loading, receivable]);

  const validation = validateGrnForm(form, po);
  const errors = showErrors ? validation.errors : {};
  const lineErrors = showErrors ? validation.lineErrors : [];
  const totals = grnTotals(form, po);

  const set = (name) => (event) => setForm((current) => ({ ...current, [name]: event.target.value }));
  const choosePo = (id) => {
    const order = orders.rows.find((candidate) => String(candidate.id) === id);
    setForm((current) => ({ ...current, purchase_order: id, lines: grnRowsForPo(order) }));
  };
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
      const grn = await createGoodsReceipt(grnPayload(form, userId));
      toast.success(`Goods receipt ${grn.number} recorded.`);
      onOpenChange(false);
      onCreated(grn);
    } catch (error) {
      setServerError(apiErrorMessage(error, { fallback: "The goods receipt couldn't be saved." }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <SheetContent className="sm:max-w-2xl">
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <SheetHeader>
            <SheetTitle>Record goods receipt</SheetTitle>
            <SheetDescription>
              Enter what actually arrived. Quantities can't exceed what is still open on each PO line.
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="flex flex-col gap-8">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="grn-number" label="GRN number" required error={errors.number}>
                <Input {...fieldProps("grn-number", errors.number)} value={form.number} onChange={set("number")} autoFocus />
              </Field>
              <Field id="grn-date" label="Received on" required error={errors.received_date}>
                <Input
                  {...fieldProps("grn-date", errors.received_date)}
                  type="date"
                  value={form.received_date}
                  onChange={set("received_date")}
                />
              </Field>
              <PoField
                orders={orders}
                receivable={receivable}
                value={form.purchase_order}
                error={errors.purchase_order}
                onChange={choosePo}
              />
              <Field id="grn-notes" label="Notes" className="sm:col-span-2">
                <Textarea
                  id="grn-notes"
                  value={form.notes}
                  onChange={set("notes")}
                  placeholder="Delivery note number, condition, short shipments…"
                  className="min-h-16"
                />
              </Field>
            </div>

            {po && (
              <Section
                title="Received lines"
                description="The light segment of each bar is this receipt."
                aside={(
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLines(form.lines.map((row) => {
                      const line = po.lines.find((candidate) => String(candidate.id) === row.po_line);
                      return line ? { ...row, quantity: String(remainingQuantity(line)) } : row;
                    }))}
                    disabled={!form.lines.length}
                  >
                    Fill remaining quantities
                  </Button>
                )}
              >
                <GrnLinesEditor po={po} rows={form.lines} errors={lineErrors} onChange={setLines} />
                {errors.lines && <p className="text-sm text-danger">{errors.lines}</p>}
                <dl className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-muted/50 p-4 text-sm">
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-muted-foreground">Quantity in this receipt</dt>
                    <dd className="font-medium tabular-nums">{formatNumber(totals.quantity)}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5 text-right">
                    <dt className="text-muted-foreground">Value at PO prices</dt>
                    <dd className="font-medium tabular-nums">{formatCurrency(fromPaise(totals.valuePaise))}</dd>
                  </div>
                </dl>
              </Section>
            )}

            {serverError && <InlineAlert tone="danger">{serverError}</InlineAlert>}
          </SheetBody>
          <SheetFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={!po}>
              Save receipt
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function PoField({ orders, receivable, value, error, onChange }) {
  const message = error || orders.error;
  return (
    <Field id="grn-po" label="Purchase order" required error={message} className="sm:col-span-2">
      <Select value={value} onValueChange={onChange} disabled={orders.loading || Boolean(orders.error)}>
        <SelectTrigger {...fieldProps("grn-po", message)}>
          <SelectValue placeholder={orders.loading ? "Loading purchase orders…" : "Choose an open PO"} />
        </SelectTrigger>
        <SelectContent>
          {receivable.map((order) => (
            <SelectItem key={order.id} value={String(order.id)}>
              {order.number} · {order.vendor_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {orders.error && (
        <button
          type="button"
          onClick={orders.reload}
          className="inline-flex items-center gap-1 self-start text-xs font-medium text-danger underline-offset-2 hover:underline"
        >
          <RotateCw className="size-3" aria-hidden="true" />
          Retry loading purchase orders
        </button>
      )}
      {!orders.loading && !orders.error && receivable.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No open purchase order has quantity left to receive. Create a PO with lines first.
        </p>
      )}
    </Field>
  );
}

function GrnLinesEditor({ po, rows, errors, onChange }) {
  const openLines = po.lines.filter((line) => remainingQuantity(line) > 0);
  const chosen = new Set(rows.map((row) => row.po_line));
  const unchosen = openLines.filter((line) => !chosen.has(String(line.id)));

  const update = (index, changes) => {
    onChange(rows.map((row, position) => (position === index ? { ...row, ...changes } : row)));
  };

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 && (
        <p className="rounded-md border border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted-foreground">
          No lines in this receipt. Add the lines that were delivered.
        </p>
      )}
      <ol className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <GrnLineRow
            key={row.key}
            index={index}
            row={row}
            options={openLines.filter((line) => String(line.id) === row.po_line || !chosen.has(String(line.id)))}
            poLine={po.lines.find((line) => String(line.id) === row.po_line)}
            errors={errors[index] || {}}
            onChange={(changes) => update(index, changes)}
            onRemove={() => onChange(rows.filter((_, position) => position !== index))}
          />
        ))}
      </ol>
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        disabled={unchosen.length === 0}
        onClick={() => onChange([...rows, { key: newKey("grn-line"), po_line: String(unchosen[0].id), quantity: "" }])}
      >
        <Plus />
        Add line
      </Button>
    </div>
  );
}

function GrnLineRow({ index, row, options, poLine, errors, onChange, onRemove }) {
  const id = `grn-${row.key}`;
  const remaining = poLine ? remainingQuantity(poLine) : 0;
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-start">
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor={`${id}-line`}>PO line</Label>
          <Select value={row.po_line} onValueChange={(po_line) => onChange({ po_line })}>
            <SelectTrigger id={`${id}-line`} aria-invalid={Boolean(errors.po_line) || undefined}>
              <SelectValue placeholder="Choose a line" />
            </SelectTrigger>
            <SelectContent>
              {options.map((line) => (
                <SelectItem key={line.id} value={String(line.id)}>
                  {line.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.po_line && <p className="text-xs text-danger">{errors.po_line}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-quantity`}>Received qty</Label>
          <Input
            id={`${id}-quantity`}
            type="number"
            inputMode="decimal"
            min="0.001"
            max={remaining || undefined}
            step="0.001"
            value={row.quantity}
            placeholder={remaining ? String(remaining) : ""}
            aria-invalid={Boolean(errors.quantity) || undefined}
            onChange={(event) => onChange({ quantity: event.target.value })}
            className="tabular-nums"
          />
          {errors.quantity && <p className="text-xs text-danger">{errors.quantity}</p>}
        </div>
        <div className="flex sm:pt-6">
          <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove line ${index + 1}`}>
            <Trash2 />
          </Button>
        </div>
      </div>
      {poLine && (
        <div className="flex flex-col gap-1">
          <Progress
            value={poLine.received_quantity}
            extra={row.quantity}
            max={poLine.quantity}
            label={`${poLine.description}: received including this receipt`}
          />
          <p className="text-xs text-muted-foreground tabular-nums">
            Ordered {formatNumber(poLine.quantity)} · already received {formatNumber(poLine.received_quantity)} ·{" "}
            {formatNumber(remaining)} left
          </p>
        </div>
      )}
    </li>
  );
}

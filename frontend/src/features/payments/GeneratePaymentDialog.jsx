import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { Field, fieldProps } from "@/components/field";
import { InlineAlert } from "@/components/inline-alert";
import { LoadingState } from "@/components/states";
import { useRemoteData } from "@/hooks/useRemoteData";
import { apiErrorMessage } from "@/lib/api-errors";
import { formatCurrency } from "@/lib/format";
import { generatePayment, listApprovedInvoices } from "./api";
import { PAYMENT_METHODS } from "./model";

/** Create a payment request for a fully approved invoice that doesn't have one yet. */
export function GeneratePaymentDialog({ open, onOpenChange, existingInvoiceIds, onCreated }) {
  const invoices = useRemoteData(listApprovedInvoices, `approved-${open}`, {
    enabled: open,
    fallback: "Approved invoices couldn't be loaded.",
  });
  const [invoice, setInvoice] = useState("");
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setInvoice("");
      setMethod("BANK_TRANSFER");
      setError("");
    }
  }, [open]);

  const candidates = (invoices.data || []).filter((row) => !existingInvoiceIds.has(row.id));

  const submit = async (event) => {
    event.preventDefault();
    if (!invoice) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payment = await generatePayment(invoice, method);
      toast.success(`Payment request ${payment.reference} created.`);
      onOpenChange(false);
      onCreated(payment);
    } catch (err) {
      setError(apiErrorMessage(err, { fallback: "The payment request couldn't be generated." }));
    } finally {
      setSaving(false);
    }
  };

  let invoiceField;
  if (invoices.error) {
    invoiceField = <InlineAlert tone="danger" onRetry={invoices.reload}>{invoices.error}</InlineAlert>;
  } else if (!invoices.data) {
    invoiceField = <LoadingState rows={1} className="p-0" />;
  } else if (!candidates.length) {
    invoiceField = (
      <InlineAlert tone="info" title="Nothing to pay right now">
        Every approved invoice already has a payment request. Invoices appear here once their last
        approval step is complete.
      </InlineAlert>
    );
  } else {
    invoiceField = (
      <Field id="payment-invoice" label="Approved invoice" required>
        <Select value={invoice} onValueChange={setInvoice}>
          <SelectTrigger {...fieldProps("payment-invoice")}>
            <SelectValue placeholder="Choose an invoice" />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((row) => (
              <SelectItem key={row.id} value={String(row.id)}>
                {row.invoice_number} · {row.vendor_name} · {formatCurrency(row.total_amount)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Generate payment request</DialogTitle>
            <DialogDescription>
              Creates a request and payment advice for the full invoice amount. It doesn't send any money.
            </DialogDescription>
          </DialogHeader>
          {invoiceField}
          <Field id="payment-method" label="Payment method">
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger {...fieldProps("payment-method")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={!invoice}>
              Generate request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

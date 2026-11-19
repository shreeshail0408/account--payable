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
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { Field, fieldProps } from "@/components/field";
import { InlineAlert } from "@/components/inline-alert";
import { apiErrorMessage } from "@/lib/api-errors";
import { formatCurrency } from "@/lib/format";
import { markPaid } from "./api";
import { DemoBadge } from "./DemoBadge";

/**
 * POST /payments/{id}/mark_paid/ only records a status. Without a bank integration it is a demo
 * action: the reference is prefilled with DEMO- and the dialog says no money moves.
 */
export function RecordPaidDialog({ open, onOpenChange, payment, bankConfigured, onDone }) {
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const demo = !bankConfigured;

  useEffect(() => {
    if (open) {
      setReference(demo ? `DEMO-${payment.reference}` : "");
      setError("");
    }
  }, [open, demo, payment.reference]);

  const trimmed = reference.trim();
  const invalid = !trimmed || trimmed.length > 100;

  const submit = async (event) => {
    event.preventDefault();
    if (invalid) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      await markPaid(payment.id, trimmed);
      toast.success(demo ? `${payment.reference} recorded as paid (demo).` : `${payment.reference} recorded as paid.`, {
        description: demo ? "No money was transferred." : undefined,
      });
      onOpenChange(false);
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err, { fallback: "The payment couldn't be recorded as paid." }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{demo ? "Record demo payment" : "Record payment as paid"}</DialogTitle>
            <DialogDescription>
              {payment.reference} · {formatCurrency(payment.amount)} to {payment.vendor_name}. The invoice
              is marked paid.
            </DialogDescription>
          </DialogHeader>
          {demo ? (
            <InlineAlert tone="warning" title="Demo – no real money transfer">
              No bank integration is configured. This only changes the status in PayFlow.
              <span className="mt-2 block">
                <DemoBadge />
              </span>
            </InlineAlert>
          ) : (
            <InlineAlert tone="info">
              This records a settlement you've confirmed with the bank. It doesn't send money.
            </InlineAlert>
          )}
          <Field
            id="bank-reference"
            label="Bank reference"
            required
            hint={demo ? "Keep the DEMO- prefix so the record stays marked as a demo." : "UTR, cheque number or the bank's transaction ID."}
            error={trimmed.length > 100 ? "Use 100 characters or fewer." : null}
          >
            <Input
              {...fieldProps("bank-reference", trimmed.length > 100, true)}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              autoFocus
            />
          </Field>
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={invalid}>
              {demo ? "Record demo payment" : "Record as paid"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

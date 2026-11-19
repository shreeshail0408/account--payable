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
import { Field, fieldProps } from "@/components/field";
import { InlineAlert } from "@/components/inline-alert";
import { apiErrorMessage, fieldErrorsFrom } from "@/lib/api-errors";
import { saveBankDetails } from "./api";
import { emptyBankForm, validateBankForm } from "./model";

const FIELDS = ["bank_name", "bank_account", "ifsc"];

/** ADMIN: replace a vendor's bank account (POST /vendors/{id}/bank-details/). */
export function BankDetailsDialog({ open, onOpenChange, vendor, onSaved }) {
  const [form, setForm] = useState(() => emptyBankForm(vendor));
  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(emptyBankForm(vendor));
      setShowErrors(false);
      setServerErrors({});
      setServerError("");
    }
    // Reset on open only; a background refresh of `vendor` must not wipe what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vendor.id]);

  const errors = showErrors ? { ...validateBankForm(form), ...serverErrors } : serverErrors;
  const set = (name, transform = (value) => value) => (event) => {
    setForm((current) => ({ ...current, [name]: transform(event.target.value) }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setShowErrors(true);
    setServerErrors({});
    if (Object.keys(validateBankForm(form)).length) {
      return;
    }
    setSaving(true);
    setServerError("");
    try {
      const updated = await saveBankDetails(vendor.id, form);
      onOpenChange(false);
      onSaved(updated);
    } catch (error) {
      const fieldErrors = fieldErrorsFrom(error, FIELDS);
      setServerErrors(fieldErrors);
      if (!Object.keys(fieldErrors).length) {
        setServerError(apiErrorMessage(error, { fallback: "The bank details couldn't be saved." }));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>Bank details for {vendor.name}</DialogTitle>
            <DialogDescription>
              Current account: <span className="font-mono">{vendor.bank_account || "none"}</span>. Enter the
              full new account number; the change is logged and the account becomes unverified.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field id="bank-name" label="Bank name" required error={errors.bank_name}>
              <Input {...fieldProps("bank-name", errors.bank_name)} value={form.bank_name} onChange={set("bank_name")} />
            </Field>
            <Field id="bank-account" label="Full account number" required error={errors.bank_account}>
              <Input
                {...fieldProps("bank-account", errors.bank_account)}
                value={form.bank_account}
                maxLength={34}
                autoComplete="off"
                className="font-mono"
                onChange={set("bank_account")}
              />
            </Field>
            <Field id="bank-ifsc" label="IFSC" required error={errors.ifsc}>
              <Input
                {...fieldProps("bank-ifsc", errors.ifsc)}
                value={form.ifsc}
                maxLength={11}
                className="font-mono"
                onChange={set("ifsc", (value) => value.toUpperCase().replace(/\s/g, ""))}
              />
            </Field>
          </div>
          {serverError && <InlineAlert tone="danger">{serverError}</InlineAlert>}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save bank details
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

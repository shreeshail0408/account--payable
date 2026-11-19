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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { Field, fieldProps } from "@/components/field";
import { InlineAlert } from "@/components/inline-alert";
import { apiErrorMessage, fieldErrorsFrom } from "@/lib/api-errors";
import { createVendor } from "./api";
import { GstinFormatBadge } from "./GstinFormatBadge";
import { emptyVendorForm, validateVendorForm } from "./model";

const FIELDS = ["code", "name", "email", "phone", "gstin", "pan", "address"];

/** Submit a new vendor for onboarding (POST /vendors/). The server sets status PENDING. */
export function VendorFormDialog({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState(emptyVendorForm);
  const [errors, setErrors] = useState({});
  const [showErrors, setShowErrors] = useState(false);
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(emptyVendorForm());
      setErrors({});
      setShowErrors(false);
      setServerError("");
    }
  }, [open]);

  const set = (name, transform = (value) => value) => (event) => {
    setForm((current) => ({ ...current, [name]: transform(event.target.value) }));
  };
  const upper = (value) => value.toUpperCase().replace(/\s/g, "");

  const visibleErrors = showErrors ? { ...validateVendorForm(form), ...errors } : errors;

  const submit = async (event) => {
    event.preventDefault();
    const invalid = validateVendorForm(form);
    setShowErrors(true);
    setErrors({});
    if (Object.keys(invalid).length) {
      return;
    }
    setSaving(true);
    setServerError("");
    try {
      const vendor = await createVendor(form);
      toast.success(`${vendor.name} submitted for onboarding`, {
        description: "An administrator reviews it before invoices can be processed.",
      });
      onOpenChange(false);
      onCreated(vendor);
    } catch (error) {
      const fieldErrors = fieldErrorsFrom(error, FIELDS);
      setErrors(fieldErrors);
      if (!Object.keys(fieldErrors).length) {
        setServerError(apiErrorMessage(error, { fallback: "The vendor couldn't be saved." }));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit} noValidate className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>Add vendor</DialogTitle>
            <DialogDescription>
              New vendors start as pending. An administrator approves them, and adds bank details
              separately.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="vendor-code" label="Vendor code" required error={visibleErrors.code}>
              <Input {...fieldProps("vendor-code", visibleErrors.code)} value={form.code} onChange={set("code")} autoFocus />
            </Field>
            <Field id="vendor-name" label="Legal name" required error={visibleErrors.name}>
              <Input {...fieldProps("vendor-name", visibleErrors.name)} value={form.name} onChange={set("name")} />
            </Field>
            <Field id="vendor-email" label="Email" required error={visibleErrors.email}>
              <Input
                {...fieldProps("vendor-email", visibleErrors.email)}
                type="email"
                value={form.email}
                onChange={set("email")}
              />
            </Field>
            <Field id="vendor-phone" label="Phone" error={visibleErrors.phone}>
              <Input
                {...fieldProps("vendor-phone", visibleErrors.phone)}
                type="tel"
                maxLength={30}
                value={form.phone}
                onChange={set("phone")}
              />
            </Field>
            <Field
              id="vendor-gstin"
              label="GSTIN"
              error={visibleErrors.gstin}
              hint={!visibleErrors.gstin && form.gstin.length === 15 ? null : "15 characters, optional"}
            >
              <Input
                {...fieldProps("vendor-gstin", visibleErrors.gstin, true)}
                value={form.gstin}
                maxLength={15}
                className="font-mono"
                onChange={set("gstin", upper)}
              />
              {form.gstin.length === 15 && !visibleErrors.gstin && <GstinFormatBadge gstin={form.gstin} />}
            </Field>
            <Field id="vendor-pan" label="PAN" error={visibleErrors.pan} hint="10 characters, optional">
              <Input
                {...fieldProps("vendor-pan", visibleErrors.pan, true)}
                value={form.pan}
                maxLength={10}
                className="font-mono"
                onChange={set("pan", upper)}
              />
            </Field>
            <Field id="vendor-address" label="Address" className="sm:col-span-2" error={visibleErrors.address}>
              <Textarea
                {...fieldProps("vendor-address", visibleErrors.address)}
                value={form.address}
                onChange={set("address")}
                className="min-h-16"
              />
            </Field>
          </div>

          {serverError && <InlineAlert tone="danger">{serverError}</InlineAlert>}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Submit for onboarding
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

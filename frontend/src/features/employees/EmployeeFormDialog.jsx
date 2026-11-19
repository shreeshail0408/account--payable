import React, { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { ROLE_LABELS } from "@/auth";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { Field, fieldProps } from "@/components/field";
import { InlineAlert } from "@/components/inline-alert";
import { apiErrorMessage, fieldErrorsFrom } from "@/lib/api-errors";
import { createEmployee } from "./api";

const ROLES = ["AP_CLERK", "APPROVER", "ACCOUNTANT", "AUDITOR", "ADMIN"];
const FIELDS = ["username", "email", "first_name", "last_name", "role", "password"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 12;

const emptyForm = () => ({ username: "", email: "", first_name: "", last_name: "", role: "AP_CLERK", password: "" });

function validate(form) {
  const errors = {};
  if (!form.username.trim()) {
    errors.username = "Choose a username.";
  }
  if (!EMAIL_PATTERN.test(form.email.trim())) {
    errors.email = "Enter a valid work email.";
  }
  if (form.password.length < PASSWORD_MIN) {
    errors.password = `Use at least ${PASSWORD_MIN} characters.`;
  }
  return errors;
}

/** Create an employee account. The server always creates it inactive. */
export function EmployeeFormDialog({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState(emptyForm);
  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(emptyForm());
      setShowErrors(false);
      setServerErrors({});
      setServerError("");
      setShowPassword(false);
    }
  }, [open]);

  const errors = showErrors ? { ...validate(form), ...serverErrors } : serverErrors;
  const set = (name) => (event) => setForm((current) => ({ ...current, [name]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setShowErrors(true);
    setServerErrors({});
    if (Object.keys(validate(form)).length) {
      return;
    }
    setSaving(true);
    setServerError("");
    try {
      const employee = await createEmployee(form);
      toast.success(`${employee.username} created (inactive).`, {
        description: "Activate the account when the person is ready to sign in.",
      });
      onOpenChange(false);
      onCreated(employee);
    } catch (error) {
      const fieldErrors = fieldErrorsFrom(error, FIELDS);
      setServerErrors(fieldErrors);
      if (!Object.keys(fieldErrors).length) {
        setServerError(apiErrorMessage(error, { fallback: "The account couldn't be created." }));
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
            <DialogTitle>Add employee</DialogTitle>
            <DialogDescription>
              New accounts start inactive. Share the temporary password privately, then activate the account.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="employee-username" label="Username" required error={errors.username}>
              <Input
                {...fieldProps("employee-username", errors.username)}
                value={form.username}
                autoComplete="off"
                onChange={set("username")}
                autoFocus
              />
            </Field>
            <Field id="employee-email" label="Work email" required error={errors.email}>
              <Input {...fieldProps("employee-email", errors.email)} type="email" value={form.email} onChange={set("email")} />
            </Field>
            <Field id="employee-first" label="First name" error={errors.first_name}>
              <Input {...fieldProps("employee-first", errors.first_name)} value={form.first_name} onChange={set("first_name")} />
            </Field>
            <Field id="employee-last" label="Last name" error={errors.last_name}>
              <Input {...fieldProps("employee-last", errors.last_name)} value={form.last_name} onChange={set("last_name")} />
            </Field>
            <Field id="employee-role" label="Role" required error={errors.role}>
              <Select value={form.role} onValueChange={(role) => setForm((current) => ({ ...current, role }))}>
                <SelectTrigger {...fieldProps("employee-role", errors.role)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              id="employee-password"
              label="Temporary password"
              required
              error={errors.password}
              hint={`At least ${PASSWORD_MIN} characters; avoid common words.`}
            >
              <div className="relative">
                <Input
                  {...fieldProps("employee-password", errors.password, true)}
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={set("password")}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/35"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
          </div>
          {form.role === "ADMIN" && (
            <InlineAlert tone="warning">Administrators can do everything, including managing bank details and employees.</InlineAlert>
          )}
          {serverError && <InlineAlert tone="danger">{serverError}</InlineAlert>}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Create inactive account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

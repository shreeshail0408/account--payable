import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, fieldProps } from "@/components/field";
import { InlineAlert } from "@/components/inline-alert";
import { PasswordInput } from "@/components/password-input";
import { apiErrorMessage, fieldErrorsFrom } from "@/lib/api-errors";
import { changePassword } from "./api";
import { PASSWORD_MIN, emptyPasswordForm, validatePasswordForm } from "./model";

const SERVER_FIELDS = ["current_password", "new_password"];

/**
 * Current + new + confirm. `forced` relabels the first field for administrator-set passwords.
 * `onChanged(session)` receives the fresh {access, refresh, user} the API returns.
 */
export function ChangePasswordForm({ forced = false, onChanged, onCancel, submitLabel = "Change password" }) {
  const [form, setForm] = useState(emptyPasswordForm);
  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);

  const errors = { ...(showErrors ? validatePasswordForm(form) : {}), ...serverErrors };

  const set = (name) => (event) => {
    const { value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setServerErrors((current) => ({ ...current, [name]: undefined }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setShowErrors(true);
    if (Object.keys(validatePasswordForm(form)).length) {
      return;
    }
    setSaving(true);
    setServerError("");
    setServerErrors({});
    try {
      const session = await changePassword({
        current_password: form.current_password,
        new_password: form.new_password,
      });
      onChanged(session);
    } catch (error) {
      const fieldErrors = fieldErrorsFrom(error, SERVER_FIELDS);
      setServerErrors(fieldErrors);
      if (!Object.keys(fieldErrors).length) {
        setServerError(apiErrorMessage(error, { fallback: "Your password couldn't be changed." }));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field
        id="password-current"
        label={forced ? "Temporary password" : "Current password"}
        required
        error={errors.current_password}
        hint={forced ? "The password your administrator gave you." : undefined}
      >
        <PasswordInput
          {...fieldProps("password-current", errors.current_password, forced)}
          autoComplete="current-password"
          value={form.current_password}
          onChange={set("current_password")}
          disabled={saving}
          autoFocus
        />
      </Field>
      <Field
        id="password-new"
        label="New password"
        required
        error={errors.new_password}
        hint={`At least ${PASSWORD_MIN} characters, not like your username or email, no common words.`}
      >
        <PasswordInput
          {...fieldProps("password-new", errors.new_password, true)}
          autoComplete="new-password"
          value={form.new_password}
          onChange={set("new_password")}
          disabled={saving}
        />
      </Field>
      <Field id="password-confirm" label="Confirm new password" required error={errors.confirm_password}>
        <PasswordInput
          {...fieldProps("password-confirm", errors.confirm_password)}
          autoComplete="new-password"
          value={form.confirm_password}
          onChange={set("confirm_password")}
          disabled={saving}
        />
      </Field>

      {serverError && <InlineAlert tone="danger">{serverError}</InlineAlert>}

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={saving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

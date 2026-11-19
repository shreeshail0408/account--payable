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
import { Textarea } from "@/components/ui/textarea";
import { Field, fieldProps } from "@/components/field";
import { InlineAlert } from "@/components/inline-alert";
import { apiErrorMessage } from "@/lib/api-errors";

/**
 * Confirmation for consequential actions (onboarding decisions, deactivation, deletes).
 *
 * `comment` adds a textarea: { label, placeholder, required, minLength }. A required comment
 * keeps the confirm button disabled until it is long enough.
 * `onConfirm(comment)` may return a promise; while it runs the dialog stays open with a
 * spinner, and a rejection shows the API error inside the dialog instead of closing it.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = false,
  comment,
  onConfirm,
  errorFallback = "That didn't work. Try again.",
  children,
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setText("");
      setError("");
      setBusy(false);
    }
  }, [open]);

  const minLength = comment?.minLength ?? (comment?.required ? 2 : 0);
  const commentMissing = Boolean(comment?.required) && text.trim().length < minLength;

  const confirm = async (event) => {
    event.preventDefault();
    if (commentMissing || busy) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onConfirm(text.trim());
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, { fallback: errorFallback }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent hideClose>
        <form onSubmit={confirm} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>

          {children}

          {comment && (
            <Field
              id="confirm-comment"
              label={comment.label}
              required={comment.required}
              hint={comment.required ? `At least ${minLength} characters.` : comment.hint}
            >
              <Textarea
                {...fieldProps("confirm-comment", null, true)}
                value={text}
                autoFocus
                placeholder={comment.placeholder}
                onChange={(event) => setText(event.target.value)}
              />
            </Field>
          )}

          {error && <InlineAlert tone="danger">{error}</InlineAlert>}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              loading={busy}
              disabled={commentMissing}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

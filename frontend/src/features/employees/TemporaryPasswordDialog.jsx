import React, { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { InlineAlert } from "@/components/inline-alert";

/** Shows a reset's temporary password once, with copy. `result` = {temporary_password, employee}. */
export function TemporaryPasswordDialog({ result, onClose }) {
  const [copied, setCopied] = useState(false);
  const employee = result?.employee;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.temporary_password);
      setCopied(true);
      toast.success("Temporary password copied.");
    } catch {
      toast.error("Couldn't copy. Select the password and copy it manually.");
    }
  };

  const close = (open) => {
    if (!open) {
      setCopied(false);
      onClose();
    }
  };

  return (
    <Dialog open={Boolean(result)} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{`Temporary password for ${employee?.username}`}</DialogTitle>
          <DialogDescription>
            Share it privately, in person or by phone, not in a group chat or email thread.
            They must choose a new password when they sign in.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <code
            className="min-w-0 flex-1 select-all break-all rounded-md border border-border bg-muted px-3 py-2.5 font-mono text-base tracking-wide"
            aria-label="Temporary password"
          >
            {result?.temporary_password}
          </code>
          <Button variant="outline" size="icon" onClick={copy} aria-label="Copy temporary password">
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>

        <InlineAlert tone="warning">
          This is the only time it is shown. If it gets lost, reset the password again.
        </InlineAlert>
        {employee && !employee.is_active && (
          <InlineAlert tone="info">
            {`${employee.username} is still inactive. Activate the account so they can sign in.`}
          </InlineAlert>
        )}

        <DialogFooter>
          <Button onClick={() => close(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

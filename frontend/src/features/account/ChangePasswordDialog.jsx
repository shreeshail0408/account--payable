import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/auth";
import { ChangePasswordForm } from "./ChangePasswordForm";

/** Voluntary password change, opened from the account menu. */
export function ChangePasswordDialog({ open, onOpenChange }) {
  const { signIn } = useAuth();

  const changed = (session) => {
    signIn(session);
    onOpenChange(false);
    toast.success("Password changed. You were signed out on your other devices.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            You stay signed in here; other devices and browsers are signed out.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <ChangePasswordForm
            onChanged={changed}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

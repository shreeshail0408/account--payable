import React from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/auth";
import { ChangePasswordForm } from "./ChangePasswordForm";

/**
 * Shown instead of the app while `user.must_change_password` is set (new account or an
 * administrator reset). The API refuses everything else until the password is changed.
 */
export default function ChangePasswordPage() {
  const { user, signIn, logout } = useAuth();
  const navigate = useNavigate();

  const changed = (session) => {
    signIn(session);
    toast.success("Password changed. Welcome to PayFlow AP.");
    navigate("/", { replace: true });
  };

  const signOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div data-ui="" className="flex min-h-dvh items-center justify-center bg-background px-4 py-12 text-foreground">
      <main className="flex w-full max-w-sm animate-page-in flex-col gap-8">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
            AP
          </span>
          <span className="text-lg font-semibold tracking-tight">PayFlow AP</span>
        </div>

        <div className="flex flex-col gap-2">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary-subtle text-primary-subtle-foreground">
            <KeyRound className="size-5" aria-hidden="true" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
          <p className="text-sm text-muted-foreground">
            {`Hi ${user?.first_name || user?.username}. Your administrator set a temporary password. `}
            Pick one only you know to continue.
          </p>
        </div>

        <ChangePasswordForm forced onChanged={changed} submitLabel="Save and continue" />

        <Button variant="ghost" size="sm" className="self-start" onClick={signOut}>
          <LogOut />
          Sign out
        </Button>
      </main>
    </div>
  );
}

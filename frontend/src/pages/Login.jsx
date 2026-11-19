import React, { useId, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CircleAlert, ClipboardCheck, Eye, EyeOff, GitCompareArrows, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/auth";
import api from "@/services/api";

const FEATURES = [
  [ScanLine, "OCR capture from PDF, image and email"],
  [GitCompareArrows, "2-way and 3-way PO matching"],
  [ClipboardCheck, "Amount-based approval routing"],
];

/** Turn a failed login request into a message the user can act on. */
function loginErrorMessage(error) {
  if (!error.response) {
    return "Can't reach the server. Check your connection, or ask your administrator whether the service is running.";
  }
  const { status, data, headers } = error.response;
  if (status === 401) {
    return "Incorrect username or password, or your account hasn't been activated yet. New accounts must be activated by an administrator.";
  }
  if (status === 429) {
    const seconds = Number(headers?.["retry-after"]);
    const wait = Number.isFinite(seconds) && seconds > 0
      ? `about ${Math.ceil(seconds / 60)} minute${seconds > 60 ? "s" : ""}`
      : "a few minutes";
    return `Too many sign-in attempts. Wait ${wait} and try again.`;
  }
  if (status === 400 && data && typeof data === "object") {
    const messages = Object.values(data).flat().filter((value) => typeof value === "string");
    if (messages.length) {
      return messages.join(" ");
    }
  }
  if (status >= 500) {
    return "The server had a problem signing you in. Try again in a moment.";
  }
  return data?.detail || "Sign-in failed. Please try again.";
}

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [credentialsRejected, setCredentialsRejected] = useState(false);
  const [loading, setLoading] = useState(false);
  const errorId = useId();

  const update = (field) => (event) => {
    setForm({ ...form, [field]: event.target.value });
    setCredentialsRejected(false);
  };

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setCredentialsRejected(false);
    try {
      const { data } = await api.post("/auth/login/", form);
      signIn(data);
      const from = location.state?.from;
      navigate(from && from !== "/login" ? from : "/", { replace: true });
    } catch (requestError) {
      setError(loginErrorMessage(requestError));
      setCredentialsRejected(requestError.response?.status === 401);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-ui="" className="grid min-h-dvh bg-background text-foreground lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <BrandPanel />

      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="flex w-full max-w-sm flex-col gap-8">
          <div className="flex items-center gap-2.5 lg:hidden">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
              AP
            </span>
            <span className="text-lg font-semibold tracking-tight">PayFlow AP</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
            <p className="text-sm text-muted-foreground">Use the account your administrator created for you.</p>
          </div>

          <form className="flex flex-col gap-5" onSubmit={submit}>
            <div aria-live="polite">
              {error && (
                <div
                  id={errorId}
                  role="alert"
                  className="flex gap-2.5 rounded-md border border-danger-border bg-danger-subtle px-3 py-2.5 text-sm text-danger-subtle-foreground"
                >
                  <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="login-username">Username</Label>
              <Input
                id="login-username"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                required
                disabled={loading}
                value={form.username}
                onChange={update("username")}
                aria-invalid={credentialsRejected || undefined}
                aria-describedby={error ? errorId : undefined}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="login-password">Password</Label>
              <div className="relative">
                <Input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  disabled={loading}
                  className="pr-10"
                  value={form.password}
                  onChange={update("password")}
                  aria-invalid={credentialsRejected || undefined}
                  aria-describedby={error ? errorId : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  aria-controls="login-password"
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/35"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" size="lg" loading={loading} className="w-full">
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground">
            No account, or locked out? Ask your administrator. Public sign-up is disabled.
          </p>
        </div>
      </main>
    </div>
  );
}

function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex">
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: "radial-gradient(circle at 20% 15%, white 0, transparent 40%), radial-gradient(circle at 85% 90%, white 0, transparent 35%)",
        }}
      />
      <div className="relative flex w-full flex-col justify-between p-12">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-white/15 text-sm font-semibold ring-1 ring-white/25">
            AP
          </span>
          <span className="text-lg font-semibold tracking-tight">PayFlow AP</span>
        </div>

        <div className="flex max-w-md flex-col gap-8">
          <p className="text-3xl font-semibold leading-tight tracking-tight">
            Every invoice captured, matched and approved, with every rupee accounted for.
          </p>
          <ul className="flex flex-col gap-3 text-sm text-white/85">
            {FEATURES.map(([Icon, text]) => (
              <li key={text} className="flex items-center gap-3">
                <span className="flex size-7 items-center justify-center rounded-md bg-white/10 ring-1 ring-white/15">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-white/60">Accounts payable automation</p>
      </div>
    </aside>
  );
}

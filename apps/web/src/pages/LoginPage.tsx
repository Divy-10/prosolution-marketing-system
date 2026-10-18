import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { ApiError } from "../lib/api.ts";
import { useLogin, useSession } from "../features/auth/session.tsx";
import { Button, Field, Input } from "../components/ui/primitives.tsx";

export function LoginPage() {
  const { user } = useSession();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const from = (location.state as { from?: string } | null)?.from ?? "/";
  if (user) return <Navigate to={user.mustChangePassword ? "/change-password" : from} replace />;

  const error = login.error instanceof ApiError ? login.error : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    login.mutate(
      { email, password },
      { onSuccess: (s) => navigate(s.user.mustChangePassword ? "/change-password" : from, { replace: true }) },
    );
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden flex-col justify-between border-r border-line bg-surface p-12 lg:flex">
        <img src="/logo-full.png" alt="ProSolution Infotech" width={360} className="w-[360px] max-w-full" />
        <div className="max-w-[46ch]">
          <p className="font-display text-[22px] font-medium leading-snug text-ink">
            Find the right Surat businesses, write to them as people, and hand every interested reply to a human.
          </p>
          <p className="mt-3 text-ink-soft">Internal workspace for the ProSolution Infotech sales team.</p>
        </div>
      </div>

      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[380px]">
          <img src="/logo-full.png" alt="ProSolution Infotech" className="mb-10 w-[220px] lg:hidden" />
          <h1 className="text-[28px] font-semibold">Sign in</h1>
          <p className="mt-1 text-ink-soft">Use the account an admin created for you.</p>

          <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
            {error && (
              <div role="alert" className="rounded-[var(--radius-control)] border border-danger/25 bg-danger-soft px-3 py-2.5 text-sm text-danger">
                {error.message}
              </div>
            )}
            <Field label="Email" error={error?.fieldError("email")}>
              {(p) => (
                <Input
                  {...p}
                  type="email"
                  autoComplete="username"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </Field>
            <Field label="Password" error={error?.fieldError("password")}>
              {(p) => (
                <Input
                  {...p}
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}
            </Field>
            <Button type="submit" variant="primary" className="w-full" loading={login.isPending}>
              Sign in
            </Button>
          </form>
          <p className="mt-6 text-[13px] text-ink-faint">Forgot your password? Ask an admin to reset it.</p>
        </div>
      </div>
    </div>
  );
}

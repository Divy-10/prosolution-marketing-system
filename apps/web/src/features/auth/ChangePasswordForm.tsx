import { useState, type FormEvent } from "react";
import { PASSWORD_MIN_LENGTH } from "@prosolution/shared";
import { ApiError } from "../../lib/api.ts";
import { Button, Field, Input } from "../../components/ui/primitives.tsx";
import { useChangePassword } from "./session.tsx";

export function ChangePasswordForm({ onDone, submitLabel = "Change password" }: { onDone?: () => void; submitLabel?: string }) {
  const change = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const error = change.error instanceof ApiError ? change.error : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (next !== repeat) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          setCurrent("");
          setNext("");
          setRepeat("");
          onDone?.();
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {error && !error.details.currentPassword && !error.details.newPassword && (
        <div role="alert" className="rounded-[var(--radius-control)] bg-danger-soft px-3 py-2.5 text-sm text-danger">
          {error.message}
        </div>
      )}
      <Field label="Current password" error={error?.fieldError("currentPassword")}>
        {(p) => (
          <Input {...p} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        )}
      </Field>
      <Field
        label="New password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters. A few unrelated words works well.`}
        error={error?.fieldError("newPassword")}
      >
        {(p) => <Input {...p} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}
      </Field>
      <Field label="Repeat new password" error={mismatch ? "The two new passwords don't match." : undefined}>
        {(p) => <Input {...p} type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />}
      </Field>
      <Button type="submit" variant="primary" loading={change.isPending}>
        {submitLabel}
      </Button>
    </form>
  );
}

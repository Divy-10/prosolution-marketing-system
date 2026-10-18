import { useState, type FormEvent } from "react";
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type Role, type UserDto } from "@prosolution/shared";
import { ApiError } from "../../lib/api.ts";
import { Dialog, useConfirm } from "../../components/ui/dialog.tsx";
import { Button, Field, Input, cx } from "../../components/ui/primitives.tsx";
import { useToast } from "../../components/ui/toast.tsx";
import { generateTemporaryPassword, useCreateUser, useResetPassword, useUpdateUser } from "./api.ts";

function RolePicker({ value, onChange, disabled }: { value: Role; onChange: (r: Role) => void; disabled?: boolean }) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="mb-1.5 text-sm font-medium">Role</legend>
      {ROLES.map((role) => (
        <label
          key={role}
          className={cx(
            "flex cursor-pointer gap-3 rounded-[var(--radius-control)] border px-3 py-2.5",
            value === role ? "border-human bg-human-soft/60" : "border-line hover:border-line-strong",
            disabled && "cursor-not-allowed opacity-60",
          )}
        >
          <input type="radio" name="role" value={role} checked={value === role} onChange={() => onChange(role)} className="mt-1 accent-human" />
          <span>
            <span className="block text-sm font-medium">{ROLE_LABELS[role]}</span>
            <span className="block text-[13px] text-ink-soft">{ROLE_DESCRIPTIONS[role]}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function TemporaryPasswordField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  const toast = useToast();
  return (
    <Field label="Temporary password" hint="Share it privately. They must replace it when they first sign in." error={error}>
      {(p) => (
        <div className="flex gap-2">
          <Input {...p} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" spellCheck={false} className="font-mono" />
          <Button size="md" onClick={() => onChange(generateTemporaryPassword())}>
            Generate
          </Button>
          <Button
            size="md"
            variant="ghost"
            disabled={!value}
            onClick={() => navigator.clipboard?.writeText(value).then(() => toast("Temporary password copied."), () => toast("Couldn't copy. Select and copy it manually.", "error"))}
          >
            Copy
          </Button>
        </div>
      )}
    </Field>
  );
}

export function CreateUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateUser();
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("SALES_USER");
  const [password, setPassword] = useState(generateTemporaryPassword);
  const error = create.error instanceof ApiError ? create.error : null;

  function reset() {
    setName("");
    setEmail("");
    setRole("SALES_USER");
    setPassword(generateTemporaryPassword());
    create.reset();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate(
      { name, email, role, temporaryPassword: password },
      {
        onSuccess: (u) => {
          toast(`Added ${u.name}. Send them the temporary password privately.`);
          onOpenChange(false);
          reset();
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
      title="Add a user"
      description="They'll sign in with the temporary password and choose their own."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="create-user" loading={create.isPending}>
            Add user
          </Button>
        </>
      }
    >
      <form id="create-user" onSubmit={submit} className="space-y-5" noValidate>
        {error && !Object.keys(error.details).length && (
          <div role="alert" className="rounded-[var(--radius-control)] bg-danger-soft px-3 py-2.5 text-sm text-danger">
            {error.message}
          </div>
        )}
        <Field label="Full name" error={error?.fieldError("name")}>
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />}
        </Field>
        <Field label="Work email" error={error?.fieldError("email")}>
          {(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />}
        </Field>
        <RolePicker value={role} onChange={setRole} />
        <TemporaryPasswordField value={password} onChange={setPassword} error={error?.fieldError("temporaryPassword")} />
      </form>
    </Dialog>
  );
}

export function ManageUserDialog({ user, currentUserId, onClose }: { user: UserDto; currentUserId: string; onClose: () => void }) {
  const update = useUpdateUser();
  const resetPw = useResetPassword();
  const toast = useToast();
  const [confirmElement, confirm] = useConfirm();
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<Role>(user.role);
  const [tempPassword, setTempPassword] = useState("");
  const isSelf = user.id === currentUserId;
  const error = update.error instanceof ApiError ? update.error : null;
  const resetError = resetPw.error instanceof ApiError ? resetPw.error : null;

  async function save(e: FormEvent) {
    e.preventDefault();
    const input: { name?: string; role?: Role } = {};
    if (name.trim() !== user.name) input.name = name;
    if (role !== user.role) input.role = role;
    if (!Object.keys(input).length) return onClose();
    if (input.role) {
      const ok = await confirm({
        title: `Change ${user.name}'s role?`,
        body: `${ROLE_LABELS[user.role]} → ${ROLE_LABELS[role]}. They'll be signed out and see the new access when they sign back in.`,
        confirmLabel: "Change role",
      });
      if (!ok) return;
    }
    update.mutate({ id: user.id, input }, { onSuccess: () => (toast("User updated."), onClose()) });
  }

  async function toggleActive() {
    const deactivating = user.isActive;
    const ok = await confirm({
      title: deactivating ? `Deactivate ${user.name}?` : `Reactivate ${user.name}?`,
      body: deactivating
        ? "They'll be signed out immediately and can't sign in. Their history stays in the audit log."
        : "They'll be able to sign in again with their existing password.",
      confirmLabel: deactivating ? "Deactivate" : "Reactivate",
      tone: deactivating ? "danger" : "primary",
    });
    if (!ok) return;
    update.mutate(
      { id: user.id, input: { isActive: !user.isActive } },
      { onSuccess: () => (toast(deactivating ? "User deactivated." : "User reactivated."), onClose()) },
    );
  }

  function resetPassword() {
    resetPw.mutate(
      { id: user.id, temporaryPassword: tempPassword },
      { onSuccess: () => toast(`Password reset. ${user.name} must choose a new one at next sign-in.`) },
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={user.name}
      description={user.email}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="manage-user" loading={update.isPending}>
            Save changes
          </Button>
        </>
      }
    >
      {confirmElement}
      <form id="manage-user" onSubmit={save} className="space-y-5" noValidate>
        {error && (
          <div role="alert" className="rounded-[var(--radius-control)] bg-danger-soft px-3 py-2.5 text-sm text-danger">
            {error.message}
          </div>
        )}
        <Field label="Full name" error={error?.fieldError("name")}>
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <RolePicker value={role} onChange={setRole} disabled={isSelf} />
        {isSelf && <p className="text-[13px] text-ink-faint">You can't change your own role. Ask another admin.</p>}
      </form>

      {!isSelf && (
        <div className="mt-6 space-y-6 border-t border-line pt-5">
          <div>
            <h3 className="font-sans text-[15px] font-semibold">Reset password</h3>
            <p className="mb-3 mt-1 text-[13px] text-ink-soft">Signs them out everywhere and asks for a new password at next sign-in.</p>
            <TemporaryPasswordField value={tempPassword} onChange={setTempPassword} error={resetError?.fieldError("temporaryPassword")} />
            <Button className="mt-3" onClick={resetPassword} disabled={!tempPassword} loading={resetPw.isPending}>
              Reset password
            </Button>
          </div>
          <div>
            <h3 className="font-sans text-[15px] font-semibold">{user.isActive ? "Deactivate account" : "Reactivate account"}</h3>
            <p className="mb-3 mt-1 text-[13px] text-ink-soft">
              {user.isActive ? "Removes access without deleting anything." : "Restores access with their existing password."}
            </p>
            <Button variant={user.isActive ? "danger" : "secondary"} onClick={toggleActive}>
              {user.isActive ? "Deactivate" : "Reactivate"}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

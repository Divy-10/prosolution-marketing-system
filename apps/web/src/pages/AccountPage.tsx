import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@prosolution/shared";
import { useCurrentUser, useLogout } from "../features/auth/session.tsx";
import { ChangePasswordForm } from "../features/auth/ChangePasswordForm.tsx";
import { Badge, Button, PageHeader, Panel } from "../components/ui/primitives.tsx";
import { useConfirm } from "../components/ui/dialog.tsx";
import { useToast } from "../components/ui/toast.tsx";

export function AccountPage() {
  const user = useCurrentUser();
  const logout = useLogout();
  const toast = useToast();
  const [confirmElement, confirm] = useConfirm();

  async function signOutEverywhere() {
    const ok = await confirm({
      title: "Sign out of all devices?",
      body: "You'll be signed out here too and will need to sign in again.",
      confirmLabel: "Sign out everywhere",
      tone: "danger",
    });
    if (ok) logout.mutate(true);
  }

  return (
    <>
      {confirmElement}
      <PageHeader title="Your account" />
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel className="p-6">
          <h2 className="text-lg font-semibold">Profile</h2>
          <dl className="mt-4 space-y-3 text-[14px]">
            <div>
              <dt className="text-ink-faint">Name</dt>
              <dd className="font-medium">{user.name}</dd>
            </div>
            <div>
              <dt className="text-ink-faint">Email</dt>
              <dd className="font-medium">{user.email}</dd>
            </div>
            <div>
              <dt className="text-ink-faint">Role</dt>
              <dd className="mt-0.5">
                <Badge tone="human">{ROLE_LABELS[user.role]}</Badge>
                <p className="mt-1 text-ink-soft">{ROLE_DESCRIPTIONS[user.role]}</p>
              </dd>
            </div>
          </dl>
          <div className="mt-6 border-t border-line pt-5">
            <h3 className="font-sans text-[15px] font-semibold">Other devices</h3>
            <p className="mt-1 text-[14px] text-ink-soft">Lost a phone or used a shared computer? End every session at once.</p>
            <Button className="mt-3" variant="secondary" onClick={signOutEverywhere} loading={logout.isPending}>
              Sign out everywhere
            </Button>
          </div>
        </Panel>
        <Panel className="p-6">
          <h2 className="mb-4 text-lg font-semibold">Change password</h2>
          <p className="-mt-2 mb-5 text-[14px] text-ink-soft">Your other devices will be signed out.</p>
          <ChangePasswordForm onDone={() => toast("Password changed. Other devices were signed out.")} />
        </Panel>
      </div>
    </>
  );
}

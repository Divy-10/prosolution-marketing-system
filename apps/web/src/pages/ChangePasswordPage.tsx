import { useNavigate } from "react-router";
import { ChangePasswordForm } from "../features/auth/ChangePasswordForm.tsx";
import { useCurrentUser, useLogout } from "../features/auth/session.tsx";
import { useToast } from "../components/ui/toast.tsx";

/** Shown after signing in with a temporary password. Nothing else is reachable until it's changed. */
export function ChangePasswordPage() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const toast = useToast();
  const logout = useLogout();

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-[420px]">
        <img src="/logo-mark.png" alt="" className="mb-8 size-12" />
        <h1 className="text-[26px] font-semibold">Set your own password</h1>
        <p className="mb-8 mt-1 text-ink-soft">
          {user.mustChangePassword
            ? `Welcome, ${user.name.split(" ")[0]}. You signed in with a temporary password; replace it to continue.`
            : "Choose a new password."}
        </p>
        <ChangePasswordForm
          submitLabel="Save password and continue"
          onDone={() => {
            toast("Password changed.");
            navigate("/", { replace: true });
          }}
        />
        <button type="button" onClick={() => logout.mutate(false)} className="mt-6 text-[13px] text-ink-soft hover:text-ink">
          Sign out instead
        </button>
      </div>
    </div>
  );
}

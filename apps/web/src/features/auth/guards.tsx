import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { can, type Permission } from "@prosolution/shared";
import { useSession } from "./session.tsx";
import { Skeleton } from "../../components/ui/primitives.tsx";
import { ErrorState } from "../../components/ui/states.tsx";

function FullPageLoading() {
  return (
    <div className="mx-auto mt-24 w-full max-w-sm space-y-3 px-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

/** Signed-in users only. Users with a temporary password are sent to change it first. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading, error } = useSession();
  const location = useLocation();
  if (isLoading) return <FullPageLoading />;
  if (error) return <ErrorState error={error} onRetry={() => window.location.reload()} />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }
  return <>{children}</>;
}

/** Hides a screen from roles that can't use it. The API enforces the same rule. */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { user } = useSession();
  if (!can(user?.role, permission)) {
    return (
      <div className="py-10">
        <h1 className="text-2xl font-semibold">You don't have access to this page</h1>
        <p className="mt-2 max-w-[60ch] text-ink-soft">Ask an admin to change your role if you need it.</p>
      </div>
    );
  }
  return <>{children}</>;
}

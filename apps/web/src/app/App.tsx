import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Routes } from "react-router";
import { ApiError } from "../lib/api.ts";
import { SessionProvider } from "../features/auth/session.tsx";
import { RequireAuth, RequirePermission } from "../features/auth/guards.tsx";
import { ToastProvider } from "../components/ui/toast.tsx";
import { AppShell } from "./AppShell.tsx";
import { PLANNED_ITEMS } from "./navigation.ts";
import { LoginPage } from "../pages/LoginPage.tsx";
import { ChangePasswordPage } from "../pages/ChangePasswordPage.tsx";
import { OverviewPage } from "../pages/OverviewPage.tsx";
import { UsersPage } from "../pages/UsersPage.tsx";
import { AuditLogPage } from "../pages/AuditLogPage.tsx";
import { AccountPage } from "../pages/AccountPage.tsx";
import { ComingSoonPage, NotFoundPage } from "../pages/ComingSoonPage.tsx";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        // Don't retry errors the user has to act on (permissions, validation, signed out).
        retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      },
    },
  });
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/change-password"
        element={
          <RequireAuth>
            <ChangePasswordPage />
          </RequireAuth>
        }
      />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route
          path="users"
          element={
            <RequirePermission permission="users:manage">
              <UsersPage />
            </RequirePermission>
          }
        />
        <Route
          path="audit-log"
          element={
            <RequirePermission permission="audit:read">
              <AuditLogPage />
            </RequirePermission>
          }
        />
        {PLANNED_ITEMS.map((item) => (
          <Route
            key={item.path}
            path={item.path.slice(1)}
            element={
              item.permission ? (
                <RequirePermission permission={item.permission}>
                  <ComingSoonPage item={item} />
                </RequirePermission>
              ) : (
                <ComingSoonPage item={item} />
              )
            }
          />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export function App({ queryClient }: { queryClient: QueryClient }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <SessionProvider>
          <AppRoutes />
        </SessionProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

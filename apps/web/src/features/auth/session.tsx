import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import type { LoginInput, SessionInfoDto, UserDto } from "@prosolution/shared";
import { api, ApiError, onAuthError, setCsrfToken } from "../../lib/api.ts";

export const SESSION_KEY = ["session"] as const;

async function fetchSession(): Promise<SessionInfoDto | null> {
  try {
    const s = await api.get<SessionInfoDto>("/auth/me");
    setCsrfToken(s.csrfToken);
    return s;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      setCsrfToken(null);
      return null;
    }
    throw err;
  }
}

interface SessionContextValue {
  session: SessionInfoDto | null;
  user: UserDto | null;
  isLoading: boolean;
  error: unknown;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: SESSION_KEY, queryFn: fetchSession, staleTime: 60_000, retry: false });

  // Any request that finds the session gone (or a forced password change) updates the app at once.
  useEffect(
    () =>
      onAuthError((err) => {
        if (err.code === "UNAUTHENTICATED") {
          setCsrfToken(null);
          queryClient.setQueryData(SESSION_KEY, null);
          queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== SESSION_KEY[0] });
        } else if (err.code === "PASSWORD_CHANGE_REQUIRED") {
          navigate("/change-password", { replace: true });
        }
      }),
    [queryClient, navigate],
  );

  const value: SessionContextValue = {
    session: query.data ?? null,
    user: query.data?.user ?? null,
    isLoading: query.isPending,
    error: query.error,
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

/** The signed-in user. Only use below <RequireAuth>, where a user is guaranteed. */
export function useCurrentUser(): UserDto {
  const { user } = useSession();
  if (!user) throw new Error("useCurrentUser used without a signed-in user");
  return user;
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => api.post<SessionInfoDto>("/auth/login", input),
    onSuccess: (s) => {
      setCsrfToken(s.csrfToken);
      queryClient.setQueryData(SESSION_KEY, s);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (everywhere: boolean = false) => api.post<void>(everywhere ? "/auth/logout-all" : "/auth/logout"),
    onSettled: () => {
      setCsrfToken(null);
      queryClient.clear();
      queryClient.setQueryData(SESSION_KEY, null);
    },
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      api.post<SessionInfoDto>("/auth/change-password", input),
    onSuccess: (s) => {
      setCsrfToken(s.csrfToken);
      queryClient.setQueryData(SESSION_KEY, s);
    },
  });
}

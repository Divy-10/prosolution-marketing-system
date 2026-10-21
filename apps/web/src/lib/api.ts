import type { ApiErrorBody, DuplicateCheckDto, ErrorCode } from "@prosolution/shared";

/** An error returned by the API, with per-field messages when validation failed. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode | "NETWORK_ERROR",
    message: string,
    public readonly details: Record<string, string[]> = {},
    public readonly requestId?: string,
    /** Duplicate matches attached to DUPLICATE_LEAD / SHARED_IDENTIFIER / POSSIBLE_DUPLICATE errors. */
    public readonly duplicates?: DuplicateCheckDto,
    /** Leads that were no longer eligible in a retention action. */
    public readonly ineligibleLeadIds?: string[],
  ) {
    super(message);
    this.name = "ApiError";
  }

  fieldError(field: string): string | undefined {
    return this.details[field]?.[0];
  }
}

let csrfToken: string | null = null;

/** Called whenever the API hands us a session (sign-in, /me). Kept in memory only. */
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

type Listener = (error: ApiError) => void;
const authListeners = new Set<Listener>();

/** Lets the app react globally when the session ends or a password change is required. */
export function onAuthError(listener: Listener): () => void {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

const BASE = "/api/v1";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET" && csrfToken) headers["X-CSRF-Token"] = csrfToken;

  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Can't reach the server. Check that the API is running and try again.");
  }

  if (res.status === 204) return undefined as T;

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error;
    const apiError = new ApiError(
      res.status,
      err?.code ?? "INTERNAL_ERROR",
      err?.message ?? `The server returned an unexpected response (${res.status}).`,
      err?.details,
      err?.requestId,
      err?.duplicates,
      err?.ineligibleLeadIds,
    );
    const isLogin = path === "/auth/login";
    if (!isLogin && (apiError.code === "UNAUTHENTICATED" || apiError.code === "PASSWORD_CHANGE_REQUIRED")) {
      authListeners.forEach((l) => l(apiError));
    }
    throw apiError;
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
};

/** Builds a query string, skipping empty values. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, onAuthError, qs, setCsrfToken } from "./api.ts";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  setCsrfToken(null);
});

describe("api client", () => {
  it("sends the CSRF token on writes but not on reads, and always same-origin credentials", async () => {
    setCsrfToken("tok123");
    const fetchMock = mockFetch(200, { ok: true });
    await api.get("/x");
    await api.post("/y", { a: 1 });
    const [getCall, postCall] = fetchMock.mock.calls as unknown as [[string, RequestInit], [string, RequestInit]];
    expect((getCall[1].headers as Record<string, string>)["X-CSRF-Token"]).toBeUndefined();
    expect((postCall[1].headers as Record<string, string>)["X-CSRF-Token"]).toBe("tok123");
    expect(postCall[1].credentials).toBe("same-origin");
    expect(postCall[0]).toBe("/api/v1/y");
  });

  it("turns error responses into ApiError with field details and a request id", async () => {
    mockFetch(400, {
      error: { code: "VALIDATION_FAILED", message: "Enter a valid email address.", details: { email: ["Enter a valid email address."] }, requestId: "req-1" },
    });
    const err = await api.post("/users", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).fieldError("email")).toBe("Enter a valid email address.");
    expect((err as ApiError).requestId).toBe("req-1");
  });

  it("reports a network failure in plain language", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const err = (await api.get("/x").catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("NETWORK_ERROR");
    expect(err.message).toMatch(/Can't reach the server/);
  });

  it("notifies listeners when the session has ended, but not for a failed sign-in", async () => {
    const listener = vi.fn();
    const off = onAuthError(listener);
    mockFetch(401, { error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } });
    await api.get("/users").catch(() => {});
    expect(listener).toHaveBeenCalledTimes(1);
    mockFetch(401, { error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } });
    await api.post("/auth/login", {}).catch(() => {});
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  it("builds query strings without empty values", () => {
    expect(qs({ q: "", role: "ADMIN", page: 2, x: undefined })).toBe("?role=ADMIN&page=2");
    expect(qs({})).toBe("");
  });
});

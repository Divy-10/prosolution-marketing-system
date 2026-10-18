import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { App, createQueryClient } from "../app/App.tsx";

type Handler = (url: string, init?: RequestInit) => { status: number; body?: unknown };

function stubApi(handler: Handler) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const { status, body } = handler(url, init);
      return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    }),
  );
}

const session = (overrides: Record<string, unknown> = {}) => ({
  user: { id: "u1", email: "admin@prosolution.test", name: "Asha Mehta", role: "ADMIN", isActive: true, mustChangePassword: false, lastLoginAt: null, createdAt: "2026-10-17T00:00:00Z", ...overrides },
  csrfToken: "csrf",
  config: { humanApprovalRequired: true, environment: "development" },
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App queryClient={createQueryClient()} />
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("sign-in flow", () => {
  it("sends signed-out visitors to the sign-in page", async () => {
    stubApi(() => ({ status: 401, body: { error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } } }));
    renderAt("/users");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows the server's message when credentials are wrong", async () => {
    stubApi((url) =>
      url.endsWith("/auth/login")
        ? { status: 401, body: { error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } } }
        : { status: 401, body: { error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } } },
    );
    renderAt("/login");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Email"), "admin@prosolution.test");
    await user.type(screen.getByLabelText("Password"), "wrong password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect.");
  });

  it("signs in and lands on the overview with human approval shown as on", async () => {
    let signedIn = false;
    stubApi((url) => {
      if (url.endsWith("/auth/login")) {
        signedIn = true;
        return { status: 200, body: session() };
      }
      if (url.endsWith("/auth/me")) return signedIn ? { status: 200, body: session() } : { status: 401, body: { error: { code: "UNAUTHENTICATED", message: "x" } } };
      if (url.endsWith("/health/ready")) return { status: 200, body: { status: "ready", database: "ok" } };
      return { status: 404, body: { error: { code: "NOT_FOUND", message: "x" } } };
    });
    renderAt("/login");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Email"), "admin@prosolution.test");
    await user.type(screen.getByLabelText("Password"), "correct horse battery");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("heading", { name: /Asha/ })).toBeInTheDocument();
    expect(screen.getAllByText("Human approval on").length).toBeGreaterThan(0);
    expect(await screen.findByText("Connected")).toBeInTheDocument();
  });

  it("forces a password change before anything else", async () => {
    stubApi((url) => (url.endsWith("/auth/me") ? { status: 200, body: session({ mustChangePassword: true }) } : { status: 404, body: {} }));
    renderAt("/users");
    expect(await screen.findByRole("heading", { name: "Set your own password" })).toBeInTheDocument();
  });

  it("tells a viewer they can't open an admin page", async () => {
    stubApi((url) => (url.endsWith("/auth/me") ? { status: 200, body: session({ role: "VIEWER" }) } : { status: 404, body: {} }));
    renderAt("/users");
    expect(await screen.findByRole("heading", { name: "You don't have access to this page" })).toBeInTheDocument();
  });
});

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { APP_ORIGIN, PASSWORD, buildApp, createUser, resetDb, signIn, testDb } from "./helpers.ts";

const app = buildApp();

beforeEach(resetDb);
afterAll(async () => {
  await testDb().$disconnect();
});

function login(email: string, password: string, a = app) {
  return request(a).post("/api/v1/auth/login").set("Origin", APP_ORIGIN).send({ email, password });
}

describe("sign in", () => {
  it("sets an HttpOnly, SameSite=Strict session cookie and returns the user without secrets", async () => {
    const user = await createUser({ role: "SALES_MANAGER" });
    const res = await login(user.email, PASSWORD);
    expect(res.status).toBe(200);
    const cookie = res.headers["set-cookie"]?.[0] ?? "";
    expect(cookie).toMatch(/^ps_sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(res.body.user).toMatchObject({ email: user.email, role: "SALES_MANAGER" });
    expect(res.body.csrfToken).toEqual(expect.any(String));
    expect(res.body.config.humanApprovalRequired).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2|tokenHash/);
  });

  it("accepts the email in any case", async () => {
    const user = await createUser({ email: "owner@prosolution.test" });
    expect((await login("  OWNER@ProSolution.test ", PASSWORD)).status).toBe(200);
    expect(user).toBeTruthy();
  });

  it("stores only a hash of the session token", async () => {
    const user = await createUser();
    const res = await login(user.email, PASSWORD);
    const token = /ps_sid=([^;]+)/.exec(res.headers["set-cookie"]?.[0] ?? "")?.[1];
    const row = await testDb().session.findFirstOrThrow({ where: { userId: user.id } });
    expect(token).toBeTruthy();
    expect(row.tokenHash).not.toBe(token);
    expect(row.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns the same generic error for a wrong password, an unknown email and a deactivated account", async () => {
    const active = await createUser();
    const inactive = await createUser({ isActive: false });
    const responses = await Promise.all([
      login(active.email, "wrong password here"),
      login("nobody@prosolution.test", PASSWORD),
      login(inactive.email, PASSWORD),
    ]);
    for (const r of responses) {
      expect(r.status).toBe(401);
      expect(r.body.error.code).toBe("INVALID_CREDENTIALS");
      expect(r.body.error.message).toBe("Email or password is incorrect.");
    }
  });

  it("locks the account after repeated failures (limit 3 in tests), even for the right password", async () => {
    const user = await createUser();
    for (let i = 0; i < 3; i++) expect((await login(user.email, "wrong password")).status).toBe(401);
    const locked = await login(user.email, PASSWORD);
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe("ACCOUNT_LOCKED");

    const actions = (await testDb().auditLog.findMany({ where: { entityId: user.id } })).map((a) => a.action);
    expect(actions).toContain("auth.account_locked");
  });

  it("unlocks once the lock period has passed", async () => {
    const user = await createUser();
    await testDb().user.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    expect((await login(user.email, PASSWORD)).status).toBe(200);
  });

  it("validates input", async () => {
    const res = await login("not-an-email", "");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.error.details.email).toBeDefined();
    expect(res.body.error.details.password).toBeDefined();
  });

  it("rate-limits sign-in attempts per network", async () => {
    const limited = buildApp({ LOGIN_RATE_LIMIT_PER_15_MIN: "2" });
    await login("a@prosolution.test", "x", limited);
    await login("a@prosolution.test", "x", limited);
    const third = await login("a@prosolution.test", "x", limited);
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe("RATE_LIMITED");
  });

  it("blocks sign-in requests from another website", async () => {
    const user = await createUser();
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", "https://evil.example")
      .send({ email: user.email, password: PASSWORD });
    expect(res.status).toBe(403);
  });

  it("records successful and failed sign-ins in the audit log", async () => {
    const user = await createUser();
    await login(user.email, "wrong password");
    await login(user.email, PASSWORD);
    const rows = await testDb().auditLog.findMany({ where: { entityId: user.id }, orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => r.action)).toEqual(["auth.login_failed", "auth.login_succeeded"]);
    expect(rows[1]?.actorId).toBe(user.id);
  });
});

describe("session", () => {
  it("returns the current user from /me and rejects anonymous requests", async () => {
    const user = await createUser();
    const { agent } = await signIn(app, user.email);
    expect((await agent.get("/api/v1/auth/me")).body.user.id).toBe(user.id);
    const anon = await request(app).get("/api/v1/auth/me");
    expect(anon.status).toBe(401);
    expect(anon.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("requires the CSRF token for state-changing requests", async () => {
    const user = await createUser();
    const { agent, csrf } = await signIn(app, user.email);
    const missing = await agent.post("/api/v1/auth/logout").set("Origin", APP_ORIGIN);
    expect(missing.status).toBe(403);
    expect(missing.body.error.code).toBe("CSRF_FAILED");
    const wrong = await agent.post("/api/v1/auth/logout").set("X-CSRF-Token", "nope");
    expect(wrong.status).toBe(403);
    const ok = await agent.post("/api/v1/auth/logout").set("X-CSRF-Token", csrf);
    expect(ok.status).toBe(204);
  });

  it("signs out: the old cookie stops working", async () => {
    const user = await createUser();
    const { agent, csrf } = await signIn(app, user.email);
    await agent.post("/api/v1/auth/logout").set("X-CSRF-Token", csrf);
    expect((await agent.get("/api/v1/auth/me")).status).toBe(401);
    expect(await testDb().session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("expires idle sessions", async () => {
    const user = await createUser();
    const { agent } = await signIn(app, user.email);
    await testDb().session.updateMany({
      where: { userId: user.id },
      data: { lastSeenAt: new Date(Date.now() - 9 * 60 * 60_000) },
    });
    expect((await agent.get("/api/v1/auth/me")).status).toBe(401);
  });

  it("ends sessions immediately when the user is deactivated", async () => {
    const user = await createUser();
    const { agent } = await signIn(app, user.email);
    await testDb().user.update({ where: { id: user.id }, data: { isActive: false } });
    expect((await agent.get("/api/v1/auth/me")).status).toBe(401);
  });

  it("signs out everywhere", async () => {
    const user = await createUser();
    const a = await signIn(app, user.email);
    const b = await signIn(app, user.email);
    expect((await a.agent.post("/api/v1/auth/logout-all").set("X-CSRF-Token", a.csrf)).status).toBe(204);
    expect((await b.agent.get("/api/v1/auth/me")).status).toBe(401);
  });
});

describe("password change", () => {
  it("blocks everything except /me, change-password and logout until a required change is made", async () => {
    const admin = await createUser({ role: "ADMIN", mustChangePassword: true });
    const { agent, csrf } = await signIn(app, admin.email);
    expect((await agent.get("/api/v1/auth/me")).status).toBe(200);
    const blocked = await agent.get("/api/v1/users");
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");

    const changed = await agent
      .post("/api/v1/auth/change-password")
      .set("X-CSRF-Token", csrf)
      .send({ currentPassword: PASSWORD, newPassword: "a brand new passphrase" });
    expect(changed.status).toBe(200);
    expect(changed.body.user.mustChangePassword).toBe(false);
    expect((await agent.get("/api/v1/users")).status).toBe(200);
  });

  it("rejects a wrong current password and a weak new one", async () => {
    const user = await createUser();
    const { agent, csrf } = await signIn(app, user.email);
    const wrong = await agent
      .post("/api/v1/auth/change-password")
      .set("X-CSRF-Token", csrf)
      .send({ currentPassword: "not my password", newPassword: "a brand new passphrase" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.details.currentPassword).toBeDefined();
    const weak = await agent
      .post("/api/v1/auth/change-password")
      .set("X-CSRF-Token", csrf)
      .send({ currentPassword: PASSWORD, newPassword: "short" });
    expect(weak.status).toBe(400);
    expect(weak.body.error.details.newPassword).toBeDefined();
  });

  it("signs out other sessions but keeps the current one", async () => {
    const user = await createUser();
    const current = await signIn(app, user.email);
    const other = await signIn(app, user.email);
    await current.agent
      .post("/api/v1/auth/change-password")
      .set("X-CSRF-Token", current.csrf)
      .send({ currentPassword: PASSWORD, newPassword: "a brand new passphrase" });
    expect((await current.agent.get("/api/v1/auth/me")).status).toBe(200);
    expect((await other.agent.get("/api/v1/auth/me")).status).toBe(401);
    expect((await login(user.email, "a brand new passphrase")).status).toBe(200);
  });
});

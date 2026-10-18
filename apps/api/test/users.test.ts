import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { ROLES } from "@prosolution/shared";
import { APP_ORIGIN, PASSWORD, buildApp, createUser, resetDb, signIn, signInAs, testDb } from "./helpers.ts";

const app = buildApp();
beforeEach(resetDb);
afterAll(async () => {
  await testDb().$disconnect();
});

const newUser = {
  email: "Priya@ProSolution.test",
  name: "Priya Shah",
  role: "SALES_USER",
  temporaryPassword: "temporary passphrase 1",
};

describe("users: access control", () => {
  it("rejects anonymous requests", async () => {
    expect((await request(app).get("/api/v1/users")).status).toBe(401);
  });

  it.each(ROLES.filter((r) => r !== "ADMIN"))("forbids %s from managing users", async (role) => {
    const { agent, csrf } = await signInAs(app, role);
    expect((await agent.get("/api/v1/users")).status).toBe(403);
    const create = await agent.post("/api/v1/users").set("X-CSRF-Token", csrf).send(newUser);
    expect(create.status).toBe(403);
    expect(create.body.error.code).toBe("FORBIDDEN");
  });
});

describe("users: admin", () => {
  it("creates a user who must change the temporary password, and audits it", async () => {
    const { agent, csrf, user: admin } = await signInAs(app, "ADMIN");
    const res = await agent.post("/api/v1/users").set("X-CSRF-Token", csrf).send(newUser);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: "priya@prosolution.test", role: "SALES_USER", mustChangePassword: true });
    expect(res.body.passwordHash).toBeUndefined();

    const audit = await testDb().auditLog.findFirstOrThrow({ where: { action: "user.created" } });
    expect(audit).toMatchObject({ actorId: admin.id, entityId: res.body.id, newStatus: "SALES_USER" });
    expect(JSON.stringify(audit.meta)).not.toContain(newUser.temporaryPassword);
  });

  it("rejects duplicate emails and invalid input", async () => {
    const { agent, csrf } = await signInAs(app, "ADMIN");
    await agent.post("/api/v1/users").set("X-CSRF-Token", csrf).send(newUser);
    const dup = await agent.post("/api/v1/users").set("X-CSRF-Token", csrf).send(newUser);
    expect(dup.status).toBe(409);
    const bad = await agent
      .post("/api/v1/users")
      .set("X-CSRF-Token", csrf)
      .send({ email: "x", name: "", role: "OWNER", temporaryPassword: "short" });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.details).sort()).toEqual(["email", "name", "role", "temporaryPassword"]);
  });

  it("lists users with search, filters and pagination", async () => {
    const { agent } = await signInAs(app, "ADMIN");
    await createUser({ name: "Ravi Patel", role: "SALES_USER" });
    await createUser({ name: "Meera Desai", role: "VIEWER", isActive: false });
    const all = await agent.get("/api/v1/users?pageSize=2");
    expect(all.body).toMatchObject({ page: 1, pageSize: 2, total: 3 });
    expect(all.body.data).toHaveLength(2);
    const search = await agent.get("/api/v1/users?q=ravi");
    expect(search.body.data.map((u: { name: string }) => u.name)).toEqual(["Ravi Patel"]);
    const inactive = await agent.get("/api/v1/users?status=inactive");
    expect(inactive.body.total).toBe(1);
  });

  it("changes a role, ends that user's sessions, and records previous and new role", async () => {
    const { agent, csrf } = await signInAs(app, "ADMIN");
    const target = await createUser({ role: "SALES_USER" });
    const targetSession = await signIn(app, target.email);

    const res = await agent.patch(`/api/v1/users/${target.id}`).set("X-CSRF-Token", csrf).send({ role: "SALES_MANAGER" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("SALES_MANAGER");
    expect((await targetSession.agent.get("/api/v1/auth/me")).status).toBe(401);

    const audit = await testDb().auditLog.findFirstOrThrow({ where: { action: "user.role_changed" } });
    expect(audit).toMatchObject({ previousStatus: "SALES_USER", newStatus: "SALES_MANAGER" });
  });

  it("stops admins from changing their own role or deactivating themselves", async () => {
    const { agent, csrf, user } = await signInAs(app, "ADMIN");
    await createUser({ role: "ADMIN" });
    const role = await agent.patch(`/api/v1/users/${user.id}`).set("X-CSRF-Token", csrf).send({ role: "VIEWER" });
    expect(role.status).toBe(403);
    const deactivate = await agent.patch(`/api/v1/users/${user.id}`).set("X-CSRF-Token", csrf).send({ isActive: false });
    expect(deactivate.status).toBe(403);
  });

  it("never ends up with zero admins, even when two admins demote each other at the same moment", async () => {
    const a = await createUser({ role: "ADMIN" });
    const b = await createUser({ role: "ADMIN" });
    const sa = await signIn(app, a.email);
    const sb = await signIn(app, b.email);
    const results = await Promise.all([
      sa.agent.patch(`/api/v1/users/${b.id}`).set("X-CSRF-Token", sa.csrf).send({ role: "VIEWER" }),
      sb.agent.patch(`/api/v1/users/${a.id}`).set("X-CSRF-Token", sb.csrf).send({ role: "VIEWER" }),
    ]);
    const statuses = results.map((r) => r.status).sort();
    // One wins; the other is refused (last-admin rule, a serialization conflict, or its session was just ended).
    expect(statuses[0]).toBe(200);
    expect([401, 409]).toContain(statuses[1]);
    expect(await testDb().user.count({ where: { role: "ADMIN", isActive: true } })).toBe(1);
  });

  it("resets a password: forces a change and ends the user's sessions", async () => {
    const { agent, csrf } = await signInAs(app, "ADMIN");
    const target = await createUser();
    const targetSession = await signIn(app, target.email);
    const res = await agent
      .post(`/api/v1/users/${target.id}/reset-password`)
      .set("X-CSRF-Token", csrf)
      .send({ temporaryPassword: "fresh temporary pass" });
    expect(res.status).toBe(200);
    expect(res.body.mustChangePassword).toBe(true);
    expect((await targetSession.agent.get("/api/v1/auth/me")).status).toBe(401);
    expect(
      (await request(app).post("/api/v1/auth/login").set("Origin", APP_ORIGIN).send({ email: target.email, password: PASSWORD })).status,
    ).toBe(401);
  });

  it("returns 404 for unknown users", async () => {
    const { agent } = await signInAs(app, "ADMIN");
    expect((await agent.get("/api/v1/users/does-not-exist")).status).toBe(404);
  });
});

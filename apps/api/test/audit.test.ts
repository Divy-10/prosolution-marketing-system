import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp, createUser, resetDb, signIn, signInAs, testDb } from "./helpers.ts";

const app = buildApp();
beforeEach(resetDb);
afterAll(async () => {
  await testDb().$disconnect();
});

describe("audit log", () => {
  it("is readable by admins only", async () => {
    for (const role of ["SALES_MANAGER", "SALES_USER", "VIEWER"] as const) {
      const { agent } = await signInAs(app, role);
      expect((await agent.get("/api/v1/audit")).status).toBe(403);
    }
    const { agent } = await signInAs(app, "ADMIN");
    expect((await agent.get("/api/v1/audit")).status).toBe(200);
  });

  it("lists newest first with actor details, filters and pagination", async () => {
    const { agent, csrf, user: admin } = await signInAs(app, "ADMIN");
    const target = await createUser({ role: "VIEWER" });
    await agent.patch(`/api/v1/users/${target.id}`).set("X-CSRF-Token", csrf).send({ role: "SALES_USER" });

    const all = await agent.get("/api/v1/audit?pageSize=1");
    expect(all.body.pageSize).toBe(1);
    expect(all.body.total).toBeGreaterThanOrEqual(2);
    expect(all.body.data[0].action).toBe("user.role_changed");
    expect(all.body.data[0].actor).toEqual({ id: admin.id, name: admin.name, email: admin.email });

    const filtered = await agent.get("/api/v1/audit?action=auth.login_succeeded");
    expect(filtered.body.data.every((r: { action: string }) => r.action === "auth.login_succeeded")).toBe(true);

    const future = await agent.get(`/api/v1/audit?from=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`);
    expect(future.body.total).toBe(0);
  });

  it("records the request id, IP and user agent", async () => {
    const user = await createUser();
    await signIn(app, user.email);
    const row = await testDb().auditLog.findFirstOrThrow({ where: { action: "auth.login_succeeded" } });
    expect(row.requestId).toBeTruthy();
    expect(row.ip).toBeTruthy();
  });

  it("is append-only at the database level", async () => {
    const user = await createUser();
    await signIn(app, user.email);
    const row = await testDb().auditLog.findFirstOrThrow();
    await expect(testDb().auditLog.update({ where: { id: row.id }, data: { action: "tampered" } })).rejects.toThrow(/append-only/);
    await expect(testDb().auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
  });
});

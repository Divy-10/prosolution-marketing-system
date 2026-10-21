import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp, daysAgo, insertLead, resetDb, seedConfiguration, signInAs, testDb } from "./helpers.ts";

const app = buildApp();
beforeEach(async () => {
  await resetDb();
  await seedConfiguration();
});
afterAll(async () => {
  await testDb().$disconnect();
});

async function scenario() {
  return {
    oldPending: await insertLead({ businessName: "Old Pending Cafe", createdAt: daysAgo(200) }),
    oldRejected: await insertLead({ businessName: "Old Rejected Salon", createdAt: daysAgo(400), reviewStatus: "REJECTED" }),
    recent: await insertLead({ businessName: "Recent Gym", createdAt: daysAgo(30) }),
    contacted: await insertLead({ businessName: "Contacted Jeweller", createdAt: daysAgo(300), reviewStatus: "APPROVED", contactStatus: "CONTACTED" }),
    doNotContact: await insertLead({ businessName: "Opted Out Boutique", createdAt: daysAgo(300), doNotContact: true }),
    kept: await insertLead({ businessName: "Kept Hotel", createdAt: daysAgo(300), retentionHoldUntil: new Date(Date.now() + 86_400_000 * 30) }),
    holdExpired: await insertLead({ businessName: "Expired Hold Spa", createdAt: daysAgo(500), retentionHoldUntil: daysAgo(1) }),
  };
}

describe("retention review", () => {
  it("lists only old, uncontacted, contactable leads not on hold — oldest first", async () => {
    const s = await scenario();
    const { agent } = await signInAs(app, "ADMIN");
    const res = await agent.get("/api/v1/retention/eligible");
    expect(res.status).toBe(200);
    expect(res.body.thresholdDays).toBe(180);
    expect(res.body.data.map((l: { id: string }) => l.id)).toEqual([s.holdExpired.id, s.oldRejected.id, s.oldPending.id]);
    expect(res.body.data[0].ageDays).toBeGreaterThanOrEqual(499);
  });

  it("follows the configured threshold", async () => {
    await scenario();
    await testDb().systemSettings.update({ where: { id: "default" }, data: { leadRetentionDays: 450 } });
    const { agent } = await signInAs(app, "ADMIN");
    const res = await agent.get("/api/v1/retention/eligible");
    expect(res.body.data.map((l: { businessName: string }) => l.businessName)).toEqual(["Expired Hold Spa"]);
  });

  it("is admin-only", async () => {
    for (const role of ["SALES_MANAGER", "SALES_USER", "VIEWER"] as const) {
      const { agent, csrf } = await signInAs(app, role);
      expect((await agent.get("/api/v1/retention/eligible")).status).toBe(403);
      expect((await agent.post("/api/v1/retention/delete").set("X-CSRF-Token", csrf).send({ leadIds: ["x"], confirmation: "DELETE 1 LEAD" })).status).toBe(403);
    }
  });

  it("never deletes without the exact typed confirmation", async () => {
    const s = await scenario();
    const { agent, csrf } = await signInAs(app, "ADMIN");
    for (const confirmation of ["", "delete 1 lead", "DELETE 2 LEADS", "yes"]) {
      const res = await agent.post("/api/v1/retention/delete").set("X-CSRF-Token", csrf).send({ leadIds: [s.oldPending.id], confirmation });
      expect(res.status).toBe(400);
    }
    expect(await testDb().lead.count({ where: { id: s.oldPending.id } })).toBe(1);
  });

  it("deletes approved eligible leads and writes per-lead and summary audit rows without contact details or names", async () => {
    const s = await scenario();
    const { agent, csrf, user } = await signInAs(app, "ADMIN");
    const res = await agent
      .post("/api/v1/retention/delete")
      .set("X-CSRF-Token", csrf)
      .send({ leadIds: [s.oldPending.id, s.oldRejected.id], confirmation: "DELETE 2 LEADS" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 2 });
    expect(await testDb().lead.count()).toBe(5);
    const rows = await testDb().auditLog.findMany({ where: { action: "retention.lead_deleted" } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.actorId === user.id && r.newStatus === "DELETED")).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/Old Pending Cafe|Old Rejected Salon/);
    const batch = await testDb().auditLog.findFirstOrThrow({ where: { action: "retention.batch_deleted" } });
    expect(batch.meta).toMatchObject({ count: 2, thresholdDays: 180 });
    // The history row survives the lead's deletion.
    expect(await testDb().auditLog.count({ where: { leadId: s.oldPending.id } })).toBe(1);
  });

  it("refuses the whole request if any selected lead is protected (contacted, do-not-contact, recent, kept)", async () => {
    const s = await scenario();
    const { agent, csrf } = await signInAs(app, "ADMIN");
    for (const protectedLead of [s.contacted, s.doNotContact, s.recent, s.kept]) {
      const res = await agent
        .post("/api/v1/retention/delete")
        .set("X-CSRF-Token", csrf)
        .send({ leadIds: [s.oldPending.id, protectedLead.id], confirmation: "DELETE 2 LEADS" });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("NOT_ELIGIBLE");
      expect(res.body.error.ineligibleLeadIds).toEqual([protectedLead.id]);
    }
    expect(await testDb().lead.count()).toBe(7);
    expect(await testDb().auditLog.count({ where: { action: { startsWith: "retention." } } })).toBe(0);
  });

  it("re-checks eligibility at delete time (a lead contacted after the list loaded is kept)", async () => {
    const s = await scenario();
    const { agent, csrf } = await signInAs(app, "ADMIN");
    await agent.get("/api/v1/retention/eligible");
    await testDb().lead.update({ where: { id: s.oldPending.id }, data: { reviewStatus: "APPROVED", contactStatus: "CONTACTED" } });
    const res = await agent.post("/api/v1/retention/delete").set("X-CSRF-Token", csrf).send({ leadIds: [s.oldPending.id], confirmation: "DELETE 1 LEAD" });
    expect(res.status).toBe(409);
    expect(await testDb().lead.count({ where: { id: s.oldPending.id } })).toBe(1);
  });

  it("keeps leads for another full period and audits it", async () => {
    const s = await scenario();
    const { agent, csrf } = await signInAs(app, "ADMIN");
    const res = await agent.post("/api/v1/retention/keep").set("X-CSRF-Token", csrf).send({ leadIds: [s.oldPending.id] });
    expect(res.body.kept).toBe(1);
    const list = await agent.get("/api/v1/retention/eligible");
    expect(list.body.data.map((l: { id: string }) => l.id)).not.toContain(s.oldPending.id);
    const audit = await testDb().auditLog.findFirstOrThrow({ where: { action: "retention.lead_kept" } });
    expect(audit.leadId).toBe(s.oldPending.id);
    expect((await agent.post("/api/v1/retention/keep").set("X-CSRF-Token", csrf).send({ leadIds: [s.contacted.id] })).status).toBe(409);
  });

  it("has no automatic deletion: old leads stay until an admin acts", async () => {
    const s = await scenario();
    const { agent } = await signInAs(app, "ADMIN");
    await agent.get("/api/v1/retention/eligible");
    await agent.get("/api/v1/leads?view=all");
    expect(await testDb().lead.count({ where: { id: { in: [s.oldPending.id, s.oldRejected.id, s.holdExpired.id] } } })).toBe(3);
  });
});

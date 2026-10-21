import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { areaId, buildApp, createUser, industryId, resetDb, seedConfiguration, signIn, signInAs, testDb } from "./helpers.ts";

const app = buildApp();
beforeEach(async () => {
  await resetDb();
  await seedConfiguration();
});
afterAll(async () => {
  await testDb().$disconnect();
});

async function baseLead(overrides: Record<string, unknown> = {}) {
  return {
    businessName: "Brew Lab Cafe",
    industryId: await industryId("Cafés & restaurants"),
    areaId: await areaId("Vesu"),
    publicPhone: "98765 43210",
    instagramHandle: "@brewlab.surat",
    source: "MANUAL_RESEARCH",
    sourceUrl: "https://instagram.com/brewlab.surat",
    ...overrides,
  };
}

describe("creating lead candidates", () => {
  it("creates a pending candidate with normalised identifiers, linked city, and an audit row", async () => {
    const { agent, csrf, user } = await signInAs(app, "SALES_MANAGER");
    const res = await agent.post("/api/v1/leads").set("X-CSRF-Token", csrf).send(await baseLead());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      businessName: "Brew Lab Cafe",
      reviewStatus: "PENDING",
      contactStatus: "NOT_CONTACTED",
      detailsVerified: false,
      city: { name: "Surat" },
      area: { name: "Vesu" },
      createdBy: { id: user.id },
    });
    expect(res.body.identifiers).toEqual(
      expect.arrayContaining([
        { type: "PHONE", value: "+919876543210", isShared: false },
        { type: "INSTAGRAM", value: "brewlab.surat", isShared: false },
      ]),
    );
    const audit = await testDb().auditLog.findFirstOrThrow({ where: { action: "lead.created" } });
    expect(audit).toMatchObject({ leadId: res.body.id, actorId: user.id, newStatus: "PENDING" });
    expect(JSON.stringify(audit.meta)).not.toContain("98765");
  });

  it("forbids sales users and viewers from creating leads", async () => {
    for (const role of ["SALES_USER", "VIEWER"] as const) {
      const { agent, csrf } = await signInAs(app, role);
      expect((await agent.post("/api/v1/leads").set("X-CSRF-Token", csrf).send(await baseLead())).status).toBe(403);
    }
  });

  it("validates input and refuses disabled areas", async () => {
    const { agent, csrf } = await signInAs(app, "ADMIN");
    const bad = await agent.post("/api/v1/leads").set("X-CSRF-Token", csrf).send({ businessName: "", source: "SCRAPED", publicEmail: "x" });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.details).sort()).toEqual(["businessName", "publicEmail", "source"]);
    const vesu = await areaId("Vesu");
    await testDb().area.update({ where: { id: vesu }, data: { isActive: false } });
    const disabled = await agent.post("/api/v1/leads").set("X-CSRF-Token", csrf).send(await baseLead());
    expect(disabled.status).toBe(400);
    expect(disabled.body.error.details.areaId).toBeDefined();
  });
});

describe("duplicate protection", () => {
  it("blocks an exact duplicate (same business, contact detail written differently), even for admins", async () => {
    const { agent, csrf } = await signInAs(app, "ADMIN");
    const first = await agent.post("/api/v1/leads").set("X-CSRF-Token", csrf).send(await baseLead());
    const dup = await agent
      .post("/api/v1/leads")
      .set("X-CSRF-Token", csrf)
      .send(await baseLead({ businessName: "The Brew Lab Café", publicPhone: "+91-98765-43210", instagramHandle: null, duplicates: { approveSharedIdentifiers: true, sharedIdentifierReason: "x", confirmDifferentBusiness: true } }));
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("DUPLICATE_LEAD");
    expect(dup.body.error.duplicates.exact[0]).toMatchObject({ kind: "EXACT", lead: { id: first.body.id }, matchedOn: ["PHONE"] });
    expect(await testDb().lead.count()).toBe(1);
  });

  it("asks an admin to approve shared contact details for a separate branch, and never merges", async () => {
    const manager = await signInAs(app, "SALES_MANAGER");
    const first = await manager.agent.post("/api/v1/leads").set("X-CSRF-Token", manager.csrf).send(await baseLead());
    const branch = await baseLead({ businessName: "Brew Lab Cafe Adajan", areaId: await areaId("Adajan"), instagramHandle: null });

    const byManager = await manager.agent.post("/api/v1/leads").set("X-CSRF-Token", manager.csrf).send(branch);
    expect(byManager.status).toBe(409);
    expect(byManager.body.error.code).toBe("SHARED_IDENTIFIER");
    expect(byManager.body.error.message).toMatch(/ask an admin/i);

    const admin = await signInAs(app, "ADMIN");
    const noReason = await admin.agent.post("/api/v1/leads").set("X-CSRF-Token", admin.csrf).send({ ...branch, duplicates: { approveSharedIdentifiers: true } });
    expect(noReason.status).toBe(409);

    const approved = await admin.agent
      .post("/api/v1/leads")
      .set("X-CSRF-Token", admin.csrf)
      .send({ ...branch, duplicates: { approveSharedIdentifiers: true, sharedIdentifierReason: "Same owner, two outlets, one booking number" } });
    expect(approved.status).toBe(201);
    expect(approved.body.hasSharedIdentifiers).toBe(true);
    const original = await admin.agent.get(`/api/v1/leads/${first.body.id}`);
    expect(original.body.identifiers.find((i: { type: string }) => i.type === "PHONE").isShared).toBe(true);
    expect(await testDb().lead.count()).toBe(2);
    const audit = await testDb().auditLog.findFirstOrThrow({ where: { action: "lead.shared_identifier_approved" } });
    expect(audit.meta).toMatchObject({ reason: "Same owner, two outlets, one booking number", matchedOn: ["PHONE"] });
  });

  it("warns about the same name in the same area and needs a 'different business' confirmation", async () => {
    const { agent, csrf } = await signInAs(app, "SALES_MANAGER");
    await agent.post("/api/v1/leads").set("X-CSRF-Token", csrf).send(await baseLead());
    const sameName = await baseLead({ publicPhone: "98250 11111", instagramHandle: "@another.brewlab" });
    const warned = await agent.post("/api/v1/leads").set("X-CSRF-Token", csrf).send(sameName);
    expect(warned.status).toBe(409);
    expect(warned.body.error.code).toBe("POSSIBLE_DUPLICATE");
    const confirmed = await agent.post("/api/v1/leads").set("X-CSRF-Token", csrf).send({ ...sameName, duplicates: { confirmDifferentBusiness: true } });
    expect(confirmed.status).toBe(201);
    expect(await testDb().auditLog.count({ where: { action: "lead.possible_duplicate_confirmed" } })).toBe(1);
    // Same name in a different area is not a warning.
    const elsewhere = await agent
      .post("/api/v1/leads")
      .set("X-CSRF-Token", csrf)
      .send(await baseLead({ areaId: await areaId("Pal"), publicPhone: "98250 22222", instagramHandle: null }));
    expect(elsewhere.status).toBe(201);
  });

  it("ignores shared link-in-bio hosts when matching", async () => {
    const { agent, csrf } = await signInAs(app, "ADMIN");
    const a = await agent.post("/api/v1/leads").set("X-CSRF-Token", csrf).send(await baseLead({ website: "https://linktr.ee/brewlab", publicPhone: null, instagramHandle: null }));
    const b = await agent
      .post("/api/v1/leads")
      .set("X-CSRF-Token", csrf)
      .send(await baseLead({ businessName: "Juice Junction", website: "https://linktr.ee/juicejunction", publicPhone: null, instagramHandle: null }));
    expect([a.status, b.status]).toEqual([201, 201]);
  });

  it("previews duplicates without creating or merging anything", async () => {
    const { agent, csrf } = await signInAs(app, "SALES_MANAGER");
    await agent.post("/api/v1/leads").set("X-CSRF-Token", csrf).send(await baseLead());
    const check = await agent
      .post("/api/v1/leads/check-duplicates")
      .set("X-CSRF-Token", csrf)
      .send({ businessName: "Other Cafe", publicPhone: "09876543210", areaId: await areaId("Vesu") });
    expect(check.body.exact).toHaveLength(0);
    expect(check.body.shared).toHaveLength(1);
    expect(check.body.possible).toHaveLength(0);
    expect(await testDb().lead.count()).toBe(1);
  });

  it("lets only one of two simultaneous identical submissions through", async () => {
    const { agent, csrf } = await signInAs(app, "SALES_MANAGER");
    const body = await baseLead();
    const [a, b] = await Promise.all([
      agent.post("/api/v1/leads").set("X-CSRF-Token", csrf).send(body),
      agent.post("/api/v1/leads").set("X-CSRF-Token", csrf).send(body),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await testDb().lead.count()).toBe(1);
  });
});

describe("review workflow", () => {
  it("approves, rejects (with a reason) and reopens, recording each change", async () => {
    const { agent, csrf } = await signInAs(app, "SALES_MANAGER");
    const lead = (await agent.post("/api/v1/leads").set("X-CSRF-Token", csrf).send(await baseLead())).body;
    expect((await agent.post(`/api/v1/leads/${lead.id}/review`).set("X-CSRF-Token", csrf).send({ decision: "REJECT" })).status).toBe(400);
    const rejected = await agent.post(`/api/v1/leads/${lead.id}/review`).set("X-CSRF-Token", csrf).send({ decision: "REJECT", note: "Closed permanently" });
    expect(rejected.body).toMatchObject({ reviewStatus: "REJECTED", reviewNote: "Closed permanently" });
    const reopened = await agent.post(`/api/v1/leads/${lead.id}/review`).set("X-CSRF-Token", csrf).send({ decision: "REOPEN" });
    expect(reopened.body.reviewStatus).toBe("PENDING");
    const approved = await agent.post(`/api/v1/leads/${lead.id}/review`).set("X-CSRF-Token", csrf).send({ decision: "APPROVE" });
    expect(approved.body.reviewStatus).toBe("APPROVED");
    const history = (await agent.get(`/api/v1/leads/${lead.id}/history`)).body.data;
    expect(history.filter((h: { action: string }) => h.action === "lead.reviewed").map((h: { previousStatus: string; newStatus: string }) => `${h.previousStatus}>${h.newStatus}`)).toEqual([
      "PENDING>REJECTED",
      "REJECTED>PENDING",
      "PENDING>APPROVED",
    ]);
  });

  it("separates candidates, approved and contacted leads, and protects contacted ones", async () => {
    const { agent, csrf } = await signInAs(app, "SALES_MANAGER");
    const lead = (await agent.post("/api/v1/leads").set("X-CSRF-Token", csrf).send(await baseLead())).body;
    expect((await agent.post(`/api/v1/leads/${lead.id}/record-contact`).set("X-CSRF-Token", csrf).send({ contactedAt: new Date().toISOString(), note: "Called" })).status).toBe(409);
    await agent.post(`/api/v1/leads/${lead.id}/review`).set("X-CSRF-Token", csrf).send({ decision: "APPROVE" });
    let list = (await agent.get("/api/v1/leads?view=approved")).body;
    expect(list.counts).toEqual({ candidates: 0, approved: 1, contacted: 0, rejected: 0 });
    const contacted = await agent
      .post(`/api/v1/leads/${lead.id}/record-contact`)
      .set("X-CSRF-Token", csrf)
      .send({ contactedAt: new Date(Date.now() - 86_400_000).toISOString(), note: "Phoned the owner in 2025" });
    expect(contacted.body.contactStatus).toBe("CONTACTED");
    list = (await agent.get("/api/v1/leads?view=contacted")).body;
    expect(list.data).toHaveLength(1);
    expect(list.counts.approved).toBe(0);
    expect((await agent.post(`/api/v1/leads/${lead.id}/review`).set("X-CSRF-Token", csrf).send({ decision: "REJECT", note: "x" })).status).toBe(409);
    const future = await agent
      .post(`/api/v1/leads/${lead.id}/record-contact`)
      .set("X-CSRF-Token", csrf)
      .send({ contactedAt: new Date(Date.now() + 86_400_000 * 3).toISOString(), note: "x" });
    expect(future.status).toBe(400);
  });
});

describe("do not contact, verification and editing", () => {
  it("lets managers mark do-not-contact but only admins lift it; blocks approval meanwhile", async () => {
    const manager = await signInAs(app, "SALES_MANAGER");
    const lead = (await manager.agent.post("/api/v1/leads").set("X-CSRF-Token", manager.csrf).send(await baseLead())).body;
    const set = await manager.agent.post(`/api/v1/leads/${lead.id}/do-not-contact`).set("X-CSRF-Token", manager.csrf).send({ doNotContact: true, reason: "Owner asked by phone" });
    expect(set.body).toMatchObject({ doNotContact: true, doNotContactReason: "Owner asked by phone" });
    expect((await manager.agent.post(`/api/v1/leads/${lead.id}/review`).set("X-CSRF-Token", manager.csrf).send({ decision: "APPROVE" })).status).toBe(409);
    expect((await manager.agent.post(`/api/v1/leads/${lead.id}/do-not-contact`).set("X-CSRF-Token", manager.csrf).send({ doNotContact: false, reason: "Mistake" })).status).toBe(403);
    const admin = await signInAs(app, "ADMIN");
    const lifted = await admin.agent.post(`/api/v1/leads/${lead.id}/do-not-contact`).set("X-CSRF-Token", admin.csrf).send({ doNotContact: false, reason: "Marked on the wrong lead" });
    expect(lifted.body.doNotContact).toBe(false);
    const actions = (await testDb().auditLog.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(["lead.created", "lead.do_not_contact_set", "lead.do_not_contact_lifted"]);
  });

  it("only marks details verified when a person confirms them, and clears that when contact details change", async () => {
    const { agent, csrf } = await signInAs(app, "SALES_MANAGER");
    const lead = (await agent.post("/api/v1/leads").set("X-CSRF-Token", csrf).send(await baseLead())).body;
    expect(lead.detailsVerified).toBe(false);
    const verified = await agent.post(`/api/v1/leads/${lead.id}/verify-details`).set("X-CSRF-Token", csrf);
    expect(verified.body.detailsVerified).toBe(true);
    const notes = await agent.patch(`/api/v1/leads/${lead.id}`).set("X-CSRF-Token", csrf).send({ notes: "Open 8am–11pm" });
    expect(notes.body.detailsVerified).toBe(true);
    const phone = await agent.patch(`/api/v1/leads/${lead.id}`).set("X-CSRF-Token", csrf).send({ publicPhone: "98250 33333" });
    expect(phone.body.detailsVerified).toBe(false);
    expect(phone.body.identifiers.find((i: { type: string }) => i.type === "PHONE").value).toBe("+919825033333");
    const updates = await testDb().auditLog.findMany({ where: { leadId: lead.id, action: "lead.updated" } });
    expect(updates.map((u) => u.meta)).toEqual([{ fields: ["notes"] }, { fields: ["publicPhone"] }]);
    expect(JSON.stringify(updates)).not.toContain("98250");
    expect(await testDb().auditLog.count({ where: { leadId: lead.id, action: "lead.verification_cleared" } })).toBe(1);
  });

  it("re-checks duplicates when an edit changes contact details", async () => {
    const { agent, csrf } = await signInAs(app, "SALES_MANAGER");
    await agent.post("/api/v1/leads").set("X-CSRF-Token", csrf).send(await baseLead());
    const other = (await agent.post("/api/v1/leads").set("X-CSRF-Token", csrf).send(await baseLead({ businessName: "Juice Junction", publicPhone: "98250 44444", instagramHandle: null }))).body;
    const clash = await agent.patch(`/api/v1/leads/${other.id}`).set("X-CSRF-Token", csrf).send({ instagramHandle: "instagram.com/brewlab.surat" });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("SHARED_IDENTIFIER");
  });
});

describe("visibility and assignment", () => {
  it("shows sales users only their assigned leads, viewers everything read-only", async () => {
    const manager = await signInAs(app, "SALES_MANAGER");
    const seller = await createUser({ role: "SALES_USER" });
    const mine = (await manager.agent.post("/api/v1/leads").set("X-CSRF-Token", manager.csrf).send(await baseLead())).body;
    const notMine = (await manager.agent.post("/api/v1/leads").set("X-CSRF-Token", manager.csrf).send(await baseLead({ businessName: "Juice Junction", publicPhone: null, instagramHandle: null }))).body;
    const assigned = await manager.agent.post(`/api/v1/leads/${mine.id}/assign`).set("X-CSRF-Token", manager.csrf).send({ userId: seller.id });
    expect(assigned.body.assignedTo).toEqual({ id: seller.id, name: seller.name });

    const s = await signIn(app, seller.email);
    const list = (await s.agent.get("/api/v1/leads?view=all")).body;
    expect(list.data.map((l: { id: string }) => l.id)).toEqual([mine.id]);
    expect((await s.agent.get(`/api/v1/leads/${notMine.id}`)).status).toBe(404);
    expect((await s.agent.post(`/api/v1/leads/${mine.id}/review`).set("X-CSRF-Token", s.csrf).send({ decision: "APPROVE" })).status).toBe(403);

    const viewer = await signInAs(app, "VIEWER");
    expect((await viewer.agent.get("/api/v1/leads?view=all")).body.total).toBe(2);
    expect((await viewer.agent.post(`/api/v1/leads/${mine.id}/verify-details`).set("X-CSRF-Token", viewer.csrf)).status).toBe(403);
  });

  it("only assigns to active, non-viewer users", async () => {
    const { agent, csrf } = await signInAs(app, "ADMIN");
    const lead = (await agent.post("/api/v1/leads").set("X-CSRF-Token", csrf).send(await baseLead())).body;
    const viewer = await createUser({ role: "VIEWER" });
    expect((await agent.post(`/api/v1/leads/${lead.id}/assign`).set("X-CSRF-Token", csrf).send({ userId: viewer.id })).status).toBe(400);
    const assignees = (await agent.get("/api/v1/leads/assignees")).body.data.map((u: { id: string }) => u.id);
    expect(assignees).not.toContain(viewer.id);
  });

  it("searches by name, lead number and contact detail, with pagination", async () => {
    const { agent, csrf } = await signInAs(app, "SALES_MANAGER");
    const a = (await agent.post("/api/v1/leads").set("X-CSRF-Token", csrf).send(await baseLead())).body;
    await agent.post("/api/v1/leads").set("X-CSRF-Token", csrf).send(await baseLead({ businessName: "Juice Junction", publicPhone: null, instagramHandle: null }));
    expect((await agent.get("/api/v1/leads?view=all&q=brew")).body.total).toBe(1);
    expect((await agent.get(`/api/v1/leads?view=all&q=LD-${a.displayId}`)).body.data[0].id).toBe(a.id);
    expect((await agent.get("/api/v1/leads?view=all&q=9876543210")).body.data[0].id).toBe(a.id);
    const page = (await agent.get("/api/v1/leads?view=all&pageSize=1&page=2")).body;
    expect(page).toMatchObject({ page: 2, pageSize: 1, total: 2 });
    expect(page.data).toHaveLength(1);
  });

  it("requires sign-in", async () => {
    expect((await request(app).get("/api/v1/leads")).status).toBe(401);
  });
});

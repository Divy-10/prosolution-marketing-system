import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, resetDb, seedConfiguration, signInAs, testDb } from "./helpers.ts";

const app = buildApp();
beforeEach(async () => {
  await resetDb();
  await seedConfiguration();
});
afterAll(async () => {
  await testDb().$disconnect();
});

describe("company profile and settings", () => {
  it("lets every role read the profile but only admins change it", async () => {
    for (const role of ["SALES_MANAGER", "SALES_USER", "VIEWER"] as const) {
      const { agent, csrf } = await signInAs(app, role);
      const read = await agent.get("/api/v1/settings/company-profile");
      expect(read.status).toBe(200);
      expect(read.body.companyName).toBe("ProSolution Infotech");
      const write = await agent.put("/api/v1/settings/company-profile").set("X-CSRF-Token", csrf).send({ ...read.body, tagline: "x" });
      expect(write.status).toBe(403);
    }
  });

  it("updates the profile, validates contact details and audits changed field names", async () => {
    const { agent, csrf } = await signInAs(app, "ADMIN");
    const current = (await agent.get("/api/v1/settings/company-profile")).body;
    const bad = await agent
      .put("/api/v1/settings/company-profile")
      .set("X-CSRF-Token", csrf)
      .send({ ...current, publicPhone: "12345", website: "not a site" });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.details).sort()).toEqual(["publicPhone", "website"]);

    const ok = await agent
      .put("/api/v1/settings/company-profile")
      .set("X-CSRF-Token", csrf)
      .send({ ...current, tagline: "Grow your business digitally", requireOnlinePresence: true });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ tagline: "Grow your business digitally", requireOnlinePresence: true });
    const audit = await testDb().auditLog.findFirstOrThrow({ where: { action: "settings.company_profile_updated" } });
    expect(audit.meta).toEqual({ fields: ["tagline", "requireOnlinePresence"] });
  });

  it("keeps the retention threshold within limits and records old and new values", async () => {
    const { agent, csrf } = await signInAs(app, "ADMIN");
    expect((await agent.get("/api/v1/settings/system")).body.leadRetentionDays).toBe(180);
    expect((await agent.patch("/api/v1/settings/system").set("X-CSRF-Token", csrf).send({ leadRetentionDays: 10 })).status).toBe(400);
    const ok = await agent.patch("/api/v1/settings/system").set("X-CSRF-Token", csrf).send({ leadRetentionDays: 365 });
    expect(ok.body.leadRetentionDays).toBe(365);
    const audit = await testDb().auditLog.findFirstOrThrow({ where: { action: "settings.system_updated" } });
    expect(audit).toMatchObject({ previousStatus: "180 days", newStatus: "365 days" });
  });

  it("requires sign-in", async () => {
    expect((await request(app).get("/api/v1/settings/company-profile")).status).toBe(401);
    expect((await request(app).get("/api/v1/services")).status).toBe(401);
  });
});

describe("services", () => {
  it("lists the 11 seeded services with no price fields", async () => {
    const { agent } = await signInAs(app, "VIEWER");
    const res = await agent.get("/api/v1/services");
    expect(res.body.data).toHaveLength(11);
    expect(res.body.data.map((s: { name: string }) => s.name)).toContain("Model & product shoot coordination");
    expect(JSON.stringify(res.body)).not.toMatch(/price/i);
  });

  it("creates, edits and disables a service, auditing each step", async () => {
    const { agent, csrf } = await signInAs(app, "ADMIN");
    const created = await agent
      .post("/api/v1/services")
      .set("X-CSRF-Token", csrf)
      .send({ name: "Podcast production", category: "Social & content", description: "Recording and editing business podcasts.", keyBenefits: ["Long-form content"] });
    expect(created.status).toBe(201);
    const id = created.body.id;
    const edited = await agent.patch(`/api/v1/services/${id}`).set("X-CSRF-Token", csrf).send({ description: "Recording, editing and publishing podcasts." });
    expect(edited.status).toBe(200);
    const disabled = await agent.patch(`/api/v1/services/${id}`).set("X-CSRF-Token", csrf).send({ isActive: false });
    expect(disabled.body.isActive).toBe(false);
    const active = await agent.get("/api/v1/services?status=active");
    expect(active.body.data.find((s: { id: string }) => s.id === id)).toBeUndefined();
    const actions = (await testDb().auditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(["service.created", "service.updated", "service.disabled"]);
  });

  it("rejects duplicate names regardless of case, spacing or '&' vs 'and'", async () => {
    const { agent, csrf } = await signInAs(app, "ADMIN");
    const dup = await agent
      .post("/api/v1/services")
      .set("X-CSRF-Token", csrf)
      .send({ name: "graphic design AND branding", category: "Design", description: "Duplicate" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toMatch(/already exists/);
  });

  it("validates input and blocks non-admins", async () => {
    const { agent, csrf } = await signInAs(app, "ADMIN");
    const bad = await agent.post("/api/v1/services").set("X-CSRF-Token", csrf).send({ name: "", category: "", description: "" });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.details).sort()).toEqual(["category", "description", "name"]);
    const manager = await signInAs(app, "SALES_MANAGER");
    const forbidden = await manager.agent
      .post("/api/v1/services")
      .set("X-CSRF-Token", manager.csrf)
      .send({ name: "X service", category: "Y", description: "Z" });
    expect(forbidden.status).toBe(403);
  });
});

describe("industries", () => {
  it("lists the 16 merged industries with suggested services", async () => {
    const { agent } = await signInAs(app, "SALES_USER");
    const res = await agent.get("/api/v1/industries");
    expect(res.body.data).toHaveLength(16);
    const cafes = res.body.data.find((i: { name: string }) => i.name === "Cafés & restaurants");
    expect(cafes.serviceIds.length).toBeGreaterThan(0);
  });

  it("creates an industry with suggested services and replaces them on edit", async () => {
    const { agent, csrf } = await signInAs(app, "ADMIN");
    const services = (await agent.get("/api/v1/services")).body.data as { id: string }[];
    const created = await agent
      .post("/api/v1/industries")
      .set("X-CSRF-Token", csrf)
      .send({ name: "Dental clinics", serviceIds: [services[0]!.id, services[1]!.id] });
    expect(created.status).toBe(201);
    expect(created.body.serviceIds).toHaveLength(2);
    const edited = await agent.patch(`/api/v1/industries/${created.body.id}`).set("X-CSRF-Token", csrf).send({ serviceIds: [services[2]!.id] });
    expect(edited.body.serviceIds).toEqual([services[2]!.id]);
    const audit = await testDb().auditLog.findFirstOrThrow({ where: { action: "industry.updated", entityId: created.body.id } });
    expect(audit.meta).toEqual({ fields: ["suggestedServices"] });
  });

  it("rejects duplicate names and unknown services", async () => {
    const { agent, csrf } = await signInAs(app, "ADMIN");
    expect((await agent.post("/api/v1/industries").set("X-CSRF-Token", csrf).send({ name: "CAFES and Restaurants" })).status).toBe(409);
    const unknown = await agent.post("/api/v1/industries").set("X-CSRF-Token", csrf).send({ name: "Bakeries", serviceIds: ["nope"] });
    expect(unknown.status).toBe(400);
  });
});

describe("cities and areas", () => {
  it("lists Surat with its 12 areas", async () => {
    const { agent } = await signInAs(app, "VIEWER");
    const cities = (await agent.get("/api/v1/cities")).body.data;
    expect(cities).toEqual([expect.objectContaining({ name: "Surat", state: "Gujarat", areaCount: 12 })]);
    const areas = (await agent.get(`/api/v1/areas?cityId=${cities[0].id}`)).body.data.map((a: { name: string }) => a.name);
    expect(areas).toEqual(["Vesu", "Adajan", "City Light", "Piplod", "Pal", "Dumas", "Varachha", "Katargam", "Udhna", "Athwa", "Althan", "VIP Road"]);
  });

  it("adds, renames and disables an area, rejecting duplicates within the city", async () => {
    const { agent, csrf } = await signInAs(app, "ADMIN");
    const surat = (await agent.get("/api/v1/cities")).body.data[0];
    const added = await agent.post("/api/v1/areas").set("X-CSRF-Token", csrf).send({ cityId: surat.id, name: "Ghod Dod Road" });
    expect(added.status).toBe(201);
    expect((await agent.post("/api/v1/areas").set("X-CSRF-Token", csrf).send({ cityId: surat.id, name: "  vesu " })).status).toBe(409);
    const renamed = await agent.patch(`/api/v1/areas/${added.body.id}`).set("X-CSRF-Token", csrf).send({ name: "Ghod Dod Rd" });
    expect(renamed.body.name).toBe("Ghod Dod Rd");
    const vesu = (await agent.get("/api/v1/areas")).body.data.find((a: { name: string }) => a.name === "Vesu");
    expect((await agent.patch(`/api/v1/areas/${added.body.id}`).set("X-CSRF-Token", csrf).send({ name: "Vesu" })).status).toBe(409);
    const disabled = await agent.patch(`/api/v1/areas/${vesu.id}`).set("X-CSRF-Token", csrf).send({ isActive: false });
    expect(disabled.body.isActive).toBe(false);
    const actions = (await testDb().auditLog.findMany({ where: { entityType: "Area" } })).map((a) => a.action).sort();
    expect(actions).toEqual(["area.created", "area.disabled", "area.updated"]);
  });

  it("blocks non-admins from changing areas", async () => {
    const { agent, csrf } = await signInAs(app, "SALES_MANAGER");
    const surat = (await agent.get("/api/v1/cities")).body.data[0];
    expect((await agent.post("/api/v1/areas").set("X-CSRF-Token", csrf).send({ cityId: surat.id, name: "Rander" })).status).toBe(403);
  });
});

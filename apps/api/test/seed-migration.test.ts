import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { TEST_DB_URL, resetDb, seedConfiguration, testDb } from "./helpers.ts";

beforeEach(resetDb);
afterAll(async () => {
  await testDb().$disconnect();
});

describe("configuration seed", () => {
  it("creates the approved starting configuration and no leads", async () => {
    const r = await seedConfiguration();
    expect(r).toMatchObject({ companyProfile: true, systemSettings: true, services: 11, industries: 16, cities: 1, areas: 12 });
    expect(await testDb().lead.count()).toBe(0);
    expect((await testDb().systemSettings.findUniqueOrThrow({ where: { id: "default" } })).leadRetentionDays).toBe(180);
  });

  it("is safe to run again: adds nothing twice and never overwrites admin edits", async () => {
    await seedConfiguration();
    await testDb().service.updateMany({ where: { name: "Digital marketing" }, data: { description: "Edited by admin", isActive: false } });
    await testDb().companyProfile.update({ where: { id: "default" }, data: { tagline: "Edited tagline" } });
    const cafes = await testDb().industry.findFirstOrThrow({ where: { name: "Cafés & restaurants" } });
    await testDb().industryService.deleteMany({ where: { industryId: cafes.id } });

    const again = await seedConfiguration();
    expect(again).toEqual({ companyProfile: false, systemSettings: false, services: 0, industries: 0, industryServiceLinks: 0, cities: 0, areas: 0 });
    expect(await testDb().service.count()).toBe(11);
    expect(await testDb().industry.count()).toBe(16);
    expect(await testDb().area.count()).toBe(12);
    const dm = await testDb().service.findFirstOrThrow({ where: { name: "Digital marketing" } });
    expect(dm).toMatchObject({ description: "Edited by admin", isActive: false });
    expect((await testDb().companyProfile.findUniqueOrThrow({ where: { id: "default" } })).tagline).toBe("Edited tagline");
    expect(await testDb().industryService.count({ where: { industryId: cafes.id } })).toBe(0);
    expect(await testDb().auditLog.count({ where: { action: "system.config_seeded" } })).toBe(1);
  });
});

describe("Phase 2 migration", () => {
  it("upgrades a Phase 1 database without touching existing users, sessions or audit rows", async () => {
    const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../packages/db/prisma/migrations");
    const dirs = readdirSync(migrationsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
    expect(dirs[0]).toBe("20261017120000_init_auth_audit");
    const phase2 = dirs.find((d) => d.includes("phase2"))!;
    const sql = (dir: string) => readFileSync(path.join(migrationsDir, dir, "migration.sql"), "utf8");

    // The Phase 2 migration is additive: no DROP, no ALTER of Phase 1 tables, no data changes.
    const p2 = sql(phase2);
    expect(p2).not.toMatch(/\bDROP\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|\bUPDATE\s+"/i);
    expect(p2).not.toMatch(/ALTER TABLE "(User|Session|AuditLog)"/);

    const url = new URL(TEST_DB_URL);
    const dbName = `${url.pathname.slice(1)}_upgrade`;
    const admin = new pg.Client({ connectionString: TEST_DB_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    await admin.query(`CREATE DATABASE "${dbName}"`);
    url.pathname = `/${dbName}`;
    const c = new pg.Client({ connectionString: url.toString() });
    await c.connect();
    try {
      await c.query(sql(dirs[0]!));
      await c.query(`INSERT INTO "User" (id, email, name, "passwordHash", role, "updatedAt") VALUES ('u1','a@b.test','A','h','ADMIN', now())`);
      await c.query(`INSERT INTO "AuditLog" (id, action, "entityType") VALUES ('a1','auth.login_succeeded','User')`);
      await c.query(p2);
      const users = await c.query(`SELECT id, email, role FROM "User"`);
      const audits = await c.query(`SELECT id FROM "AuditLog"`);
      expect(users.rows).toEqual([{ id: "u1", email: "a@b.test", role: "ADMIN" }]);
      expect(audits.rows).toEqual([{ id: "a1" }]);
      const tables = await c.query(`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public'`);
      expect(tables.rows[0].n).toBe(12);
      // Append-only audit protection from Phase 1 is still in force.
      await expect(c.query(`DELETE FROM "AuditLog"`)).rejects.toThrow(/append-only/);
    } finally {
      await c.end();
      await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
      await admin.end();
    }
  });
});

/**
 * Loads ProSolution's starting configuration (company profile, 11 services,
 * 16 industries, Surat and its areas, retention setting).
 *
 *   pnpm db:seed
 *
 * Safe to run more than once: it only adds what is missing and never
 * overwrites or deletes anything. It creates no leads.
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "../src/index.ts";
import { seedConfig } from "../src/seed-config.ts";

loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"), quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✖ DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const db = createDb({ connectionString: url, max: 1 });
try {
  const r = await seedConfig(db);
  console.log("✔ Configuration checked. Added:");
  console.log(`  company profile: ${r.companyProfile ? "yes" : "already present"}`);
  console.log(`  system settings: ${r.systemSettings ? "yes" : "already present"}`);
  console.log(`  services: ${r.services}, industries: ${r.industries} (${r.industryServiceLinks} suggested-service links)`);
  console.log(`  cities: ${r.cities}, areas: ${r.areas}`);
  console.log("  Nothing existing was changed. No leads were created.");
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  if (/does not exist|relation .* does not exist/i.test(message)) {
    console.error("✖ The Phase 2 tables are missing. Run `pnpm db:migrate` first.");
  } else if (/ECONNREFUSED|Can't reach database/i.test(message)) {
    console.error("✖ Can't reach the database. Is Docker running? Try `pnpm services:up`.");
  } else {
    console.error(`✖ ${message}`);
  }
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}

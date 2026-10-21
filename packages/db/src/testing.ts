/**
 * Test-database helpers. Never import this from application code.
 *
 * Resets the TEST database by dropping the public schema and applying every
 * migration.sql in order. This keeps tests fast and independent of the Prisma
 * migration engine. Your real database is migrated with `pnpm db:migrate`.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "prisma",
  "migrations",
);

export function assertTestDatabaseUrl(url: string | undefined): string {
  if (!url) {
    throw new Error("TEST_DATABASE_URL is not set. Add it to .env (see .env.example).");
  }
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!/test/i.test(dbName)) {
    throw new Error(
      `Refusing to reset database "${dbName}": the test database name must contain "test".`,
    );
  }
  return url;
}

export async function resetTestDatabase(url: string): Promise<void> {
  assertTestDatabaseUrl(url);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
    const dirs = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const dir of dirs) {
      const file = path.join(migrationsDir, dir, "migration.sql");
      if (!existsSync(file)) continue;
      await client.query(readFileSync(file, "utf8"));
    }
  } finally {
    await client.end();
  }
}

/** Empties every application table between tests (TRUNCATE bypasses the audit-log trigger). */
export async function truncateAll(url: string): Promise<void> {
  assertTestDatabaseUrl(url);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
    );
    if (rows.length) {
      const list = rows.map((r) => `"${r.tablename.replace(/"/g, '""')}"`).join(", ");
      await client.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
    }
  } finally {
    await client.end();
  }
}

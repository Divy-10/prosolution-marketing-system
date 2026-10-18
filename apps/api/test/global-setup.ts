import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertTestDatabaseUrl, resetTestDatabase } from "@prosolution/db/testing";

/** Rebuilds the test database from the migration files once per test run. */
export default async function setup() {
  loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"), quiet: true });
  const url = assertTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  try {
    await resetTestDatabase(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not prepare the test database (${message}).\n` +
        "Start Postgres with `pnpm services:up` and check TEST_DATABASE_URL in .env.",
    );
  }
}

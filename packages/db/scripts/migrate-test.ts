// Rebuilds the TEST database from the migration files. Never touches your main database.
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resetTestDatabase, assertTestDatabaseUrl } from "../src/testing.ts";

loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"), quiet: true });

const url = assertTestDatabaseUrl(process.env.TEST_DATABASE_URL);
await resetTestDatabase(url);
console.log(`Test database ${new URL(url).pathname.slice(1)} rebuilt from migrations.`);

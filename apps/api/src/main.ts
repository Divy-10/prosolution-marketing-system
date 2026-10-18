import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "@prosolution/db";
import { ConfigError, loadConfig } from "./config/env.ts";
import { createLogger } from "./lib/logger.ts";
import { createApp } from "./app.ts";

// One .env at the repository root (apps/api/src → ../../..; apps/api/dist → ../../..).
loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"), quiet: true });

let config;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(`\n${err.message}\n`);
    process.exit(1);
  }
  throw err;
}

const logger = createLogger(config);
const db = createDb({ connectionString: config.databaseUrl });
const { app, sessions } = createApp({ config, db, logger });

try {
  await db.$queryRaw`SELECT 1`;
} catch {
  logger.fatal("Can't reach the database. Is Docker running? Try `pnpm services:up`, then `pnpm db:migrate`.");
  process.exit(1);
}

if (!config.humanApprovalRequired) {
  logger.warn("HUMAN_APPROVAL_REQUIRED is false. Outbound messages will still require approval in Phase 1.");
}

const server = app.listen(config.port, config.host, () => {
  logger.info(`API listening on http://${config.host}:${config.port} (${config.env})`);
});

// Remove expired sessions hourly.
const cleanup = setInterval(() => {
  sessions.deleteExpired().then(
    (n) => n && logger.info({ removed: n }, "Removed expired sessions"),
    (err: unknown) => logger.error({ err }, "Session cleanup failed"),
  );
}, 60 * 60_000);
cleanup.unref();

function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  clearInterval(cleanup);
  server.close(() => {
    db.$disconnect().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

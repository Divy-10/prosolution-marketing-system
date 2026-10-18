import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import type { Express } from "express";
import { createDb, hashPassword, type Db, type User } from "@prosolution/db";
import { assertTestDatabaseUrl, truncateAll } from "@prosolution/db/testing";
import type { Role } from "@prosolution/shared";
import { loadConfig, type AppConfig } from "../src/config/env.ts";
import { createLogger } from "../src/lib/logger.ts";
import { createApp } from "../src/app.ts";

loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"), quiet: true });

export const TEST_DB_URL = assertTestDatabaseUrl(process.env.TEST_DATABASE_URL);
export const APP_ORIGIN = "http://localhost:5173";
export const PASSWORD = "correct horse battery staple";

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: "test",
    APP_URL: APP_ORIGIN,
    DATABASE_URL: TEST_DB_URL,
    SESSION_SECRET: "test-session-secret-that-is-long-enough-0123456789abcdef",
    LOGIN_MAX_FAILED_ATTEMPTS: "3",
    LOGIN_LOCK_MINUTES: "15",
    LOGIN_RATE_LIMIT_PER_15_MIN: "1000",
    API_RATE_LIMIT_PER_MIN: "10000",
    ...overrides,
  });
}

let sharedDb: Db | undefined;
export function testDb(): Db {
  sharedDb ??= createDb({ connectionString: TEST_DB_URL, max: 5 });
  return sharedDb;
}

export async function resetDb(): Promise<void> {
  await truncateAll(TEST_DB_URL);
}

export function buildApp(overrides: Record<string, string> = {}): Express {
  const config = testConfig(overrides);
  return createApp({ config, db: testDb(), logger: createLogger(config) }).app;
}

let counter = 0;
export async function createUser(
  data: Partial<Pick<User, "email" | "name" | "role" | "isActive" | "mustChangePassword">> & { password?: string } = {},
): Promise<User> {
  counter += 1;
  return testDb().user.create({
    data: {
      email: data.email ?? `user${counter}@prosolution.test`,
      name: data.name ?? `Test User ${counter}`,
      role: (data.role ?? "VIEWER") as Role,
      isActive: data.isActive ?? true,
      mustChangePassword: data.mustChangePassword ?? false,
      passwordHash: await hashPassword(data.password ?? PASSWORD),
    },
  });
}

/** Signs in and returns a cookie-keeping agent plus the CSRF token for mutating requests. */
export async function signIn(app: Express, email: string, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post("/api/v1/auth/login").set("Origin", APP_ORIGIN).send({ email, password });
  if (res.status !== 200) throw new Error(`signIn failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, csrf: res.body.csrfToken as string, body: res.body };
}

export async function signInAs(app: Express, role: Role) {
  const user = await createUser({ role });
  return { user, ...(await signIn(app, user.email)) };
}

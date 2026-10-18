import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config/env.ts";

const valid = {
  NODE_ENV: "development",
  APP_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://u:p@localhost:5432/prosolution",
  SESSION_SECRET: "a".repeat(20) + "b".repeat(20) + "0123456789",
};

describe("environment configuration", () => {
  it("loads valid config with safe defaults", () => {
    const c = loadConfig(valid);
    expect(c.port).toBe(4000);
    expect(c.humanApprovalRequired).toBe(true);
    expect(c.session.cookieSecure).toBe(false);
    expect(c.session.cookieName).toBe("ps_sid");
  });

  it("names every missing variable", () => {
    try {
      loadConfig({});
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const msg = (err as Error).message;
      expect(msg).toContain("APP_URL");
      expect(msg).toContain("DATABASE_URL");
      expect(msg).toContain("SESSION_SECRET");
    }
  });

  it("rejects the placeholder values from .env.example", () => {
    expect(() =>
      loadConfig({ ...valid, SESSION_SECRET: "replace-with-output-of-pnpm-secrets-generate" }),
    ).toThrow(/SESSION_SECRET/);
    expect(() =>
      loadConfig({ ...valid, DATABASE_URL: "postgresql://u:replace-with-a-local-db-password@localhost/db" }),
    ).toThrow(/DATABASE_URL/);
  });

  it("never echoes secret values in the error", () => {
    const secret = "short-but-secret";
    try {
      loadConfig({ ...valid, SESSION_SECRET: secret });
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).not.toContain(secret);
    }
  });

  it("requires https and a longer secret in production, and then uses a __Host- secure cookie", () => {
    expect(() => loadConfig({ ...valid, NODE_ENV: "production" })).toThrow(/APP_URL.*https/s);
    const prod = loadConfig({
      ...valid,
      NODE_ENV: "production",
      APP_URL: "https://outreach.example.com",
      SESSION_SECRET: "x".repeat(32) + "y".repeat(32),
    });
    expect(prod.session.cookieSecure).toBe(true);
    expect(prod.session.cookieName).toBe("__Host-ps_sid");
  });

  it("keeps human approval on unless explicitly disabled", () => {
    expect(loadConfig({ ...valid, HUMAN_APPROVAL_REQUIRED: "" }).humanApprovalRequired).toBe(true);
    expect(loadConfig({ ...valid, HUMAN_APPROVAL_REQUIRED: "false" }).humanApprovalRequired).toBe(false);
    expect(() => loadConfig({ ...valid, HUMAN_APPROVAL_REQUIRED: "maybe" })).toThrow(/HUMAN_APPROVAL_REQUIRED/);
  });
});

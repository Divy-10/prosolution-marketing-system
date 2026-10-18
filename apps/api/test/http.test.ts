import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { APP_ORIGIN, buildApp, testDb } from "./helpers.ts";

const app = buildApp();
afterAll(async () => {
  await testDb().$disconnect();
});

describe("HTTP behaviour", () => {
  it("reports health and database readiness", async () => {
    expect((await request(app).get("/api/v1/health")).body).toEqual({ status: "ok" });
    expect((await request(app).get("/api/v1/health/ready")).body).toEqual({ status: "ready", database: "ok" });
  });

  it("sends security headers and hides the framework", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("echoes a well-formed incoming request id and replaces a malformed one", async () => {
    const good = await request(app).get("/api/v1/health").set("X-Request-Id", "abc12345-trace");
    expect(good.headers["x-request-id"]).toBe("abc12345-trace");
    const bad = await request(app).get("/api/v1/health").set("X-Request-Id", "<script>");
    expect(bad.headers["x-request-id"]).not.toBe("<script>");
  });

  it("returns JSON 404s for unknown routes", async () => {
    const res = await request(app).get("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error.requestId).toBeTruthy();
  });

  it("returns a clear 400 for malformed JSON", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", APP_ORIGIN)
      .set("Content-Type", "application/json")
      .send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/valid JSON/);
  });

  it("rejects oversized bodies", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", APP_ORIGIN)
      .send({ email: "a@b.co", password: "x".repeat(200_000) });
    expect(res.status).toBe(413);
  });
});

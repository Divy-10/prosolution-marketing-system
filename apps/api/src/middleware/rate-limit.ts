import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import type { RequestHandler } from "express";
import type { AppConfig } from "../config/env.ts";
import { AppError } from "../lib/errors.ts";

// Phase 1 uses the in-memory store (one API process, local use).
// When the API runs as several processes (Phase 12), switch to a Redis store.

function limited(message: string) {
  return (_req: unknown, _res: unknown, next: (err: unknown) => void) =>
    next(new AppError(429, "RATE_LIMITED", message));
}

export function apiRateLimit(config: AppConfig): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit: config.apiRateLimitPerMin,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: limited("Too many requests. Wait a minute and try again."),
  });
}

/** Per-IP limit on sign-in attempts, on top of the per-account lockout. */
export function loginRateLimit(config: AppConfig): RequestHandler {
  return rateLimit({
    windowMs: 15 * 60_000,
    limit: config.login.rateLimitPer15Min,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown"),
    handler: limited("Too many sign-in attempts from this network. Wait 15 minutes and try again."),
  });
}

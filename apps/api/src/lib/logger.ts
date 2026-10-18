import { pino, type Logger } from "pino";
import type { AppConfig } from "../config/env.ts";

/** Paths that must never reach the logs. */
export const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['x-csrf-token']",
  'res.headers["set-cookie"]',
  "*.password",
  "*.currentPassword",
  "*.newPassword",
  "*.temporaryPassword",
  "*.passwordHash",
  "*.token",
  "*.tokenHash",
  "*.csrfToken",
  "*.accessToken",
  "*.secret",
];

export function createLogger(config: Pick<AppConfig, "log" | "env">): Logger {
  return pino({
    // Tests are quiet unless TEST_LOGS=1 is set (handy when debugging a failing test).
    level: config.env === "test" && process.env.TEST_LOGS !== "1" ? "silent" : config.log.level,
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    base: { service: "api" },
    ...(config.log.pretty
      ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss" } } }
      : {}),
  });
}

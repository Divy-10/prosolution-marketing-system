import { z } from "zod";

const booleanString = z
  .enum(["true", "false", "1", "0", "yes", "no"])
  .transform((v) => v === "true" || v === "1" || v === "yes");

const PLACEHOLDER = /replace-with|change-me|changeme/i;

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url({ protocol: /^https?$/ }),
    API_HOST: z.string().min(1).default("127.0.0.1"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),

    DATABASE_URL: z
      .string()
      .min(1)
      .refine((v) => /^postgres(ql)?:\/\//.test(v), "must be a postgresql:// connection string")
      .refine((v) => !PLACEHOLDER.test(v), "still contains the placeholder password from .env.example"),

    SESSION_SECRET: z
      .string()
      .min(32, "must be at least 32 characters (run `pnpm secrets:generate`)")
      .refine((v) => !PLACEHOLDER.test(v), "still contains the placeholder from .env.example"),
    SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(24 * 60).default(480),
    SESSION_ABSOLUTE_DAYS: z.coerce.number().int().min(1).max(30).default(7),

    LOGIN_MAX_FAILED_ATTEMPTS: z.coerce.number().int().min(3).max(50).default(10),
    LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).max(24 * 60).default(15),
    LOGIN_RATE_LIMIT_PER_15_MIN: z.coerce.number().int().min(1).max(1000).default(20),
    API_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(10).max(10_000).default(300),

    HUMAN_APPROVAL_REQUIRED: booleanString.default(true),

    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    LOG_PRETTY: booleanString.default(false),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production") {
      if (!env.APP_URL.startsWith("https://")) {
        ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "must use https:// in production" });
      }
      if (env.SESSION_SECRET.length < 64) {
        ctx.addIssue({ code: "custom", path: ["SESSION_SECRET"], message: "must be at least 64 characters in production" });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export interface AppConfig {
  env: Env["NODE_ENV"];
  appUrl: string;
  appOrigin: string;
  host: string;
  port: number;
  trustProxy: number;
  databaseUrl: string;
  session: {
    secret: string;
    idleMs: number;
    absoluteMs: number;
    cookieName: string;
    cookieSecure: boolean;
  };
  login: {
    maxFailedAttempts: number;
    lockMs: number;
    rateLimitPer15Min: number;
  };
  apiRateLimitPerMin: number;
  humanApprovalRequired: boolean;
  log: { level: Env["LOG_LEVEL"]; pretty: boolean };
}

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(
      "Invalid environment configuration:\n" +
        problems.map((p) => `  • ${p}`).join("\n") +
        "\nFix these in your .env file (see .env.example).",
    );
    this.name = "ConfigError";
  }
}

/**
 * Validates environment variables and returns typed config.
 * Error messages name the variable and the problem, never the value.
 */
export function loadConfig(source: Record<string, string | undefined> = process.env): AppConfig {
  // Treat empty strings as "not set" so defaults apply.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v !== ""),
  );
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => {
      const key = issue.path.join(".") || "(root)";
      const message = issue.code === "invalid_type" && issue.input === undefined ? "is required" : issue.message;
      return `${key} ${message}`;
    });
    throw new ConfigError(problems);
  }
  const e = parsed.data;
  const cookieSecure = e.APP_URL.startsWith("https://");
  return {
    env: e.NODE_ENV,
    appUrl: e.APP_URL,
    appOrigin: new URL(e.APP_URL).origin,
    host: e.API_HOST,
    port: e.API_PORT,
    trustProxy: e.TRUST_PROXY,
    databaseUrl: e.DATABASE_URL,
    session: {
      secret: e.SESSION_SECRET,
      idleMs: e.SESSION_IDLE_MINUTES * 60_000,
      absoluteMs: e.SESSION_ABSOLUTE_DAYS * 86_400_000,
      // The __Host- prefix makes browsers enforce Secure + Path=/ + no Domain.
      cookieName: cookieSecure ? "__Host-ps_sid" : "ps_sid",
      cookieSecure,
    },
    login: {
      maxFailedAttempts: e.LOGIN_MAX_FAILED_ATTEMPTS,
      lockMs: e.LOGIN_LOCK_MINUTES * 60_000,
      rateLimitPer15Min: e.LOGIN_RATE_LIMIT_PER_15_MIN,
    },
    apiRateLimitPerMin: e.API_RATE_LIMIT_PER_MIN,
    humanApprovalRequired: e.HUMAN_APPROVAL_REQUIRED,
    log: { level: e.LOG_LEVEL, pretty: e.LOG_PRETTY && e.NODE_ENV !== "production" },
  };
}

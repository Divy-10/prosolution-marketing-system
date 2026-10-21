import express, { Router, type Express } from "express";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import type { Db } from "@prosolution/db";
import type { AppConfig } from "./config/env.ts";
import { loadSession } from "./middleware/auth.ts";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.ts";
import { apiRateLimit } from "./middleware/rate-limit.ts";
import { csrfProtection, noStore, originCheck, securityHeaders } from "./middleware/security.ts";
import { auditRoutes } from "./modules/audit/audit.routes.ts";
import { AuthService } from "./modules/auth/auth.service.ts";
import { authRoutes } from "./modules/auth/auth.routes.ts";
import { SessionService } from "./modules/auth/session.service.ts";
import { healthRoutes } from "./modules/health/health.routes.ts";
import { UsersService } from "./modules/users/users.service.ts";
import { usersRoutes } from "./modules/users/users.routes.ts";
import { SettingsService } from "./modules/settings/settings.service.ts";
import { settingsRoutes } from "./modules/settings/settings.routes.ts";
import { IndustriesService, LocationsService, ServicesService } from "./modules/catalog/catalog.service.ts";
import { catalogRoutes } from "./modules/catalog/catalog.routes.ts";
import { LeadsService } from "./modules/leads/leads.service.ts";
import { leadsRoutes } from "./modules/leads/leads.routes.ts";
import { RetentionService } from "./modules/retention/retention.service.ts";
import { retentionRoutes } from "./modules/retention/retention.routes.ts";

export interface AppDeps {
  config: AppConfig;
  db: Db;
  logger: Logger;
}

export interface App {
  app: Express;
  sessions: SessionService;
}

const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

export function createApp({ config, db, logger }: AppDeps): App {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.set("query parser", "simple");

  const sessions = new SessionService(db, config);
  const auth = new AuthService(db, config, sessions);
  const users = new UsersService(db);
  const settings = new SettingsService(db);
  const leads = new LeadsService(db);
  const retention = new RetentionService(db);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers["x-request-id"];
        const id = typeof incoming === "string" && REQUEST_ID.test(incoming) ? incoming : randomUUID();
        res.setHeader("X-Request-Id", id);
        return id;
      },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
      autoLogging: { ignore: (req) => req.url?.startsWith("/api/v1/health") ?? false },
    }),
  );
  app.use(securityHeaders());
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  const api = Router();
  api.use(noStore());
  api.use("/health", healthRoutes(db));
  api.use(apiRateLimit(config));
  api.use(originCheck(config));
  api.use(loadSession(config, sessions));
  api.use(csrfProtection());
  api.use("/auth", authRoutes(config, auth));
  api.use("/users", usersRoutes(users));
  api.use("/audit", auditRoutes(db));
  api.use("/settings", settingsRoutes(settings));
  api.use("/", catalogRoutes(new ServicesService(db), new IndustriesService(db), new LocationsService(db)));
  api.use("/leads", leadsRoutes(leads));
  api.use("/retention", retentionRoutes(retention));
  api.use(notFoundHandler);

  app.use("/api/v1", api);
  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return { app, sessions };
}

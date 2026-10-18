import { Router } from "express";
import type { Db } from "@prosolution/db";

export function healthRoutes(db: Db): Router {
  const router = Router();

  /** Liveness: the process is up. */
  router.get("/", (_req, res) => {
    res.json({ status: "ok" });
  });

  /** Readiness: the database answers. Doesn't reveal connection details. */
  router.get("/ready", async (_req, res) => {
    try {
      await db.$queryRaw`SELECT 1`;
      res.json({ status: "ready", database: "ok" });
    } catch {
      res.status(503).json({ status: "not_ready", database: "unreachable" });
    }
  });

  return router;
}

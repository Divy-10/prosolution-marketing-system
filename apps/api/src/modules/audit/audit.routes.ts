import { Router } from "express";
import { listAuditQuerySchema } from "@prosolution/shared";
import type { Db } from "@prosolution/db";
import { validate } from "../../lib/validate.ts";
import { requirePermission } from "../../middleware/auth.ts";
import { listAudit } from "./audit.service.ts";

/** Read-only by design: there is no route that edits or deletes audit rows. */
export function auditRoutes(db: Db): Router {
  const router = Router();
  router.use(...requirePermission("audit:read"));
  router.get("/", async (req, res) => {
    res.json(await listAudit(db, validate(listAuditQuerySchema, req.query)));
  });
  return router;
}

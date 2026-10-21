import { Router } from "express";
import { retentionDeleteInputSchema, retentionKeepInputSchema, retentionQuerySchema } from "@prosolution/shared";
import { validate } from "../../lib/validate.ts";
import { requirePermission } from "../../middleware/auth.ts";
import { auditContext } from "../audit/audit.service.ts";
import type { RetentionService } from "./retention.service.ts";

/** Admin only. There is no scheduled or automatic deletion anywhere in the app. */
export function retentionRoutes(retention: RetentionService): Router {
  const router = Router();
  router.use(...requirePermission("retention:manage"));

  router.get("/eligible", async (req, res) => {
    const { page, pageSize } = validate(retentionQuerySchema, req.query);
    res.json(await retention.listEligible(page, pageSize));
  });

  router.post("/keep", async (req, res) => {
    const { leadIds } = validate(retentionKeepInputSchema, req.body);
    res.json(await retention.keep(leadIds, auditContext(req)));
  });

  router.post("/delete", async (req, res) => {
    const { leadIds, confirmation } = validate(retentionDeleteInputSchema, req.body);
    res.json(await retention.delete(leadIds, confirmation, auditContext(req)));
  });

  return router;
}

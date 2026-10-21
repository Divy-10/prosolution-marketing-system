import { Router, type Request } from "express";
import { z } from "zod";
import {
  assignLeadInputSchema,
  checkDuplicatesInputSchema,
  createLeadInputSchema,
  doNotContactInputSchema,
  listLeadsQuerySchema,
  recordContactInputSchema,
  reviewLeadInputSchema,
  updateLeadInputSchema,
} from "@prosolution/shared";
import { validate } from "../../lib/validate.ts";
import { requirePermission } from "../../middleware/auth.ts";
import { auditContext } from "../audit/audit.service.ts";
import type { Actor, LeadsService } from "./leads.service.ts";

const idParam = z.object({ id: z.string().min(1).max(50) });

function actor(req: Request): Actor {
  return { user: req.auth!.user, meta: auditContext(req) };
}

/**
 * Read: every role (sales users only see leads assigned to them).
 * Write: admins and sales managers. Removing a do-not-contact mark: admins only (checked in the service).
 */
export function leadsRoutes(leads: LeadsService): Router {
  const router = Router();
  const read = requirePermission("leads:read");
  const manage = requirePermission("leads:manage");

  router.get("/", ...read, async (req, res) => {
    res.json(await leads.list(validate(listLeadsQuerySchema, req.query), req.auth!.user));
  });
  router.get("/assignees", ...manage, async (_req, res) => {
    res.json({ data: await leads.assignees() });
  });
  router.post("/check-duplicates", ...manage, async (req, res) => {
    res.json(await leads.checkDuplicates(validate(checkDuplicatesInputSchema, req.body)));
  });
  router.post("/", ...manage, async (req, res) => {
    res.status(201).json(await leads.create(validate(createLeadInputSchema, req.body), actor(req)));
  });
  router.get("/:id", ...read, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json(await leads.get(id, req.auth!.user));
  });
  router.get("/:id/history", ...read, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json({ data: await leads.history(id, req.auth!.user) });
  });
  router.patch("/:id", ...manage, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json(await leads.update(id, validate(updateLeadInputSchema, req.body), actor(req)));
  });
  router.post("/:id/review", ...manage, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json(await leads.review(id, validate(reviewLeadInputSchema, req.body), actor(req)));
  });
  router.post("/:id/assign", ...manage, async (req, res) => {
    const { id } = validate(idParam, req.params);
    const { userId } = validate(assignLeadInputSchema, req.body);
    res.json(await leads.assign(id, userId, actor(req)));
  });
  router.post("/:id/verify-details", ...manage, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json(await leads.verifyDetails(id, actor(req)));
  });
  router.post("/:id/do-not-contact", ...manage, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json(await leads.setDoNotContact(id, validate(doNotContactInputSchema, req.body), actor(req)));
  });
  router.post("/:id/record-contact", ...manage, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json(await leads.recordContact(id, validate(recordContactInputSchema, req.body), actor(req)));
  });

  return router;
}

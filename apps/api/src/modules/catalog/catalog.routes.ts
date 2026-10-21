import { Router } from "express";
import { z } from "zod";
import {
  catalogQuerySchema,
  createAreaInputSchema,
  createIndustryInputSchema,
  createServiceInputSchema,
  updateAreaInputSchema,
  updateIndustryInputSchema,
  updateServiceInputSchema,
} from "@prosolution/shared";
import { validate } from "../../lib/validate.ts";
import { requirePermission } from "../../middleware/auth.ts";
import { auditContext } from "../audit/audit.service.ts";
import type { IndustriesService, LocationsService, ServicesService } from "./catalog.service.ts";

const idParam = z.object({ id: z.string().min(1).max(50) });

/** Everyone signed in can read the catalogue (it fills forms); only admins change it. No delete: disable instead. */
export function catalogRoutes(services: ServicesService, industries: IndustriesService, locations: LocationsService): Router {
  const router = Router();
  const read = requirePermission("settings:read");
  const manage = requirePermission("knowledge:manage");

  router.get("/services", ...read, async (req, res) => {
    res.json(await services.list(validate(catalogQuerySchema, req.query)));
  });
  router.post("/services", ...manage, async (req, res) => {
    res.status(201).json(await services.create(validate(createServiceInputSchema, req.body), auditContext(req)));
  });
  router.patch("/services/:id", ...manage, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json(await services.update(id, validate(updateServiceInputSchema, req.body), auditContext(req)));
  });

  router.get("/industries", ...read, async (req, res) => {
    res.json(await industries.list(validate(catalogQuerySchema, req.query)));
  });
  router.post("/industries", ...manage, async (req, res) => {
    res.status(201).json(await industries.create(validate(createIndustryInputSchema, req.body), auditContext(req)));
  });
  router.patch("/industries/:id", ...manage, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json(await industries.update(id, validate(updateIndustryInputSchema, req.body), auditContext(req)));
  });

  router.get("/cities", ...read, async (_req, res) => {
    res.json(await locations.listCities());
  });
  router.get("/areas", ...read, async (req, res) => {
    res.json(await locations.listAreas(validate(catalogQuerySchema, req.query)));
  });
  router.post("/areas", ...manage, async (req, res) => {
    res.status(201).json(await locations.createArea(validate(createAreaInputSchema, req.body), auditContext(req)));
  });
  router.patch("/areas/:id", ...manage, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json(await locations.updateArea(id, validate(updateAreaInputSchema, req.body), auditContext(req)));
  });

  return router;
}

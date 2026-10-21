import { Router } from "express";
import { companyProfileInputSchema, systemSettingsInputSchema } from "@prosolution/shared";
import { validate } from "../../lib/validate.ts";
import { requirePermission } from "../../middleware/auth.ts";
import { auditContext } from "../audit/audit.service.ts";
import type { SettingsService } from "./settings.service.ts";

export function settingsRoutes(settings: SettingsService): Router {
  const router = Router();

  router.get("/company-profile", ...requirePermission("settings:read"), async (_req, res) => {
    res.json(await settings.getCompanyProfile());
  });

  router.put("/company-profile", ...requirePermission("settings:manage"), async (req, res) => {
    const input = validate(companyProfileInputSchema, req.body);
    res.json(await settings.updateCompanyProfile(input, auditContext(req)));
  });

  router.get("/system", ...requirePermission("settings:read"), async (_req, res) => {
    res.json(await settings.getSystemSettings());
  });

  router.patch("/system", ...requirePermission("settings:manage"), async (req, res) => {
    const input = validate(systemSettingsInputSchema, req.body);
    res.json(await settings.updateSystemSettings(input, auditContext(req)));
  });

  return router;
}

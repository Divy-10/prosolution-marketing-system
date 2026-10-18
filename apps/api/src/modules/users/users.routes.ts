import { Router } from "express";
import {
  createUserInputSchema,
  listUsersQuerySchema,
  resetPasswordInputSchema,
  updateUserInputSchema,
} from "@prosolution/shared";
import { z } from "zod";
import { validate } from "../../lib/validate.ts";
import { requirePermission } from "../../middleware/auth.ts";
import { auditContext } from "../audit/audit.service.ts";
import type { UsersService } from "./users.service.ts";

const idParam = z.object({ id: z.string().min(1).max(50) });

export function usersRoutes(users: UsersService): Router {
  const router = Router();
  router.use(...requirePermission("users:manage"));

  router.get("/", async (req, res) => {
    res.json(await users.list(validate(listUsersQuerySchema, req.query)));
  });

  router.post("/", async (req, res) => {
    const input = validate(createUserInputSchema, req.body);
    res.status(201).json(await users.create(input, auditContext(req)));
  });

  router.get("/:id", async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json(await users.get(id));
  });

  router.patch("/:id", async (req, res) => {
    const { id } = validate(idParam, req.params);
    const input = validate(updateUserInputSchema, req.body);
    res.json(await users.update(id, input, auditContext(req)));
  });

  router.post("/:id/reset-password", async (req, res) => {
    const { id } = validate(idParam, req.params);
    const input = validate(resetPasswordInputSchema, req.body);
    res.json(await users.resetPassword(id, input, auditContext(req)));
  });

  return router;
}

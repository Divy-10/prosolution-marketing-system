import { Router, type Request } from "express";
import { changePasswordInputSchema, loginInputSchema, type SessionInfoDto } from "@prosolution/shared";
import type { User } from "@prosolution/db";
import type { AppConfig } from "../../config/env.ts";
import { validate } from "../../lib/validate.ts";
import { clearSessionCookie, requireAuth, setSessionCookie } from "../../middleware/auth.ts";
import { loginRateLimit } from "../../middleware/rate-limit.ts";
import { auditContext } from "../audit/audit.service.ts";
import { toUserDto } from "../users/user.mapper.ts";
import type { AuthService } from "./auth.service.ts";

function requestMeta(req: Request) {
  const { ip, userAgent, requestId } = auditContext(req);
  return { ip, userAgent, requestId };
}

export function authRoutes(config: AppConfig, auth: AuthService): Router {
  const router = Router();

  const sessionInfo = (user: User, csrfToken: string): SessionInfoDto => ({
    user: toUserDto(user),
    csrfToken,
    config: { humanApprovalRequired: config.humanApprovalRequired, environment: config.env },
  });

  router.post("/login", loginRateLimit(config), async (req, res) => {
    const input = validate(loginInputSchema, req.body);
    // Rotate: any session the browser already had is discarded.
    if (req.auth) await auth.logout(req.auth.session.id, req.auth.user.id, requestMeta(req));
    const { token, session, user } = await auth.login(input, requestMeta(req));
    setSessionCookie(res, config, token);
    res.json(sessionInfo(user, session.csrfToken));
  });

  router.get("/me", requireAuth({ allowPendingPasswordChange: true }), (req, res) => {
    const { user, session } = req.auth!;
    res.json(sessionInfo(user, session.csrfToken));
  });

  router.post("/logout", requireAuth({ allowPendingPasswordChange: true }), async (req, res) => {
    await auth.logout(req.auth!.session.id, req.auth!.user.id, requestMeta(req));
    clearSessionCookie(res, config);
    res.status(204).end();
  });

  router.post("/logout-all", requireAuth({ allowPendingPasswordChange: true }), async (req, res) => {
    await auth.logoutAll(req.auth!.user.id, requestMeta(req));
    clearSessionCookie(res, config);
    res.status(204).end();
  });

  router.post("/change-password", requireAuth({ allowPendingPasswordChange: true }), async (req, res) => {
    const input = validate(changePasswordInputSchema, req.body);
    const { user, session } = req.auth!;
    const updated = await auth.changePassword(user, session.id, input, requestMeta(req));
    res.json(sessionInfo(updated, session.csrfToken));
  });

  return router;
}

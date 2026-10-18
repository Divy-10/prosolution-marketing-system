import type { NextFunction, Request, RequestHandler, Response } from "express";
import { can, type Permission } from "@prosolution/shared";
import type { AppConfig } from "../config/env.ts";
import { errors } from "../lib/errors.ts";
import type { SessionService } from "../modules/auth/session.service.ts";

/** Reads the session cookie (if any) and attaches req.auth. Never rejects on its own. */
export function loadSession(config: AppConfig, sessions: SessionService): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token: unknown = req.cookies?.[config.session.cookieName];
    if (typeof token !== "string" || token.length < 20 || token.length > 200) return next();
    const resolved = await sessions.resolve(token);
    if (resolved) req.auth = resolved;
    else clearSessionCookie(res, config);
    next();
  };
}

export function setSessionCookie(res: Response, config: AppConfig, token: string): void {
  res.cookie(config.session.cookieName, token, {
    httpOnly: true,
    secure: config.session.cookieSecure,
    sameSite: "strict",
    path: "/",
    maxAge: config.session.absoluteMs,
  });
}

export function clearSessionCookie(res: Response, config: AppConfig): void {
  res.clearCookie(config.session.cookieName, {
    httpOnly: true,
    secure: config.session.cookieSecure,
    sameSite: "strict",
    path: "/",
  });
}

interface RequireAuthOptions {
  /** Allow users who still have to change their password (only for /me, change-password, logout). */
  allowPendingPasswordChange?: boolean;
}

export function requireAuth(options: RequireAuthOptions = {}): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(errors.unauthenticated());
    if (req.auth.user.mustChangePassword && !options.allowPendingPasswordChange) {
      return next(errors.passwordChangeRequired());
    }
    next();
  };
}

/** Requires a signed-in user whose role grants the permission (see packages/shared/src/roles.ts). */
export function requirePermission(permission: Permission): RequestHandler[] {
  return [
    requireAuth(),
    (req, _res, next) => {
      if (!can(req.auth?.user.role, permission)) return next(errors.forbidden());
      next();
    },
  ];
}

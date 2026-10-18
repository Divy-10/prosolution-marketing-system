import type { NextFunction, Request, RequestHandler, Response } from "express";
import helmet from "helmet";
import type { AppConfig } from "../config/env.ts";
import { safeEqual } from "../lib/crypto.ts";
import { errors } from "../lib/errors.ts";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Security headers for a JSON API: nothing may be framed, scripted or sniffed. */
export function securityHeaders(): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { "default-src": ["'none'"], "frame-ancestors": ["'none'"], "base-uri": ["'none'"] },
    },
    crossOriginResourcePolicy: { policy: "same-origin" },
    referrerPolicy: { policy: "no-referrer" },
    frameguard: { action: "deny" },
  });
}

/**
 * Blocks state-changing requests that a browser sends from another site.
 * Browsers always send Origin (or Sec-Fetch-Site) on such requests; non-browser
 * clients send neither and can't carry a victim's cookies anyway.
 */
export function originCheck(config: AppConfig): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.get("origin");
    if (origin && origin !== config.appOrigin) return next(errors.forbidden("Request blocked: it came from another website."));
    const site = req.get("sec-fetch-site");
    if (!origin && site === "cross-site") return next(errors.forbidden("Request blocked: it came from another website."));
    next();
  };
}

/**
 * Double-submit check: state-changing requests with a session must echo the session's CSRF token.
 * Sign-in is exempt (there is no token yet); it relies on the origin check and replaces any old session.
 */
export function csrfProtection(exemptPaths: string[] = ["/auth/login"]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method) || !req.auth || exemptPaths.includes(req.path)) return next();
    const sent = req.get("x-csrf-token");
    if (!sent || !safeEqual(sent, req.auth.session.csrfToken)) return next(errors.csrf());
    next();
  };
}

/** API responses contain personal and session data: never cache them. */
export function noStore(): RequestHandler {
  return (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  };
}

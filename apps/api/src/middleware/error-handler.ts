import type { ErrorRequestHandler, RequestHandler } from "express";
import type { ApiErrorBody } from "@prosolution/shared";
import type { Logger } from "pino";
import { AppError } from "../lib/errors.ts";

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, "NOT_FOUND", `No API route for ${req.method} ${req.path}.`));
};

/** Converts every error into the standard JSON shape. Internal details go to the log only. */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, req, res, _next) => {
    const requestId = String(req.id ?? "") || undefined;
    let appError: AppError;

    if (err instanceof AppError) {
      appError = err;
    } else if (isBodyParserError(err)) {
      appError =
        err.type === "entity.too.large"
          ? new AppError(413, "VALIDATION_FAILED", "The request is too large.")
          : new AppError(400, "VALIDATION_FAILED", "The request body isn't valid JSON.");
    } else if (isPrismaCode(err, "P2002") || dbErrorKind(err) === "UniqueConstraintViolation") {
      appError = new AppError(409, "CONFLICT", "That record already exists.");
    } else if (isPrismaCode(err, "P2034") || dbErrorKind(err) === "TransactionWriteConflict") {
      appError = new AppError(409, "CONFLICT", "Someone else changed this at the same time. Try again.");
    } else {
      logger.error({ err, requestId, method: req.method, path: req.path }, "Unhandled error");
      appError = new AppError(500, "INTERNAL_ERROR", "Something went wrong on our side. Try again, and quote this ID if it keeps happening.");
    }

    if (appError.status >= 500 && err instanceof AppError) {
      logger.error({ err, requestId }, appError.message);
    }

    const body: ApiErrorBody = {
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.details ? { details: appError.details } : {}),
        ...(requestId ? { requestId } : {}),
      },
    };
    res.status(appError.status).json(body);
  };
}

function isBodyParserError(err: unknown): err is { type: string; status: number } {
  return typeof err === "object" && err !== null && "type" in err && typeof (err as { type: unknown }).type === "string" &&
    String((err as { type: string }).type).startsWith("entity.");
}

/** Driver-adapter errors (Prisma 7) carry the database error kind in `cause`. */
function dbErrorKind(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || (err as { name?: unknown }).name !== "DriverAdapterError") return undefined;
  const cause = (err as { cause?: { kind?: unknown } }).cause;
  return typeof cause?.kind === "string" ? cause.kind : undefined;
}

function isPrismaCode(err: unknown, code: string): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === code;
}

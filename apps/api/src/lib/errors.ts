import type { ApiErrorBody, ErrorCode } from "@prosolution/shared";

/** Extra, safe-to-show fields some errors carry (e.g. duplicate matches). */
export type ErrorExtra = Pick<ApiErrorBody["error"], "duplicates" | "ineligibleLeadIds">;

/** An error that is safe to show to the user. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, string[]>,
    public readonly extra?: ErrorExtra,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const errors = {
  unauthenticated: (message = "Sign in to continue.") => new AppError(401, "UNAUTHENTICATED", message),
  forbidden: (message = "You don't have permission to do this.") => new AppError(403, "FORBIDDEN", message),
  notFound: (what = "Resource") => new AppError(404, "NOT_FOUND", `${what} not found.`),
  conflict: (message: string) => new AppError(409, "CONFLICT", message),
  invalidCredentials: () => new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect."),
  accountLocked: (minutes: number) =>
    new AppError(
      423,
      "ACCOUNT_LOCKED",
      `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or ask an admin to reset your password.`,
    ),
  passwordChangeRequired: () =>
    new AppError(403, "PASSWORD_CHANGE_REQUIRED", "Set a new password before continuing."),
  csrf: () => new AppError(403, "CSRF_FAILED", "Your session token is missing or out of date. Reload the page and try again."),
  validation: (message: string, details?: Record<string, string[]>) =>
    new AppError(400, "VALIDATION_FAILED", message, details),
};

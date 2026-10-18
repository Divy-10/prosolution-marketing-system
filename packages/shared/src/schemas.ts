import { z } from "zod";
import { ROLES } from "./roles.ts";

/** Password policy: long passphrases beat complexity rules (NIST SP 800-63B). */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`)
  .refine((v) => v.trim().length === v.length, "Remove spaces at the start or end.")
  .refine((v) => new Set(v).size >= 5, "Use a less repetitive password.");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email("Enter a valid email address."));

export const nameSchema = z.string().trim().min(1, "Enter a name.").max(100);

export const roleSchema = z.enum(ROLES);

// ── Auth ────────────────────────────────────────────────────────────────────
export const loginInputSchema = z.object({
  email: emailSchema,
  // Don't apply the full policy on login: old passwords must still work.
  password: z.string().min(1, "Enter your password.").max(PASSWORD_MAX_LENGTH),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const changePasswordInputSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(PASSWORD_MAX_LENGTH),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "Choose a password different from your current one.",
    path: ["newPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;

// ── Users ───────────────────────────────────────────────────────────────────
export const createUserInputSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  role: roleSchema,
  temporaryPassword: passwordSchema,
});
export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const updateUserInputSchema = z
  .object({
    name: nameSchema.optional(),
    role: roleSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update.");
export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;

export const resetPasswordInputSchema = z.object({
  temporaryPassword: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;

// ── Pagination ──────────────────────────────────────────────────────────────
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const listUsersQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  role: roleSchema.optional(),
  status: z.enum(["active", "inactive", "all"]).default("all"),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const listAuditQuerySchema = paginationQuerySchema.extend({
  action: z.string().trim().max(100).optional(),
  actorId: z.string().trim().max(50).optional(),
  entityType: z.string().trim().max(50).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;

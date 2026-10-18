import type { Role } from "./roles.ts";

/** Every error response from the API has this shape. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, string[]>;
    requestId?: string;
  };
}

export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "PASSWORD_CHANGE_REQUIRED",
  "CSRF_FAILED",
  "NOT_FOUND",
  "CONFLICT",
  "INVALID_CREDENTIALS",
  "ACCOUNT_LOCKED",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface SessionInfoDto {
  user: UserDto;
  csrfToken: string;
  /** Server-side config the UI needs to show. Never contains secrets. */
  config: {
    humanApprovalRequired: boolean;
    environment: "development" | "test" | "production";
  };
}

export interface AuditLogDto {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: { id: string; name: string; email: string } | null;
  leadId: string | null;
  campaignId: string | null;
  previousStatus: string | null;
  newStatus: string | null;
  meta: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

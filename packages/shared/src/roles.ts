/**
 * Roles and permissions — the single source of truth for both API and web.
 * The API enforces these; the web app only uses them to hide things a user
 * can't do anyway.
 */

export const ROLES = ["ADMIN", "SALES_MANAGER", "SALES_USER", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  SALES_MANAGER: "Sales manager",
  SALES_USER: "Sales user",
  VIEWER: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: "Everything, including users, integrations, AI configuration and the audit log.",
  SALES_MANAGER: "Campaigns, leads, message approvals and analytics.",
  SALES_USER: "Their assigned leads and conversations.",
  VIEWER: "Read-only access.",
};

/**
 * Permission keys. New phases add keys here; each maps to the roles allowed.
 * Ownership rules (e.g. a sales user only sees assigned leads) are enforced
 * separately in the API services.
 */
export const PERMISSIONS = {
  "users:manage": ["ADMIN"],
  "audit:read": ["ADMIN"],
  "settings:read": ["ADMIN", "SALES_MANAGER", "SALES_USER", "VIEWER"],
  "settings:manage": ["ADMIN"],
  "integrations:manage": ["ADMIN"],
  "prompts:manage": ["ADMIN"],
  "campaigns:read": ["ADMIN", "SALES_MANAGER", "SALES_USER", "VIEWER"],
  "campaigns:manage": ["ADMIN", "SALES_MANAGER"],
  // Services, industries and areas: admins only (Phase 2 decision).
  "knowledge:manage": ["ADMIN"],
  "leads:read": ["ADMIN", "SALES_MANAGER", "SALES_USER", "VIEWER"],
  "leads:manage": ["ADMIN", "SALES_MANAGER"],
  "leads:work_assigned": ["ADMIN", "SALES_MANAGER", "SALES_USER"],
  "approvals:decide": ["ADMIN", "SALES_MANAGER"],
  "retention:manage": ["ADMIN"],
  "analytics:read": ["ADMIN", "SALES_MANAGER", "SALES_USER", "VIEWER"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

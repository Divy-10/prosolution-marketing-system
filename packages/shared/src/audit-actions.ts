/** Audit actions and their human-readable descriptions for the audit log UI. */
export const AUDIT_ACTIONS = {
  "auth.login_succeeded": "Signed in",
  "auth.login_failed": "Failed sign-in attempt",
  "auth.account_locked": "Account locked after failed sign-ins",
  "auth.logout": "Signed out",
  "auth.logout_all": "Signed out of all sessions",
  "auth.password_changed": "Changed password",
  "user.created": "Created user",
  "user.updated": "Updated user",
  "user.role_changed": "Changed user role",
  "user.deactivated": "Deactivated user",
  "user.reactivated": "Reactivated user",
  "user.password_reset": "Reset user password",
  "system.admin_seeded": "Created first admin from the command line",
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export function describeAuditAction(action: string): string {
  return (AUDIT_ACTIONS as Record<string, string>)[action] ?? action;
}

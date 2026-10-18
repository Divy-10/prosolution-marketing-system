import { describe, expect, it } from "vitest";
import {
  ROLES,
  PERMISSIONS,
  can,
  passwordSchema,
  loginInputSchema,
  changePasswordInputSchema,
  updateUserInputSchema,
} from "./index.ts";

describe("RBAC permissions", () => {
  it("gives ADMIN every permission", () => {
    for (const permission of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) {
      expect(can("ADMIN", permission)).toBe(true);
    }
  });

  it("keeps user management and audit log admin-only", () => {
    for (const role of ROLES.filter((r) => r !== "ADMIN")) {
      expect(can(role, "users:manage")).toBe(false);
      expect(can(role, "audit:read")).toBe(false);
      expect(can(role, "integrations:manage")).toBe(false);
    }
  });

  it("lets only admins and managers decide approvals", () => {
    expect(can("SALES_MANAGER", "approvals:decide")).toBe(true);
    expect(can("SALES_USER", "approvals:decide")).toBe(false);
    expect(can("VIEWER", "approvals:decide")).toBe(false);
  });

  it("gives VIEWER no write permission", () => {
    const writes = Object.keys(PERMISSIONS).filter((p) => !p.endsWith(":read"));
    for (const p of writes) expect(can("VIEWER", p as keyof typeof PERMISSIONS)).toBe(false);
  });

  it("denies when there is no role", () => {
    expect(can(null, "leads:read")).toBe(false);
    expect(can(undefined, "leads:read")).toBe(false);
  });
});

describe("password policy", () => {
  it("accepts a long passphrase", () => {
    expect(passwordSchema.safeParse("surat cafe reels 2026").success).toBe(true);
  });
  it("rejects short passwords", () => {
    expect(passwordSchema.safeParse("short1!").success).toBe(false);
  });
  it("rejects highly repetitive passwords", () => {
    expect(passwordSchema.safeParse("aaaaaaaaaaaaaaaa").success).toBe(false);
  });
  it("rejects leading/trailing spaces", () => {
    expect(passwordSchema.safeParse("  surat cafe reels").success).toBe(false);
  });
});

describe("input schemas", () => {
  it("normalises login email", () => {
    const r = loginInputSchema.parse({ email: "  Owner@ProSolution.TEST ", password: "x" });
    expect(r.email).toBe("owner@prosolution.test");
  });
  it("requires the new password to differ", () => {
    const r = changePasswordInputSchema.safeParse({
      currentPassword: "surat cafe reels 2026",
      newPassword: "surat cafe reels 2026",
    });
    expect(r.success).toBe(false);
  });
  it("rejects empty user updates", () => {
    expect(updateUserInputSchema.safeParse({}).success).toBe(false);
  });
});

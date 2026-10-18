import { describe, expect, it } from "vitest";
import { visibleNav, NAV } from "./navigation.ts";

const labels = (role: Parameters<typeof visibleNav>[0]) => visibleNav(role).flatMap((g) => g.items.map((i) => i.label));

describe("navigation by role", () => {
  it("shows admins user management and the audit log", () => {
    expect(labels("ADMIN")).toEqual(expect.arrayContaining(["Users", "Audit log", "Instagram connection", "AI configuration"]));
  });

  it("hides admin-only screens from everyone else", () => {
    for (const role of ["SALES_MANAGER", "SALES_USER", "VIEWER"] as const) {
      expect(labels(role)).not.toContain("Users");
      expect(labels(role)).not.toContain("Audit log");
      expect(labels(role)).not.toContain("Instagram connection");
    }
  });

  it("shows approvals to managers but not to sales users or viewers", () => {
    expect(labels("SALES_MANAGER")).toContain("Approvals");
    expect(labels("SALES_USER")).not.toContain("Approvals");
    expect(labels("VIEWER")).not.toContain("Approvals");
  });

  it("labels every unbuilt screen with its phase and a summary", () => {
    for (const item of NAV.flatMap((g) => g.items)) {
      if (item.phase !== undefined) expect(item.summary).toBeTruthy();
    }
  });
});

import { describe, expect, it } from "vitest";
import { visibleNav, PLANNED_ITEMS } from "./navigation.ts";

const labels = (role: Parameters<typeof visibleNav>[0]) => visibleNav(role).flatMap((g) => g.items.map((i) => i.label));

describe("Phase 2 navigation", () => {
  it("shows the service profile, services, target market and leads to every role", () => {
    for (const role of ["ADMIN", "SALES_MANAGER", "SALES_USER", "VIEWER"] as const) {
      expect(labels(role)).toEqual(expect.arrayContaining(["Service profile", "Services", "Target market", "Leads"]));
    }
  });
  it("shows data retention to admins only", () => {
    expect(labels("ADMIN")).toContain("Data retention");
    for (const role of ["SALES_MANAGER", "SALES_USER", "VIEWER"] as const) expect(labels(role)).not.toContain("Data retention");
  });
  it("no longer lists leads or services as a future phase", () => {
    const planned = PLANNED_ITEMS.map((i) => i.path);
    expect(planned).not.toContain("/leads");
    expect(planned).not.toContain("/services");
  });
});

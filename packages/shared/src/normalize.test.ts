import { describe, expect, it } from "vitest";
import {
  businessNameKey,
  can,
  createLeadInputSchema,
  labelKey,
  leadIdentifiers,
  normalizeEmail,
  normalizeInstagramHandle,
  normalizePhone,
  retentionConfirmationPhrase,
  reviewLeadInputSchema,
  systemSettingsInputSchema,
  websiteIdentifier,
} from "./index.ts";

describe("label and business-name keys", () => {
  it("treats case, accents, '&' and spacing as equal", () => {
    expect(labelKey("Cafés & Restaurants")).toBe("cafes and restaurants");
    expect(labelKey("  cafes  AND restaurants ")).toBe("cafes and restaurants");
  });
  it("ignores legal suffixes and punctuation in business names", () => {
    expect(businessNameKey("The ABC Café Pvt. Ltd.")).toBe(businessNameKey("abc cafe"));
    expect(businessNameKey("Brew-Lab")).toBe("brew lab");
  });
  it("keeps genuinely different names different", () => {
    expect(businessNameKey("ABC Cafe Vesu")).not.toBe(businessNameKey("ABC Cafe"));
  });
});

describe("website identifiers", () => {
  it.each([
    ["abc.com", "abc.com"],
    ["https://www.ABC.com/menu?x=1", "abc.com"],
    ["http://abc.co.in:8080/", "abc.co.in"],
    ["shop.abc.com", "shop.abc.com"],
  ])("%s → %s", (input, expected) => {
    expect(websiteIdentifier(input)).toBe(expected);
  });
  it("ignores hosts shared by unrelated businesses", () => {
    for (const url of ["https://instagram.com/abc", "linktr.ee/abc", "https://wa.me/919876543210", "https://maps.app.goo.gl/x", "abc.business.site"]) {
      expect(websiteIdentifier(url)).toBeNull();
    }
  });
  it("rejects things that aren't web addresses", () => {
    expect(websiteIdentifier("not a site")).toBeNull();
    expect(websiteIdentifier("ftp://abc.com")).toBeNull();
    expect(websiteIdentifier("")).toBeNull();
  });
});

describe("Indian phone numbers", () => {
  it.each([
    ["98765 43210", "+919876543210"],
    ["+91 98765-43210", "+919876543210"],
    ["09876543210", "+919876543210"],
    ["0091 9876543210", "+919876543210"],
    ["919876543210", "+919876543210"],
    ["0261 2345678", "+912612345678"],
    ["(0261) 234-5678", "+912612345678"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
  it("keeps other countries' numbers written with +", () => {
    expect(normalizePhone("+1 415 555 0100")).toBe("+14155550100");
  });
  it("rejects numbers that can't be identified confidently", () => {
    for (const bad of ["2345678", "12345", "abc123", "1800 123 4567", ""]) expect(normalizePhone(bad)).toBeNull();
  });
});

describe("email and Instagram", () => {
  it("normalises emails", () => {
    expect(normalizeEmail("  Hello@ABC.com ")).toBe("hello@abc.com");
    expect(normalizeEmail("nope")).toBeNull();
  });
  it.each([
    ["@ABC_Cafe", "abc_cafe"],
    ["abc.cafe", "abc.cafe"],
    ["https://www.instagram.com/abc_cafe/?hl=en", "abc_cafe"],
    ["instagram.com/abc_cafe", "abc_cafe"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeInstagramHandle(input)).toBe(expected);
  });
  it("rejects post links and invalid handles", () => {
    for (const bad of ["https://instagram.com/p/Cxyz", "has space", "a..b", "https://facebook.com/abc"]) {
      expect(normalizeInstagramHandle(bad)).toBeNull();
    }
  });
  it("collects every usable identifier and skips shared hosts", () => {
    expect(
      leadIdentifiers({ website: "linktr.ee/abc", publicPhone: "98765 43210", publicEmail: "A@abc.com", instagramHandle: "@abc" }),
    ).toEqual([
      { type: "PHONE", value: "+919876543210" },
      { type: "EMAIL", value: "a@abc.com" },
      { type: "INSTAGRAM", value: "abc" },
    ]);
  });
});

describe("Phase 2 input rules", () => {
  it("requires a reason to reject a lead", () => {
    expect(reviewLeadInputSchema.safeParse({ decision: "REJECT" }).success).toBe(false);
    expect(reviewLeadInputSchema.safeParse({ decision: "REJECT", note: "Closed down" }).success).toBe(true);
    expect(reviewLeadInputSchema.safeParse({ decision: "APPROVE" }).success).toBe(true);
  });
  it("keeps the retention threshold within 30–3650 days", () => {
    expect(systemSettingsInputSchema.safeParse({ leadRetentionDays: 29 }).success).toBe(false);
    expect(systemSettingsInputSchema.safeParse({ leadRetentionDays: 180 }).success).toBe(true);
    expect(systemSettingsInputSchema.safeParse({ leadRetentionDays: 4000 }).success).toBe(false);
  });
  it("validates lead contact details and turns blanks into null", () => {
    const ok = createLeadInputSchema.parse({ businessName: " ABC Cafe ", source: "MANUAL_RESEARCH", website: "", publicPhone: "98765 43210" });
    expect(ok.businessName).toBe("ABC Cafe");
    expect(ok.website).toBeNull();
    const bad = createLeadInputSchema.safeParse({ businessName: "ABC", source: "MANUAL_RESEARCH", publicPhone: "12345" });
    expect(bad.success).toBe(false);
  });
  it("builds the exact retention confirmation phrase", () => {
    expect(retentionConfirmationPhrase(1)).toBe("DELETE 1 LEAD");
    expect(retentionConfirmationPhrase(3)).toBe("DELETE 3 LEADS");
  });
  it("limits configuration and retention to admins", () => {
    expect(can("ADMIN", "knowledge:manage")).toBe(true);
    expect(can("SALES_MANAGER", "knowledge:manage")).toBe(false);
    expect(can("ADMIN", "retention:manage")).toBe(true);
    for (const r of ["SALES_MANAGER", "SALES_USER", "VIEWER"] as const) expect(can(r, "retention:manage")).toBe(false);
    for (const r of ["ADMIN", "SALES_MANAGER", "SALES_USER", "VIEWER"] as const) expect(can(r, "settings:read")).toBe(true);
  });
});

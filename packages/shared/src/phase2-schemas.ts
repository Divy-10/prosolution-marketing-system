import { z } from "zod";
import { normalizeEmail, normalizeInstagramHandle, normalizePhone, normalizeWebsiteHost } from "./normalize.ts";
import { paginationQuerySchema } from "./schemas.ts";

/** Optional free text: trimmed, "" becomes null. */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();
}

const requiredText = (label: string, max: number) =>
  z.string().trim().min(1, `Enter ${label}.`).max(max, `Use at most ${max} characters.`);

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional()
  .refine((v) => v == null || normalizeWebsiteHost(v) !== null, "Enter a web address like abc.com or https://abc.com.");

const optionalPhone = z
  .string()
  .trim()
  .max(40)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional()
  .refine(
    (v) => v == null || normalizePhone(v) !== null,
    "Enter a 10-digit mobile number, or a landline with its STD code (e.g. 0261 2345678).",
  );

const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional()
  .refine((v) => v == null || normalizeEmail(v) !== null, "Enter a valid email address.");

const optionalInstagram = z
  .string()
  .trim()
  .max(200)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional()
  .refine((v) => v == null || normalizeInstagramHandle(v) !== null, "Enter an Instagram username like @abc_cafe or a profile link.");

const id = z.string().trim().min(1).max(50);
const sortOrder = z.coerce.number().int().min(0).max(10_000);

// ── Company profile & settings ──────────────────────────────────────────────
export const companyProfileInputSchema = z.object({
  companyName: requiredText("the company name", 120),
  tagline: optionalText(160),
  description: optionalText(4000),
  city: requiredText("the city", 80),
  publicEmail: optionalEmail,
  publicPhone: optionalPhone,
  instagramHandle: optionalInstagram,
  website: optionalUrl,
  qualificationNotes: optionalText(4000),
  requireOnlinePresence: z.boolean(),
});
export type CompanyProfileInput = z.infer<typeof companyProfileInputSchema>;

export const DEFAULT_LEAD_RETENTION_DAYS = 180;
export const LEAD_RETENTION_MIN_DAYS = 30;
export const LEAD_RETENTION_MAX_DAYS = 3650;

export const systemSettingsInputSchema = z.object({
  leadRetentionDays: z.coerce
    .number()
    .int("Use whole days.")
    .min(LEAD_RETENTION_MIN_DAYS, `Use at least ${LEAD_RETENTION_MIN_DAYS} days.`)
    .max(LEAD_RETENTION_MAX_DAYS, `Use at most ${LEAD_RETENTION_MAX_DAYS} days.`),
});
export type SystemSettingsInput = z.infer<typeof systemSettingsInputSchema>;

// ── Services ────────────────────────────────────────────────────────────────
const serviceFields = {
  name: requiredText("a service name", 100),
  category: requiredText("a category", 60),
  description: requiredText("a description", 4000),
  idealCustomer: optionalText(2000),
  keyBenefits: z.array(z.string().trim().min(1).max(200)).max(12, "Use at most 12 benefits.").default([]),
  exampleOffer: optionalText(2000),
  cta: optionalText(300),
  restrictions: optionalText(2000),
  portfolioUrl: optionalUrl,
  sortOrder: sortOrder.optional(),
};
export const createServiceInputSchema = z.object(serviceFields);
export type CreateServiceInput = z.infer<typeof createServiceInputSchema>;
export const updateServiceInputSchema = z
  .object({ ...serviceFields, isActive: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update.");
export type UpdateServiceInput = z.infer<typeof updateServiceInputSchema>;

// ── Industries ──────────────────────────────────────────────────────────────
const industryFields = {
  name: requiredText("an industry name", 100),
  description: optionalText(2000),
  aiGuidance: optionalText(4000),
  serviceIds: z.array(id).max(50).optional(),
  sortOrder: sortOrder.optional(),
};
export const createIndustryInputSchema = z.object(industryFields);
export type CreateIndustryInput = z.infer<typeof createIndustryInputSchema>;
export const updateIndustryInputSchema = z
  .object({ ...industryFields, isActive: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update.");
export type UpdateIndustryInput = z.infer<typeof updateIndustryInputSchema>;

// ── Areas ───────────────────────────────────────────────────────────────────
export const createAreaInputSchema = z.object({
  cityId: id,
  name: requiredText("an area name", 80),
  sortOrder: sortOrder.optional(),
});
export type CreateAreaInput = z.infer<typeof createAreaInputSchema>;
export const updateAreaInputSchema = z
  .object({ name: requiredText("an area name", 80), isActive: z.boolean(), sortOrder })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update.");
export type UpdateAreaInput = z.infer<typeof updateAreaInputSchema>;

export const catalogQuerySchema = z.object({
  status: z.enum(["active", "inactive", "all"]).default("all"),
  q: z.string().trim().max(100).optional(),
  cityId: id.optional(),
});
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

// ── Leads ───────────────────────────────────────────────────────────────────
export const LEAD_SOURCES = ["MANUAL_RESEARCH", "REFERRAL", "INBOUND_ENQUIRY", "EXISTING_CONTACT", "OTHER"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];
export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  MANUAL_RESEARCH: "Found by our team (public info)",
  REFERRAL: "Referral",
  INBOUND_ENQUIRY: "They contacted us",
  EXISTING_CONTACT: "Existing contact",
  OTHER: "Other",
};

export const REVIEW_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export const CONTACT_STATUSES = ["NOT_CONTACTED", "CONTACTED"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

/** The three lead categories the UI shows. */
export const LEAD_VIEWS = ["candidates", "approved", "contacted", "rejected", "all"] as const;
export type LeadView = (typeof LEAD_VIEWS)[number];

const leadContactFields = {
  website: optionalUrl,
  instagramHandle: optionalInstagram,
  publicPhone: optionalPhone,
  publicEmail: optionalEmail,
};

const leadFields = {
  businessName: requiredText("the business name", 160),
  industryId: id.nullable().optional(),
  cityId: id.nullable().optional(),
  areaId: id.nullable().optional(),
  addressLine: optionalText(300),
  ...leadContactFields,
  source: z.enum(LEAD_SOURCES),
  sourceUrl: optionalUrl,
  sourceNote: optionalText(500),
  notes: optionalText(4000),
};

/** How the person creating/editing a lead answered the duplicate warnings. */
export const duplicateDecisionSchema = z
  .object({
    /** "This is a different business" for a same-name, same-area match with no shared contact details. */
    confirmDifferentBusiness: z.boolean().optional(),
    /** Admin only: approve shared contact details as a separate branch. */
    approveSharedIdentifiers: z.boolean().optional(),
    sharedIdentifierReason: optionalText(300),
  })
  .optional();

export const createLeadInputSchema = z.object({ ...leadFields, duplicates: duplicateDecisionSchema });
export type CreateLeadInput = z.infer<typeof createLeadInputSchema>;

export const updateLeadInputSchema = z
  .object({ ...leadFields })
  .partial()
  .extend({ duplicates: duplicateDecisionSchema })
  .refine((v) => Object.keys(v).filter((k) => k !== "duplicates").length > 0, "Nothing to update.");
export type UpdateLeadInput = z.infer<typeof updateLeadInputSchema>;

export const checkDuplicatesInputSchema = z.object({
  businessName: z.string().trim().max(160).optional(),
  areaId: id.nullable().optional(),
  website: z.string().trim().max(500).nullable().optional(),
  instagramHandle: z.string().trim().max(200).nullable().optional(),
  publicPhone: z.string().trim().max(40).nullable().optional(),
  publicEmail: z.string().trim().max(254).nullable().optional(),
  excludeLeadId: id.optional(),
});
export type CheckDuplicatesInput = z.infer<typeof checkDuplicatesInputSchema>;

export const reviewLeadInputSchema = z
  .object({
    decision: z.enum(["APPROVE", "REJECT", "REOPEN"]),
    note: optionalText(1000),
  })
  .refine((v) => v.decision !== "REJECT" || (v.note && v.note.length > 0), {
    message: "Say why the lead is rejected.",
    path: ["note"],
  });
export type ReviewLeadInput = z.infer<typeof reviewLeadInputSchema>;

export const assignLeadInputSchema = z.object({ userId: id.nullable() });
export const doNotContactInputSchema = z.object({
  doNotContact: z.boolean(),
  reason: requiredText("a reason", 500),
});
export type DoNotContactInput = z.infer<typeof doNotContactInputSchema>;
export const recordContactInputSchema = z.object({
  contactedAt: z.coerce.date().refine((d) => d.getTime() <= Date.now() + 60_000, "The date can't be in the future."),
  note: requiredText("how and when they were contacted", 1000),
});
export type RecordContactInput = z.infer<typeof recordContactInputSchema>;

export const listLeadsQuerySchema = paginationQuerySchema.extend({
  view: z.enum(LEAD_VIEWS).default("candidates"),
  q: z.string().trim().max(100).optional(),
  industryId: id.optional(),
  areaId: id.optional(),
  assignedToId: z.union([id, z.literal("unassigned")]).optional(),
  doNotContact: z.enum(["only", "exclude"]).optional(),
});
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;

// ── Retention ───────────────────────────────────────────────────────────────
export const retentionQuerySchema = paginationQuerySchema;
const leadIdList = z.array(id).min(1, "Select at least one lead.").max(200, "Select at most 200 leads at a time.");
export const retentionKeepInputSchema = z.object({ leadIds: leadIdList });
export const retentionDeleteInputSchema = z.object({
  leadIds: leadIdList,
  /** Must be exactly "DELETE <n> LEADS" (or "DELETE 1 LEAD"), typed by the admin. */
  confirmation: z.string().trim().max(40),
});
export function retentionConfirmationPhrase(count: number): string {
  return count === 1 ? "DELETE 1 LEAD" : `DELETE ${count} LEADS`;
}

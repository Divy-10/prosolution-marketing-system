import type { Role } from "./roles.ts";
import type { IdentifierType } from "./normalize.ts";
import type { ContactStatus, LeadSource, ReviewStatus } from "./phase2-schemas.ts";

/** Every error response from the API has this shape. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, string[]>;
    requestId?: string;
    /** Present on duplicate-lead errors: what matched, so the UI can explain it. */
    duplicates?: DuplicateCheckDto;
    /** Present on retention errors: leads that are no longer eligible. */
    ineligibleLeadIds?: string[];
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
  "DUPLICATE_LEAD",
  "SHARED_IDENTIFIER",
  "POSSIBLE_DUPLICATE",
  "NOT_ELIGIBLE",
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

// ── Phase 2 ─────────────────────────────────────────────────────────────────

export interface CompanyProfileDto {
  companyName: string;
  tagline: string | null;
  description: string | null;
  city: string;
  publicEmail: string | null;
  publicPhone: string | null;
  instagramHandle: string | null;
  website: string | null;
  qualificationNotes: string | null;
  requireOnlinePresence: boolean;
  updatedAt: string | null;
}

export interface SystemSettingsDto {
  leadRetentionDays: number;
  updatedAt: string | null;
}

export interface ServiceDto {
  id: string;
  name: string;
  category: string;
  description: string;
  idealCustomer: string | null;
  keyBenefits: string[];
  exampleOffer: string | null;
  cta: string | null;
  restrictions: string | null;
  portfolioUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  industryIds: string[];
  updatedAt: string;
}

export interface IndustryDto {
  id: string;
  name: string;
  description: string | null;
  aiGuidance: string | null;
  isActive: boolean;
  sortOrder: number;
  serviceIds: string[];
  leadCount: number;
  updatedAt: string;
}

export interface CityDto {
  id: string;
  name: string;
  state: string;
  isActive: boolean;
  areaCount: number;
}

export interface AreaDto {
  id: string;
  cityId: string;
  cityName: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  leadCount: number;
}

export interface UserRefDto {
  id: string;
  name: string;
}

export interface LeadListItemDto {
  id: string;
  displayId: number;
  businessName: string;
  industry: { id: string; name: string } | null;
  area: { id: string; name: string } | null;
  city: { id: string; name: string } | null;
  reviewStatus: ReviewStatus;
  contactStatus: ContactStatus;
  doNotContact: boolean;
  detailsVerified: boolean;
  hasSharedIdentifiers: boolean;
  assignedTo: UserRefDto | null;
  source: LeadSource;
  discoveredAt: string;
  createdAt: string;
}

export interface LeadDetailDto extends LeadListItemDto {
  addressLine: string | null;
  website: string | null;
  instagramHandle: string | null;
  publicPhone: string | null;
  publicEmail: string | null;
  sourceUrl: string | null;
  sourceNote: string | null;
  notes: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedBy: UserRefDto | null;
  contactedAt: string | null;
  contactNote: string | null;
  doNotContactReason: string | null;
  doNotContactAt: string | null;
  detailsVerifiedAt: string | null;
  detailsVerifiedBy: UserRefDto | null;
  createdBy: UserRefDto | null;
  retentionHoldUntil: string | null;
  updatedAt: string;
  identifiers: { type: IdentifierType; value: string; isShared: boolean }[];
}

export type DuplicateKind = "EXACT" | "SHARED_IDENTIFIER" | "POSSIBLE";

export interface DuplicateMatchDto {
  kind: DuplicateKind;
  lead: {
    id: string;
    displayId: number;
    businessName: string;
    areaName: string | null;
    reviewStatus: ReviewStatus;
    contactStatus: ContactStatus;
    doNotContact: boolean;
  };
  /** Which contact details matched (empty for a name-only possible duplicate). */
  matchedOn: IdentifierType[];
}

export interface DuplicateCheckDto {
  /** Same business: same contact detail, same name and same (or unknown) area. Always blocked. */
  exact: DuplicateMatchDto[];
  /** A different-looking business shares a contact detail (e.g. branches). Needs admin approval. */
  shared: DuplicateMatchDto[];
  /** Same name in the same area, no shared contact details. Needs "different business" confirmation. */
  possible: DuplicateMatchDto[];
}

export interface LeadHistoryEntryDto {
  id: string;
  action: string;
  actor: UserRefDto | null;
  previousStatus: string | null;
  newStatus: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

export interface RetentionCandidateDto {
  id: string;
  displayId: number;
  businessName: string;
  industryName: string | null;
  areaName: string | null;
  reviewStatus: ReviewStatus;
  createdAt: string;
  ageDays: number;
}

export interface RetentionListDto extends Paginated<RetentionCandidateDto> {
  thresholdDays: number;
  cutoff: string;
}

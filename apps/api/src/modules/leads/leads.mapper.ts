import type { Prisma } from "@prosolution/db";
import type { LeadDetailDto, LeadListItemDto } from "@prosolution/shared";

const userRef = { select: { id: true, name: true } } as const;

export const leadListInclude = {
  industry: { select: { id: true, name: true } },
  area: { select: { id: true, name: true } },
  city: { select: { id: true, name: true } },
  assignedTo: userRef,
  identifiers: { select: { type: true, value: true, isShared: true } },
} as const;

export const leadDetailInclude = {
  ...leadListInclude,
  reviewedBy: userRef,
  detailsVerifiedBy: userRef,
  createdBy: userRef,
} as const;

type ListRow = Prisma.LeadGetPayload<{ include: typeof leadListInclude }>;
type DetailRow = Prisma.LeadGetPayload<{ include: typeof leadDetailInclude }>;

const iso = (d: Date | null) => d?.toISOString() ?? null;

export function toLeadListItem(l: ListRow): LeadListItemDto {
  return {
    id: l.id,
    displayId: l.displayId,
    businessName: l.businessName,
    industry: l.industry,
    area: l.area,
    city: l.city,
    reviewStatus: l.reviewStatus,
    contactStatus: l.contactStatus,
    doNotContact: l.doNotContact,
    detailsVerified: l.detailsVerifiedAt !== null,
    hasSharedIdentifiers: l.identifiers.some((i) => i.isShared),
    assignedTo: l.assignedTo,
    source: l.source,
    discoveredAt: l.discoveredAt.toISOString(),
    createdAt: l.createdAt.toISOString(),
  };
}

export function toLeadDetail(l: DetailRow): LeadDetailDto {
  return {
    ...toLeadListItem(l),
    addressLine: l.addressLine,
    website: l.website,
    instagramHandle: l.instagramHandle,
    publicPhone: l.publicPhone,
    publicEmail: l.publicEmail,
    sourceUrl: l.sourceUrl,
    sourceNote: l.sourceNote,
    notes: l.notes,
    reviewNote: l.reviewNote,
    reviewedAt: iso(l.reviewedAt),
    reviewedBy: l.reviewedBy,
    contactedAt: iso(l.contactedAt),
    contactNote: l.contactNote,
    doNotContactReason: l.doNotContactReason,
    doNotContactAt: iso(l.doNotContactAt),
    detailsVerifiedAt: iso(l.detailsVerifiedAt),
    detailsVerifiedBy: l.detailsVerifiedBy,
    createdBy: l.createdBy,
    retentionHoldUntil: iso(l.retentionHoldUntil),
    updatedAt: l.updatedAt.toISOString(),
    identifiers: l.identifiers.map((i) => ({ type: i.type, value: i.value, isShared: i.isShared })),
  };
}

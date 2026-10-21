import type { Prisma } from "@prosolution/db";
import type { DuplicateCheckDto, DuplicateMatchDto, IdentifierType, LeadIdentifierValue } from "@prosolution/shared";

type Tx = Pick<Prisma.TransactionClient, "lead" | "leadIdentifier">;

export interface DuplicateQuery {
  nameKey: string | null;
  areaId: string | null;
  identifiers: LeadIdentifierValue[];
  excludeLeadId?: string;
}

const leadSelect = {
  id: true,
  displayId: true,
  businessName: true,
  nameKey: true,
  areaId: true,
  reviewStatus: true,
  contactStatus: true,
  doNotContact: true,
  area: { select: { name: true } },
} as const;

type MatchedLead = Prisma.LeadGetPayload<{ select: typeof leadSelect }>;

function toMatch(kind: DuplicateMatchDto["kind"], lead: MatchedLead, matchedOn: IdentifierType[]): DuplicateMatchDto {
  return {
    kind,
    lead: {
      id: lead.id,
      displayId: lead.displayId,
      businessName: lead.businessName,
      areaName: lead.area?.name ?? null,
      reviewStatus: lead.reviewStatus,
      contactStatus: lead.contactStatus,
      doNotContact: lead.doNotContact,
    },
    matchedOn,
  };
}

/** Areas are "the same" when equal, or when either side doesn't say. */
function sameArea(a: string | null, b: string | null): boolean {
  return a === null || b === null || a === b;
}

/**
 * Classifies existing leads against a new or edited one. Never merges anything.
 *
 * - EXACT: shares a contact detail AND has the same normalised name AND same (or unknown) area.
 *   That's the same business: always blocked.
 * - SHARED_IDENTIFIER: shares a contact detail but the name or area differs, e.g. two branches
 *   with one phone number. Blocked unless an admin approves it with a reason.
 * - POSSIBLE: same normalised name in the same (or unknown) area, but no shared contact details.
 *   Needs a "this is a different business" confirmation.
 */
export async function findDuplicates(tx: Tx, q: DuplicateQuery): Promise<DuplicateCheckDto> {
  const result: DuplicateCheckDto = { exact: [], shared: [], possible: [] };
  const seen = new Set<string>();

  if (q.identifiers.length) {
    const rows = await tx.leadIdentifier.findMany({
      where: {
        OR: q.identifiers.map((i) => ({ type: i.type, value: i.value })),
        ...(q.excludeLeadId ? { leadId: { not: q.excludeLeadId } } : {}),
      },
      select: { type: true, leadId: true, lead: { select: leadSelect } },
      take: 50,
    });
    const byLead = new Map<string, { lead: MatchedLead; types: IdentifierType[] }>();
    for (const r of rows) {
      const entry = byLead.get(r.leadId) ?? { lead: r.lead, types: [] };
      entry.types.push(r.type);
      byLead.set(r.leadId, entry);
    }
    for (const { lead, types } of byLead.values()) {
      seen.add(lead.id);
      const isExact = q.nameKey !== null && lead.nameKey === q.nameKey && sameArea(lead.areaId, q.areaId);
      (isExact ? result.exact : result.shared).push(toMatch(isExact ? "EXACT" : "SHARED_IDENTIFIER", lead, types.sort()));
    }
  }

  if (q.nameKey) {
    const sameName = await tx.lead.findMany({
      where: {
        nameKey: q.nameKey,
        ...(q.excludeLeadId ? { id: { not: q.excludeLeadId } } : {}),
        ...(q.areaId ? { OR: [{ areaId: q.areaId }, { areaId: null }] } : {}),
      },
      select: leadSelect,
      take: 10,
      orderBy: { createdAt: "desc" },
    });
    for (const lead of sameName) {
      if (!seen.has(lead.id)) result.possible.push(toMatch("POSSIBLE", lead, []));
    }
  }
  return result;
}

export function hasAnyDuplicate(d: DuplicateCheckDto): boolean {
  return d.exact.length + d.shared.length + d.possible.length > 0;
}

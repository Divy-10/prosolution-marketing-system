import type { Db, Prisma, User } from "@prosolution/db";
import {
  businessNameKey,
  leadIdentifiers,
  type CheckDuplicatesInput,
  type CreateLeadInput,
  type DoNotContactInput,
  type DuplicateCheckDto,
  type LeadDetailDto,
  type LeadHistoryEntryDto,
  type LeadIdentifierValue,
  type LeadListItemDto,
  type ListLeadsQuery,
  type Paginated,
  type RecordContactInput,
  type ReviewLeadInput,
  type UpdateLeadInput,
  type UserRefDto,
} from "@prosolution/shared";
import { AppError, errors } from "../../lib/errors.ts";
import { recordAudit, type ActorMeta } from "../audit/audit.service.ts";
import { findDuplicates } from "./duplicates.ts";
import { leadDetailInclude, leadListInclude, toLeadDetail, toLeadListItem } from "./leads.mapper.ts";

type Tx = Prisma.TransactionClient;

export interface Actor {
  user: User;
  meta: ActorMeta;
}

export type LeadCounts = Record<"candidates" | "approved" | "contacted" | "rejected", number>;

const CONTACT_FIELDS = ["website", "instagramHandle", "publicPhone", "publicEmail"] as const;

/** Sales users only ever see leads assigned to them. */
function visibilityFilter(user: User): Prisma.LeadWhereInput {
  return user.role === "SALES_USER" ? { assignedToId: user.id } : {};
}

function viewFilter(view: ListLeadsQuery["view"]): Prisma.LeadWhereInput {
  switch (view) {
    case "candidates":
      return { reviewStatus: "PENDING" };
    case "approved":
      return { reviewStatus: "APPROVED", contactStatus: "NOT_CONTACTED" };
    case "contacted":
      return { contactStatus: "CONTACTED" };
    case "rejected":
      return { reviewStatus: "REJECTED" };
    default:
      return {};
  }
}

/** Serialises concurrent creates/edits touching the same contact details or name (no race can slip a duplicate in). */
async function lockKeys(tx: Tx, nameKey: string, identifiers: LeadIdentifierValue[]) {
  const keys = [`name:${nameKey}`, ...identifiers.map((i) => `id:${i.type}:${i.value}`)].sort();
  for (const key of keys) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

export class LeadsService {
  constructor(private readonly db: Db) {}

  // ── Reading ───────────────────────────────────────────────────────────────
  async list(query: ListLeadsQuery, user: User): Promise<Paginated<LeadListItemDto> & { counts: LeadCounts }> {
    const base: Prisma.LeadWhereInput = {
      ...visibilityFilter(user),
      ...(query.industryId ? { industryId: query.industryId } : {}),
      ...(query.areaId ? { areaId: query.areaId } : {}),
      ...(query.assignedToId ? { assignedToId: query.assignedToId === "unassigned" ? null : query.assignedToId } : {}),
      ...(query.doNotContact === "only" ? { doNotContact: true } : query.doNotContact === "exclude" ? { doNotContact: false } : {}),
    };
    if (query.q) {
      const q = query.q;
      const num = /^(?:ld-?)?0*(\d{1,9})$/i.exec(q);
      base.OR = [
        { businessName: { contains: q, mode: "insensitive" } },
        { identifiers: { some: { value: { contains: q.toLowerCase().replace(/^@/, "") } } } },
        ...(num ? [{ displayId: Number(num[1]) }] : []),
      ];
    }
    const where = { ...base, ...viewFilter(query.view) };
    const [rows, total, candidates, approved, contacted, rejected] = await Promise.all([
      this.db.lead.findMany({
        where,
        include: leadListInclude,
        orderBy: [{ createdAt: "desc" }, { displayId: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.lead.count({ where }),
      this.db.lead.count({ where: { ...base, ...viewFilter("candidates") } }),
      this.db.lead.count({ where: { ...base, ...viewFilter("approved") } }),
      this.db.lead.count({ where: { ...base, ...viewFilter("contacted") } }),
      this.db.lead.count({ where: { ...base, ...viewFilter("rejected") } }),
    ]);
    return {
      data: rows.map(toLeadListItem),
      page: query.page,
      pageSize: query.pageSize,
      total,
      counts: { candidates, approved, contacted, rejected },
    };
  }

  /** 404 (not 403) for leads a sales user isn't assigned to, so their existence isn't revealed. */
  private async findVisible(id: string, user: User) {
    const lead = await this.db.lead.findFirst({ where: { id, ...visibilityFilter(user) }, include: leadDetailInclude });
    if (!lead) throw errors.notFound("Lead");
    return lead;
  }

  async get(id: string, user: User): Promise<LeadDetailDto> {
    return toLeadDetail(await this.findVisible(id, user));
  }

  async history(id: string, user: User): Promise<LeadHistoryEntryDto[]> {
    await this.findVisible(id, user);
    const rows = await this.db.auditLog.findMany({
      where: { leadId: id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { actor: { select: { id: true, name: true } } },
      take: 500,
    });
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      actor: r.actor,
      previousStatus: r.previousStatus,
      newStatus: r.newStatus,
      meta: (r.meta as Record<string, unknown> | null) ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async assignees(): Promise<UserRefDto[]> {
    return this.db.user.findMany({
      where: { isActive: true, role: { in: ["ADMIN", "SALES_MANAGER", "SALES_USER"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  async checkDuplicates(input: CheckDuplicatesInput): Promise<DuplicateCheckDto> {
    const nameKey = input.businessName ? businessNameKey(input.businessName) || null : null;
    return findDuplicates(this.db, {
      nameKey,
      areaId: input.areaId ?? null,
      identifiers: leadIdentifiers(input),
      ...(input.excludeLeadId ? { excludeLeadId: input.excludeLeadId } : {}),
    });
  }

  // ── Shared write helpers ──────────────────────────────────────────────────
  /** Checks industry/city/area exist (and are active when newly chosen); returns the city implied by the area. */
  private async resolveLocation(
    tx: Tx,
    input: { industryId?: string | null; cityId?: string | null; areaId?: string | null },
    current?: { industryId: string | null; cityId: string | null; areaId: string | null },
  ): Promise<{ industryId: string | null; cityId: string | null; areaId: string | null }> {
    const industryId = input.industryId !== undefined ? input.industryId : (current?.industryId ?? null);
    const areaId = input.areaId !== undefined ? input.areaId : (current?.areaId ?? null);
    let cityId = input.cityId !== undefined ? input.cityId : (current?.cityId ?? null);

    if (industryId) {
      const industry = await tx.industry.findUnique({ where: { id: industryId } });
      if (!industry || (!industry.isActive && industryId !== current?.industryId)) {
        throw errors.validation("Choose an active industry.", { industryId: ["This industry isn't available."] });
      }
    }
    if (areaId) {
      const area = await tx.area.findUnique({ where: { id: areaId } });
      if (!area || (!area.isActive && areaId !== current?.areaId)) {
        throw errors.validation("Choose an active area.", { areaId: ["This area isn't available."] });
      }
      if (cityId && cityId !== area.cityId) {
        throw errors.validation("The area isn't in the selected city.", { areaId: ["Pick an area in the selected city."] });
      }
      cityId = area.cityId;
    }
    if (cityId) {
      const city = await tx.city.findUnique({ where: { id: cityId } });
      if (!city) throw errors.validation("Choose a city.", { cityId: ["Unknown city."] });
    }
    return { industryId, cityId, areaId };
  }

  /**
   * Applies the duplicate rules. Returns identifiers that an admin approved as shared.
   * Throws 409 with the matches attached when the person still needs to decide.
   */
  private async enforceDuplicateRules(
    tx: Tx,
    q: { nameKey: string; areaId: string | null; identifiers: LeadIdentifierValue[]; excludeLeadId?: string },
    decision: CreateLeadInput["duplicates"],
    actor: Actor,
  ): Promise<{ sharedValues: LeadIdentifierValue[]; duplicates: DuplicateCheckDto }> {
    const duplicates = await findDuplicates(tx, q);
    const first = duplicates.exact[0];
    if (first) {
      throw new AppError(
        409,
        "DUPLICATE_LEAD",
        `This business is already in the system as LD-${String(first.lead.displayId).padStart(6, "0")} (${first.lead.businessName}). Open that lead instead of adding it again.`,
        undefined,
        { duplicates },
      );
    }
    if (duplicates.shared.length) {
      if (actor.user.role !== "ADMIN") {
        throw new AppError(
          409,
          "SHARED_IDENTIFIER",
          "These contact details already belong to another lead. If this is a separate branch, ask an admin to add it.",
          undefined,
          { duplicates },
        );
      }
      if (!decision?.approveSharedIdentifiers || !decision.sharedIdentifierReason) {
        throw new AppError(
          409,
          "SHARED_IDENTIFIER",
          "These contact details already belong to another lead. Confirm it's a separate branch and give a reason to continue.",
          { sharedIdentifierReason: ["Say why these businesses share contact details."] },
          { duplicates },
        );
      }
    }
    if (duplicates.possible.length && !decision?.confirmDifferentBusiness) {
      throw new AppError(
        409,
        "POSSIBLE_DUPLICATE",
        "A lead with the same name already exists in this area. Check it, then confirm this is a different business.",
        undefined,
        { duplicates },
      );
    }
    const sharedTypes = new Set(duplicates.shared.flatMap((m) => m.matchedOn));
    return { sharedValues: q.identifiers.filter((i) => sharedTypes.has(i.type)), duplicates };
  }

  /** Marks matching identifiers on the other leads as shared, too. */
  private async markShared(tx: Tx, values: LeadIdentifierValue[]) {
    for (const v of values) {
      await tx.leadIdentifier.updateMany({ where: { type: v.type, value: v.value }, data: { isShared: true } });
    }
  }

  private async auditDuplicateDecisions(
    tx: Tx,
    leadId: string,
    duplicates: DuplicateCheckDto,
    decision: CreateLeadInput["duplicates"],
    meta: ActorMeta,
  ) {
    if (duplicates.shared.length) {
      await recordAudit(tx, {
        action: "lead.shared_identifier_approved",
        entityType: "Lead",
        entityId: leadId,
        leadId,
        meta: {
          reason: decision?.sharedIdentifierReason ?? null,
          sharedWith: duplicates.shared.map((m) => m.lead.displayId),
          matchedOn: [...new Set(duplicates.shared.flatMap((m) => m.matchedOn))],
        },
        ...meta,
      });
    }
    if (duplicates.possible.length) {
      await recordAudit(tx, {
        action: "lead.possible_duplicate_confirmed",
        entityType: "Lead",
        entityId: leadId,
        leadId,
        meta: { comparedWith: duplicates.possible.map((m) => m.lead.displayId) },
        ...meta,
      });
    }
  }

  // ── Create & edit ─────────────────────────────────────────────────────────
  async create(input: CreateLeadInput, actor: Actor): Promise<LeadDetailDto> {
    const nameKey = businessNameKey(input.businessName);
    if (!nameKey) throw errors.validation("Enter a business name with letters or numbers.", { businessName: ["Enter a real name."] });
    const identifiers = leadIdentifiers(input);

    const id = await this.db.$transaction(async (tx) => {
      await lockKeys(tx, nameKey, identifiers);
      const location = await this.resolveLocation(tx, input);
      const { sharedValues, duplicates } = await this.enforceDuplicateRules(
        tx,
        { nameKey, areaId: location.areaId, identifiers },
        input.duplicates,
        actor,
      );
      const lead = await tx.lead.create({
        data: {
          businessName: input.businessName,
          nameKey,
          ...location,
          addressLine: input.addressLine ?? null,
          website: input.website ?? null,
          instagramHandle: input.instagramHandle ?? null,
          publicPhone: input.publicPhone ?? null,
          publicEmail: input.publicEmail ?? null,
          source: input.source,
          sourceUrl: input.sourceUrl ?? null,
          sourceNote: input.sourceNote ?? null,
          notes: input.notes ?? null,
          createdById: actor.user.id,
          identifiers: {
            create: identifiers.map((i) => ({
              type: i.type,
              value: i.value,
              isShared: sharedValues.some((s) => s.type === i.type && s.value === i.value),
            })),
          },
        },
      });
      await this.markShared(tx, sharedValues);
      await recordAudit(tx, {
        action: "lead.created",
        entityType: "Lead",
        entityId: lead.id,
        leadId: lead.id,
        newStatus: "PENDING",
        meta: { displayId: lead.displayId, source: lead.source, contactDetails: identifiers.map((i) => i.type) },
        ...actor.meta,
      });
      await this.auditDuplicateDecisions(tx, lead.id, duplicates, input.duplicates, actor.meta);
      return lead.id;
    });
    return this.get(id, actor.user);
  }

  async update(id: string, input: UpdateLeadInput, actor: Actor): Promise<LeadDetailDto> {
    const { duplicates: decision, ...patch } = input;
    await this.db.$transaction(async (tx) => {
      const before = await tx.lead.findUnique({ where: { id } });
      if (!before) throw errors.notFound("Lead");

      const merged = {
        businessName: patch.businessName ?? before.businessName,
        website: patch.website !== undefined ? patch.website : before.website,
        instagramHandle: patch.instagramHandle !== undefined ? patch.instagramHandle : before.instagramHandle,
        publicPhone: patch.publicPhone !== undefined ? patch.publicPhone : before.publicPhone,
        publicEmail: patch.publicEmail !== undefined ? patch.publicEmail : before.publicEmail,
      };
      const nameKey = businessNameKey(merged.businessName);
      if (!nameKey) throw errors.validation("Enter a business name with letters or numbers.", { businessName: ["Enter a real name."] });
      const identifiers = leadIdentifiers(merged);
      const location = await this.resolveLocation(tx, patch, before);

      const changed = Object.entries({ ...patch, ...location })
        .filter(([k, v]) => JSON.stringify((before as Record<string, unknown>)[k] ?? null) !== JSON.stringify(v ?? null))
        .map(([k]) => k);
      if (!changed.length) return;

      const contactChanged = CONTACT_FIELDS.some((f) => changed.includes(f));
      const identityChanged = contactChanged || changed.includes("businessName") || changed.includes("areaId");

      let sharedValues: LeadIdentifierValue[] = [];
      if (identityChanged) {
        await lockKeys(tx, nameKey, identifiers);
        const res = await this.enforceDuplicateRules(
          tx,
          { nameKey, areaId: location.areaId, identifiers, excludeLeadId: id },
          decision,
          actor,
        );
        sharedValues = res.sharedValues;
        await this.auditDuplicateDecisions(tx, id, res.duplicates, decision, actor.meta);
      }

      const clearVerification = contactChanged && before.detailsVerifiedAt !== null;
      await tx.lead.update({
        where: { id },
        data: {
          ...patch,
          ...location,
          nameKey,
          ...(clearVerification ? { detailsVerifiedAt: null, detailsVerifiedById: null } : {}),
        },
      });
      if (identityChanged) {
        await tx.leadIdentifier.deleteMany({ where: { leadId: id } });
        if (identifiers.length) {
          await tx.leadIdentifier.createMany({
            data: identifiers.map((i) => ({
              leadId: id,
              type: i.type,
              value: i.value,
              isShared: sharedValues.some((s) => s.type === i.type && s.value === i.value),
            })),
          });
        }
        await this.markShared(tx, sharedValues);
      }
      // Field names only: values (e.g. phone numbers) stay out of the permanent audit log.
      await recordAudit(tx, { action: "lead.updated", entityType: "Lead", entityId: id, leadId: id, meta: { fields: changed }, ...actor.meta });
      if (clearVerification) {
        await recordAudit(tx, {
          action: "lead.verification_cleared",
          entityType: "Lead",
          entityId: id,
          leadId: id,
          previousStatus: "VERIFIED",
          newStatus: "UNVERIFIED",
          ...actor.meta,
        });
      }
    });
    return this.get(id, actor.user);
  }

  // ── Workflow actions ──────────────────────────────────────────────────────
  private async mustGet(tx: Tx, id: string) {
    const lead = await tx.lead.findUnique({ where: { id } });
    if (!lead) throw errors.notFound("Lead");
    return lead;
  }

  async review(id: string, input: ReviewLeadInput, actor: Actor): Promise<LeadDetailDto> {
    await this.db.$transaction(async (tx) => {
      const lead = await this.mustGet(tx, id);
      if (lead.contactStatus === "CONTACTED") {
        throw errors.conflict("This business has already been contacted, so its review decision can't change.");
      }
      const target = input.decision === "APPROVE" ? "APPROVED" : input.decision === "REJECT" ? "REJECTED" : "PENDING";
      if (lead.reviewStatus === target) throw errors.conflict(`This lead is already ${target.toLowerCase()}.`);
      if (target === "APPROVED" && lead.doNotContact) {
        throw errors.conflict("This business is marked do not contact. An admin must remove that first.");
      }
      await tx.lead.update({
        where: { id },
        data: {
          reviewStatus: target,
          reviewNote: input.note ?? null,
          reviewedAt: target === "PENDING" ? null : new Date(),
          reviewedById: target === "PENDING" ? null : actor.user.id,
        },
      });
      await recordAudit(tx, {
        action: "lead.reviewed",
        entityType: "Lead",
        entityId: id,
        leadId: id,
        previousStatus: lead.reviewStatus,
        newStatus: target,
        meta: input.note ? { note: input.note } : undefined,
        ...actor.meta,
      });
    });
    return this.get(id, actor.user);
  }

  async assign(id: string, userId: string | null, actor: Actor): Promise<LeadDetailDto> {
    await this.db.$transaction(async (tx) => {
      const lead = await this.mustGet(tx, id);
      if (userId) {
        const assignee = await tx.user.findUnique({ where: { id: userId } });
        if (!assignee || !assignee.isActive || assignee.role === "VIEWER") {
          throw errors.validation("Choose an active admin, sales manager or sales user.", { userId: ["Can't assign to this user."] });
        }
      }
      if (lead.assignedToId === userId) return;
      await tx.lead.update({ where: { id }, data: { assignedToId: userId } });
      await recordAudit(tx, {
        action: "lead.assigned",
        entityType: "Lead",
        entityId: id,
        leadId: id,
        meta: { from: lead.assignedToId, to: userId },
        ...actor.meta,
      });
    });
    return this.get(id, actor.user);
  }

  async verifyDetails(id: string, actor: Actor): Promise<LeadDetailDto> {
    await this.db.$transaction(async (tx) => {
      const lead = await this.mustGet(tx, id);
      if (!lead.website && !lead.instagramHandle && !lead.publicPhone && !lead.publicEmail && !lead.addressLine) {
        throw errors.conflict("There are no contact or location details to verify yet.");
      }
      await tx.lead.update({ where: { id }, data: { detailsVerifiedAt: new Date(), detailsVerifiedById: actor.user.id } });
      await recordAudit(tx, {
        action: "lead.details_verified",
        entityType: "Lead",
        entityId: id,
        leadId: id,
        previousStatus: lead.detailsVerifiedAt ? "VERIFIED" : "UNVERIFIED",
        newStatus: "VERIFIED",
        ...actor.meta,
      });
    });
    return this.get(id, actor.user);
  }

  async setDoNotContact(id: string, input: DoNotContactInput, actor: Actor): Promise<LeadDetailDto> {
    if (!input.doNotContact && actor.user.role !== "ADMIN") {
      throw errors.forbidden("Only an admin can remove a do-not-contact mark.");
    }
    await this.db.$transaction(async (tx) => {
      const lead = await this.mustGet(tx, id);
      if (lead.doNotContact === input.doNotContact) {
        throw errors.conflict(input.doNotContact ? "This business is already marked do not contact." : "This business isn't marked do not contact.");
      }
      await tx.lead.update({
        where: { id },
        data: input.doNotContact
          ? { doNotContact: true, doNotContactReason: input.reason, doNotContactAt: new Date() }
          : { doNotContact: false, doNotContactReason: null, doNotContactAt: null },
      });
      await recordAudit(tx, {
        action: input.doNotContact ? "lead.do_not_contact_set" : "lead.do_not_contact_lifted",
        entityType: "Lead",
        entityId: id,
        leadId: id,
        previousStatus: lead.doNotContact ? "DO_NOT_CONTACT" : "CONTACTABLE",
        newStatus: input.doNotContact ? "DO_NOT_CONTACT" : "CONTACTABLE",
        meta: { reason: input.reason },
        ...actor.meta,
      });
    });
    return this.get(id, actor.user);
  }

  /** For businesses contacted outside the app (e.g. before it existed). Contacted leads are protected from retention deletion. */
  async recordContact(id: string, input: RecordContactInput, actor: Actor): Promise<LeadDetailDto> {
    await this.db.$transaction(async (tx) => {
      const lead = await this.mustGet(tx, id);
      if (lead.contactStatus === "CONTACTED") throw errors.conflict("Contact has already been recorded for this lead.");
      if (lead.reviewStatus !== "APPROVED") throw errors.conflict("Approve the lead before recording contact.");
      if (lead.doNotContact) throw errors.conflict("This business is marked do not contact.");
      await tx.lead.update({
        where: { id },
        data: { contactStatus: "CONTACTED", contactedAt: input.contactedAt, contactNote: input.note },
      });
      await recordAudit(tx, {
        action: "lead.contact_recorded",
        entityType: "Lead",
        entityId: id,
        leadId: id,
        previousStatus: "NOT_CONTACTED",
        newStatus: "CONTACTED",
        meta: { contactedAt: input.contactedAt.toISOString() },
        ...actor.meta,
      });
    });
    return this.get(id, actor.user);
  }
}

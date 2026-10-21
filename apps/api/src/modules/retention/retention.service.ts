import type { Db, Prisma } from "@prosolution/db";
import { retentionConfirmationPhrase, type RetentionListDto } from "@prosolution/shared";
import { AppError } from "../../lib/errors.ts";
import { recordAudit, type ActorMeta } from "../audit/audit.service.ts";
import { getRetentionDays } from "../settings/settings.service.ts";

const DAY_MS = 86_400_000;

/**
 * A lead is eligible for retention review only if ALL of these hold:
 * - it has never been contacted (contacted leads are always kept),
 * - it is not marked do not contact (opt-outs are kept so they keep being honoured),
 * - it was created more than the configured number of days ago,
 * - an admin hasn't chosen to keep it for another period.
 * Nothing is ever deleted automatically: deletion is an explicit admin action.
 */
function eligibleWhere(cutoff: Date, now: Date): Prisma.LeadWhereInput {
  return {
    contactStatus: "NOT_CONTACTED",
    doNotContact: false,
    createdAt: { lte: cutoff },
    OR: [{ retentionHoldUntil: null }, { retentionHoldUntil: { lt: now } }],
  };
}

function isEligible(
  lead: { contactStatus: string; doNotContact: boolean; createdAt: Date; retentionHoldUntil: Date | null },
  cutoff: Date,
  now: Date,
): boolean {
  return (
    lead.contactStatus === "NOT_CONTACTED" &&
    !lead.doNotContact &&
    lead.createdAt.getTime() <= cutoff.getTime() &&
    (lead.retentionHoldUntil === null || lead.retentionHoldUntil.getTime() < now.getTime())
  );
}

export class RetentionService {
  constructor(private readonly db: Db) {}

  private async window() {
    const days = await getRetentionDays(this.db);
    const now = new Date();
    return { days, now, cutoff: new Date(now.getTime() - days * DAY_MS) };
  }

  async listEligible(page: number, pageSize: number): Promise<RetentionListDto> {
    const { days, now, cutoff } = await this.window();
    const where = eligibleWhere(cutoff, now);
    const [rows, total] = await Promise.all([
      this.db.lead.findMany({
        where,
        orderBy: [{ createdAt: "asc" }, { displayId: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { industry: { select: { name: true } }, area: { select: { name: true } } },
      }),
      this.db.lead.count({ where }),
    ]);
    return {
      data: rows.map((l) => ({
        id: l.id,
        displayId: l.displayId,
        businessName: l.businessName,
        industryName: l.industry?.name ?? null,
        areaName: l.area?.name ?? null,
        reviewStatus: l.reviewStatus,
        createdAt: l.createdAt.toISOString(),
        ageDays: Math.floor((now.getTime() - l.createdAt.getTime()) / DAY_MS),
      })),
      page,
      pageSize,
      total,
      thresholdDays: days,
      cutoff: cutoff.toISOString(),
    };
  }

  /** Locks the selected leads and returns them; throws 409 if any is missing or no longer eligible. */
  private async lockEligible(tx: Prisma.TransactionClient, leadIds: string[], cutoff: Date, now: Date) {
    const ids = [...new Set(leadIds)];
    // Row locks: a lead can't be contacted or edited while this decision is being applied.
    await tx.$queryRaw`SELECT id FROM "Lead" WHERE id = ANY(${ids}::text[]) FOR UPDATE`;
    const leads = await tx.lead.findMany({
      where: { id: { in: ids } },
      include: { industry: { select: { name: true } }, area: { select: { name: true } } },
    });
    const found = new Set(leads.map((l) => l.id));
    const ineligible = [...ids.filter((id) => !found.has(id)), ...leads.filter((l) => !isEligible(l, cutoff, now)).map((l) => l.id)];
    if (ineligible.length) {
      throw new AppError(
        409,
        "NOT_ELIGIBLE",
        `${ineligible.length} of the selected leads ${ineligible.length === 1 ? "is" : "are"} no longer eligible (contacted, marked do not contact, kept, too recent or already removed). Nothing was changed. Reload the list and try again.`,
        undefined,
        { ineligibleLeadIds: ineligible },
      );
    }
    return leads;
  }

  async keep(leadIds: string[], meta: ActorMeta): Promise<{ kept: number; holdUntil: string }> {
    const { days, now, cutoff } = await this.window();
    const holdUntil = new Date(now.getTime() + days * DAY_MS);
    const kept = await this.db.$transaction(async (tx) => {
      const leads = await this.lockEligible(tx, leadIds, cutoff, now);
      await tx.lead.updateMany({ where: { id: { in: leads.map((l) => l.id) } }, data: { retentionHoldUntil: holdUntil } });
      for (const l of leads) {
        await recordAudit(tx, {
          action: "retention.lead_kept",
          entityType: "Lead",
          entityId: l.id,
          leadId: l.id,
          meta: { displayId: l.displayId, keptUntil: holdUntil.toISOString(), thresholdDays: days },
          ...meta,
        });
      }
      return leads.length;
    });
    return { kept, holdUntil: holdUntil.toISOString() };
  }

  /**
   * Permanently deletes the selected leads after an admin typed the confirmation phrase.
   * All-or-nothing: if any selected lead stopped being eligible, nothing is deleted.
   * Audit rows keep the lead number, industry, area and age, but no contact details or business name.
   */
  async delete(leadIds: string[], confirmation: string, meta: ActorMeta): Promise<{ deleted: number }> {
    const count = new Set(leadIds).size;
    const expected = retentionConfirmationPhrase(count);
    if (confirmation !== expected) {
      throw new AppError(400, "VALIDATION_FAILED", `Type ${expected} to confirm.`, { confirmation: [`Type ${expected} exactly.`] });
    }
    const { days, now, cutoff } = await this.window();
    const deleted = await this.db.$transaction(async (tx) => {
      const leads = await this.lockEligible(tx, leadIds, cutoff, now);
      for (const l of leads) {
        await recordAudit(tx, {
          action: "retention.lead_deleted",
          entityType: "Lead",
          entityId: l.id,
          leadId: l.id,
          previousStatus: l.reviewStatus,
          newStatus: "DELETED",
          meta: {
            displayId: l.displayId,
            industry: l.industry?.name ?? null,
            area: l.area?.name ?? null,
            ageDays: Math.floor((now.getTime() - l.createdAt.getTime()) / DAY_MS),
            thresholdDays: days,
          },
          ...meta,
        });
      }
      const res = await tx.lead.deleteMany({ where: { id: { in: leads.map((l) => l.id) } } });
      await recordAudit(tx, {
        action: "retention.batch_deleted",
        entityType: "Lead",
        meta: { count: res.count, displayIds: leads.map((l) => l.displayId), thresholdDays: days },
        ...meta,
      });
      return res.count;
    });
    return { deleted };
  }
}

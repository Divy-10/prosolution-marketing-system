import type { Db } from "@prosolution/db";
import {
  DEFAULT_LEAD_RETENTION_DAYS,
  type CompanyProfileDto,
  type CompanyProfileInput,
  type SystemSettingsDto,
  type SystemSettingsInput,
} from "@prosolution/shared";
import { recordAudit, type ActorMeta } from "../audit/audit.service.ts";

const SINGLETON = "default";

const EMPTY_PROFILE: CompanyProfileDto = {
  companyName: "",
  tagline: null,
  description: null,
  city: "Surat",
  publicEmail: null,
  publicPhone: null,
  instagramHandle: null,
  website: null,
  qualificationNotes: null,
  requireOnlinePresence: false,
  updatedAt: null,
};

export async function getRetentionDays(db: Pick<Db, "systemSettings">): Promise<number> {
  const row = await db.systemSettings.findUnique({ where: { id: SINGLETON } });
  return row?.leadRetentionDays ?? DEFAULT_LEAD_RETENTION_DAYS;
}

export class SettingsService {
  constructor(private readonly db: Db) {}

  async getCompanyProfile(): Promise<CompanyProfileDto> {
    const row = await this.db.companyProfile.findUnique({ where: { id: SINGLETON } });
    if (!row) return EMPTY_PROFILE;
    const { id: _id, updatedById: _u, updatedAt, ...rest } = row;
    return { ...rest, updatedAt: updatedAt.toISOString() };
  }

  async updateCompanyProfile(input: CompanyProfileInput, meta: ActorMeta): Promise<CompanyProfileDto> {
    const before = await this.db.companyProfile.findUnique({ where: { id: SINGLETON } });
    const data = {
      companyName: input.companyName,
      tagline: input.tagline ?? null,
      description: input.description ?? null,
      city: input.city,
      publicEmail: input.publicEmail ?? null,
      publicPhone: input.publicPhone ?? null,
      instagramHandle: input.instagramHandle ?? null,
      website: input.website ?? null,
      qualificationNotes: input.qualificationNotes ?? null,
      requireOnlinePresence: input.requireOnlinePresence,
      updatedById: meta.actorId,
    };
    const changed = before
      ? (Object.keys(data) as (keyof typeof data)[]).filter((k) => k !== "updatedById" && before[k] !== data[k])
      : Object.keys(data).filter((k) => k !== "updatedById");
    await this.db.$transaction(async (tx) => {
      await tx.companyProfile.upsert({ where: { id: SINGLETON }, create: { id: SINGLETON, ...data }, update: data });
      if (changed.length) {
        await recordAudit(tx, {
          action: "settings.company_profile_updated",
          entityType: "CompanyProfile",
          entityId: SINGLETON,
          meta: { fields: changed },
          ...meta,
        });
      }
    });
    return this.getCompanyProfile();
  }

  async getSystemSettings(): Promise<SystemSettingsDto> {
    const row = await this.db.systemSettings.findUnique({ where: { id: SINGLETON } });
    return {
      leadRetentionDays: row?.leadRetentionDays ?? DEFAULT_LEAD_RETENTION_DAYS,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }

  async updateSystemSettings(input: SystemSettingsInput, meta: ActorMeta): Promise<SystemSettingsDto> {
    const previous = await getRetentionDays(this.db);
    await this.db.$transaction(async (tx) => {
      await tx.systemSettings.upsert({
        where: { id: SINGLETON },
        create: { id: SINGLETON, leadRetentionDays: input.leadRetentionDays, updatedById: meta.actorId },
        update: { leadRetentionDays: input.leadRetentionDays, updatedById: meta.actorId },
      });
      if (previous !== input.leadRetentionDays) {
        await recordAudit(tx, {
          action: "settings.system_updated",
          entityType: "SystemSettings",
          entityId: SINGLETON,
          previousStatus: `${previous} days`,
          newStatus: `${input.leadRetentionDays} days`,
          meta: { field: "leadRetentionDays" },
          ...meta,
        });
      }
    });
    return this.getSystemSettings();
  }
}

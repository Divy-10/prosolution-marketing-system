import { labelKey } from "@prosolution/shared";
import type { Db } from "./index.ts";
import { CITIES, COMPANY_PROFILE, DEFAULT_RETENTION_DAYS, INDUSTRIES, SERVICES } from "./seed-data.ts";

export interface SeedResult {
  companyProfile: boolean;
  systemSettings: boolean;
  services: number;
  industries: number;
  industryServiceLinks: number;
  cities: number;
  areas: number;
}

/**
 * Inserts the starting configuration if it is missing.
 * - Only creates; never updates, overwrites or deletes anything.
 * - Records already present (matched by normalised name) are left exactly as an admin edited them.
 * - Suggested services are linked only for industries created in this run, so links an admin
 *   removed are not re-added.
 * - Creates no leads.
 */
export async function seedConfig(db: Db): Promise<SeedResult> {
  return db.$transaction(async (tx) => {
    const result: SeedResult = {
      companyProfile: false,
      systemSettings: false,
      services: 0,
      industries: 0,
      industryServiceLinks: 0,
      cities: 0,
      areas: 0,
    };

    if (!(await tx.companyProfile.findUnique({ where: { id: "default" } }))) {
      await tx.companyProfile.create({ data: { id: "default", ...COMPANY_PROFILE } });
      result.companyProfile = true;
    }
    if (!(await tx.systemSettings.findUnique({ where: { id: "default" } }))) {
      await tx.systemSettings.create({ data: { id: "default", leadRetentionDays: DEFAULT_RETENTION_DAYS } });
      result.systemSettings = true;
    }

    const serviceIdByKey = new Map<string, string>();
    for (const [i, s] of SERVICES.entries()) {
      const nameKey = labelKey(s.name);
      const existing = await tx.service.findUnique({ where: { nameKey } });
      if (existing) {
        serviceIdByKey.set(s.key, existing.id);
        continue;
      }
      const created = await tx.service.create({
        data: {
          name: s.name,
          nameKey,
          category: s.category,
          description: s.description,
          idealCustomer: s.idealCustomer,
          keyBenefits: s.keyBenefits,
          restrictions: s.restrictions ?? null,
          sortOrder: (i + 1) * 10,
        },
      });
      serviceIdByKey.set(s.key, created.id);
      result.services++;
    }

    for (const [i, ind] of INDUSTRIES.entries()) {
      const nameKey = labelKey(ind.name);
      if (await tx.industry.findUnique({ where: { nameKey } })) continue;
      const created = await tx.industry.create({
        data: { name: ind.name, nameKey, description: ind.description ?? null, sortOrder: (i + 1) * 10 },
      });
      result.industries++;
      const serviceIds = ind.services.map((k) => serviceIdByKey.get(k)).filter((v): v is string => Boolean(v));
      if (serviceIds.length) {
        await tx.industryService.createMany({
          data: serviceIds.map((serviceId) => ({ industryId: created.id, serviceId })),
          skipDuplicates: true,
        });
        result.industryServiceLinks += serviceIds.length;
      }
    }

    for (const c of CITIES) {
      const nameKey = labelKey(c.name);
      let city = await tx.city.findUnique({ where: { nameKey } });
      if (!city) {
        city = await tx.city.create({ data: { name: c.name, nameKey, state: c.state } });
        result.cities++;
      }
      for (const [i, areaName] of c.areas.entries()) {
        const areaKey = labelKey(areaName);
        const exists = await tx.area.findUnique({ where: { cityId_nameKey: { cityId: city.id, nameKey: areaKey } } });
        if (exists) continue;
        await tx.area.create({ data: { cityId: city.id, name: areaName, nameKey: areaKey, sortOrder: (i + 1) * 10 } });
        result.areas++;
      }
    }

    const changed =
      result.companyProfile || result.systemSettings || result.services || result.industries || result.cities || result.areas;
    if (changed) {
      await tx.auditLog.create({
        data: {
          action: "system.config_seeded",
          entityType: "System",
          meta: { ...result },
        },
      });
    }
    return result;
  });
}

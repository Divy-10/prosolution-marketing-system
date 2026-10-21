import type { Db, Prisma } from "@prosolution/db";
import {
  labelKey,
  type AreaDto,
  type AuditAction,
  type CatalogQuery,
  type CityDto,
  type CreateAreaInput,
  type CreateIndustryInput,
  type CreateServiceInput,
  type IndustryDto,
  type ServiceDto,
  type UpdateAreaInput,
  type UpdateIndustryInput,
  type UpdateServiceInput,
} from "@prosolution/shared";
import { AppError, errors } from "../../lib/errors.ts";
import { recordAudit, type ActorMeta } from "../audit/audit.service.ts";

type Tx = Prisma.TransactionClient;

function statusFilter(status: CatalogQuery["status"]) {
  return status === "active" ? { isActive: true } : status === "inactive" ? { isActive: false } : {};
}

/** Names of fields whose value actually changed. */
function changedFields<T extends Record<string, unknown>>(before: T, patch: Partial<T>): string[] {
  return Object.keys(patch).filter((k) => {
    const a = before[k];
    const b = patch[k as keyof T];
    return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
  });
}

/** Audit rows for an update: enable/disable gets its own action; other edits list the changed fields. */
async function auditCatalogUpdate(
  tx: Tx,
  kind: "service" | "industry" | "area",
  entityType: string,
  id: string,
  fields: string[],
  wasActive: boolean,
  isActive: boolean | undefined,
  meta: ActorMeta,
) {
  if (isActive !== undefined && isActive !== wasActive) {
    await recordAudit(tx, {
      action: `${kind}.${isActive ? "enabled" : "disabled"}` as AuditAction,
      entityType,
      entityId: id,
      previousStatus: wasActive ? "ACTIVE" : "INACTIVE",
      newStatus: isActive ? "ACTIVE" : "INACTIVE",
      ...meta,
    });
  }
  const other = fields.filter((f) => f !== "isActive");
  if (other.length) {
    await recordAudit(tx, { action: `${kind}.updated` as AuditAction, entityType, entityId: id, meta: { fields: other }, ...meta });
  }
}

// ── Services ────────────────────────────────────────────────────────────────
type ServiceRow = Prisma.ServiceGetPayload<{ include: { industries: { select: { industryId: true } } } }>;

function toServiceDto(s: ServiceRow): ServiceDto {
  return {
    id: s.id,
    name: s.name,
    category: s.category,
    description: s.description,
    idealCustomer: s.idealCustomer,
    keyBenefits: s.keyBenefits,
    exampleOffer: s.exampleOffer,
    cta: s.cta,
    restrictions: s.restrictions,
    portfolioUrl: s.portfolioUrl,
    isActive: s.isActive,
    sortOrder: s.sortOrder,
    industryIds: s.industries.map((i) => i.industryId),
    updatedAt: s.updatedAt.toISOString(),
  };
}

const serviceInclude = { industries: { select: { industryId: true } } } as const;

export class ServicesService {
  constructor(private readonly db: Db) {}

  async list(query: CatalogQuery): Promise<{ data: ServiceDto[] }> {
    const rows = await this.db.service.findMany({
      where: {
        ...statusFilter(query.status),
        ...(query.q ? { name: { contains: query.q, mode: "insensitive" } } : {}),
      },
      include: serviceInclude,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return { data: rows.map(toServiceDto) };
  }

  private async assertNameFree(name: string, exceptId?: string) {
    const existing = await this.db.service.findUnique({ where: { nameKey: labelKey(name) } });
    if (existing && existing.id !== exceptId) throw errors.conflict(`A service called "${existing.name}" already exists.`);
  }

  async create(input: CreateServiceInput, meta: ActorMeta): Promise<ServiceDto> {
    await this.assertNameFree(input.name);
    const row = await this.db.$transaction(async (tx) => {
      const max = await tx.service.aggregate({ _max: { sortOrder: true } });
      const created = await tx.service.create({
        data: {
          name: input.name,
          nameKey: labelKey(input.name),
          category: input.category,
          description: input.description,
          idealCustomer: input.idealCustomer ?? null,
          keyBenefits: input.keyBenefits,
          exampleOffer: input.exampleOffer ?? null,
          cta: input.cta ?? null,
          restrictions: input.restrictions ?? null,
          portfolioUrl: input.portfolioUrl ?? null,
          sortOrder: input.sortOrder ?? (max._max.sortOrder ?? 0) + 10,
        },
        include: serviceInclude,
      });
      await recordAudit(tx, { action: "service.created", entityType: "Service", entityId: created.id, meta: { name: created.name }, ...meta });
      return created;
    });
    return toServiceDto(row);
  }

  async update(id: string, input: UpdateServiceInput, meta: ActorMeta): Promise<ServiceDto> {
    const before = await this.db.service.findUnique({ where: { id } });
    if (!before) throw errors.notFound("Service");
    if (input.name !== undefined) await this.assertNameFree(input.name, id);
    const fields = changedFields(before, input);
    const row = await this.db.$transaction(async (tx) => {
      const updated = await tx.service.update({
        where: { id },
        data: { ...input, ...(input.name !== undefined ? { nameKey: labelKey(input.name) } : {}) },
        include: serviceInclude,
      });
      await auditCatalogUpdate(tx, "service", "Service", id, fields, before.isActive, input.isActive, meta);
      return updated;
    });
    return toServiceDto(row);
  }
}

// ── Industries ──────────────────────────────────────────────────────────────
type IndustryRow = Prisma.IndustryGetPayload<{
  include: { services: { select: { serviceId: true } }; _count: { select: { leads: true } } };
}>;
const industryInclude = { services: { select: { serviceId: true } }, _count: { select: { leads: true } } } as const;

function toIndustryDto(i: IndustryRow): IndustryDto {
  return {
    id: i.id,
    name: i.name,
    description: i.description,
    aiGuidance: i.aiGuidance,
    isActive: i.isActive,
    sortOrder: i.sortOrder,
    serviceIds: i.services.map((s) => s.serviceId),
    leadCount: i._count.leads,
    updatedAt: i.updatedAt.toISOString(),
  };
}

export class IndustriesService {
  constructor(private readonly db: Db) {}

  async list(query: CatalogQuery): Promise<{ data: IndustryDto[] }> {
    const rows = await this.db.industry.findMany({
      where: {
        ...statusFilter(query.status),
        ...(query.q ? { name: { contains: query.q, mode: "insensitive" } } : {}),
      },
      include: industryInclude,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return { data: rows.map(toIndustryDto) };
  }

  private async assertNameFree(name: string, exceptId?: string) {
    const existing = await this.db.industry.findUnique({ where: { nameKey: labelKey(name) } });
    if (existing && existing.id !== exceptId) throw errors.conflict(`An industry called "${existing.name}" already exists.`);
  }

  private async assertServicesExist(serviceIds: string[]) {
    const unique = [...new Set(serviceIds)];
    const found = await this.db.service.count({ where: { id: { in: unique } } });
    if (found !== unique.length) {
      throw new AppError(400, "VALIDATION_FAILED", "One of the selected services no longer exists. Reload and try again.", {
        serviceIds: ["Unknown service."],
      });
    }
    return unique;
  }

  async create(input: CreateIndustryInput, meta: ActorMeta): Promise<IndustryDto> {
    await this.assertNameFree(input.name);
    const serviceIds = input.serviceIds ? await this.assertServicesExist(input.serviceIds) : [];
    const row = await this.db.$transaction(async (tx) => {
      const max = await tx.industry.aggregate({ _max: { sortOrder: true } });
      const created = await tx.industry.create({
        data: {
          name: input.name,
          nameKey: labelKey(input.name),
          description: input.description ?? null,
          aiGuidance: input.aiGuidance ?? null,
          sortOrder: input.sortOrder ?? (max._max.sortOrder ?? 0) + 10,
          services: { create: serviceIds.map((serviceId) => ({ serviceId })) },
        },
        include: industryInclude,
      });
      await recordAudit(tx, {
        action: "industry.created",
        entityType: "Industry",
        entityId: created.id,
        meta: { name: created.name, suggestedServices: serviceIds.length },
        ...meta,
      });
      return created;
    });
    return toIndustryDto(row);
  }

  async update(id: string, input: UpdateIndustryInput, meta: ActorMeta): Promise<IndustryDto> {
    const before = await this.db.industry.findUnique({ where: { id }, include: { services: { select: { serviceId: true } } } });
    if (!before) throw errors.notFound("Industry");
    if (input.name !== undefined) await this.assertNameFree(input.name, id);
    const { serviceIds, ...rest } = input;
    const newServiceIds = serviceIds ? await this.assertServicesExist(serviceIds) : undefined;
    const fields = changedFields(before as unknown as Record<string, unknown>, rest);
    const servicesChanged =
      newServiceIds !== undefined &&
      JSON.stringify([...newServiceIds].sort()) !== JSON.stringify(before.services.map((s) => s.serviceId).sort());
    if (servicesChanged) fields.push("suggestedServices");

    const row = await this.db.$transaction(async (tx) => {
      if (servicesChanged && newServiceIds) {
        await tx.industryService.deleteMany({ where: { industryId: id } });
        if (newServiceIds.length) await tx.industryService.createMany({ data: newServiceIds.map((serviceId) => ({ industryId: id, serviceId })) });
      }
      const updated = await tx.industry.update({
        where: { id },
        data: { ...rest, ...(rest.name !== undefined ? { nameKey: labelKey(rest.name) } : {}) },
        include: industryInclude,
      });
      await auditCatalogUpdate(tx, "industry", "Industry", id, fields, before.isActive, input.isActive, meta);
      return updated;
    });
    return toIndustryDto(row);
  }
}

// ── Cities & areas ──────────────────────────────────────────────────────────
type AreaRow = Prisma.AreaGetPayload<{ include: { city: { select: { name: true } }; _count: { select: { leads: true } } } }>;
const areaInclude = { city: { select: { name: true } }, _count: { select: { leads: true } } } as const;

function toAreaDto(a: AreaRow): AreaDto {
  return {
    id: a.id,
    cityId: a.cityId,
    cityName: a.city.name,
    name: a.name,
    isActive: a.isActive,
    sortOrder: a.sortOrder,
    leadCount: a._count.leads,
  };
}

export class LocationsService {
  constructor(private readonly db: Db) {}

  async listCities(): Promise<{ data: CityDto[] }> {
    const rows = await this.db.city.findMany({
      include: { _count: { select: { areas: true } } },
      orderBy: { name: "asc" },
    });
    return {
      data: rows.map((c) => ({ id: c.id, name: c.name, state: c.state, isActive: c.isActive, areaCount: c._count.areas })),
    };
  }

  async listAreas(query: CatalogQuery): Promise<{ data: AreaDto[] }> {
    const rows = await this.db.area.findMany({
      where: {
        ...statusFilter(query.status),
        ...(query.cityId ? { cityId: query.cityId } : {}),
        ...(query.q ? { name: { contains: query.q, mode: "insensitive" } } : {}),
      },
      include: areaInclude,
      orderBy: [{ city: { name: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
    });
    return { data: rows.map(toAreaDto) };
  }

  private async assertAreaNameFree(cityId: string, name: string, exceptId?: string) {
    const existing = await this.db.area.findUnique({ where: { cityId_nameKey: { cityId, nameKey: labelKey(name) } } });
    if (existing && existing.id !== exceptId) throw errors.conflict(`"${existing.name}" already exists in this city.`);
  }

  async createArea(input: CreateAreaInput, meta: ActorMeta): Promise<AreaDto> {
    const city = await this.db.city.findUnique({ where: { id: input.cityId } });
    if (!city) throw errors.validation("Choose a city.", { cityId: ["Unknown city."] });
    await this.assertAreaNameFree(city.id, input.name);
    const row = await this.db.$transaction(async (tx) => {
      const max = await tx.area.aggregate({ where: { cityId: city.id }, _max: { sortOrder: true } });
      const created = await tx.area.create({
        data: {
          cityId: city.id,
          name: input.name,
          nameKey: labelKey(input.name),
          sortOrder: input.sortOrder ?? (max._max.sortOrder ?? 0) + 10,
        },
        include: areaInclude,
      });
      await recordAudit(tx, {
        action: "area.created",
        entityType: "Area",
        entityId: created.id,
        meta: { name: created.name, city: city.name },
        ...meta,
      });
      return created;
    });
    return toAreaDto(row);
  }

  async updateArea(id: string, input: UpdateAreaInput, meta: ActorMeta): Promise<AreaDto> {
    const before = await this.db.area.findUnique({ where: { id } });
    if (!before) throw errors.notFound("Area");
    if (input.name !== undefined) await this.assertAreaNameFree(before.cityId, input.name, id);
    const fields = changedFields(before, input);
    const row = await this.db.$transaction(async (tx) => {
      const updated = await tx.area.update({
        where: { id },
        data: { ...input, ...(input.name !== undefined ? { nameKey: labelKey(input.name) } : {}) },
        include: areaInclude,
      });
      await auditCatalogUpdate(tx, "area", "Area", id, fields, before.isActive, input.isActive, meta);
      return updated;
    });
    return toAreaDto(row);
  }
}

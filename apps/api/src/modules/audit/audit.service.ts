import type { Db, Prisma } from "@prosolution/db";
import type { AuditAction, AuditLogDto, ListAuditQuery, Paginated } from "@prosolution/shared";
import type { Request } from "express";

/** Either the main client or a transaction client, so audit rows commit with the change they describe. */
type DbOrTx = Pick<Db, "auditLog">;

export interface AuditEntry {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  actorId?: string | null;
  leadId?: string | null;
  campaignId?: string | null;
  previousStatus?: string | null;
  newStatus?: string | null;
  meta?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/** Request details recorded with every audit row. */
export function auditContext(req: Request) {
  return {
    actorId: req.auth?.user.id ?? null,
    ip: req.ip ?? null,
    userAgent: req.get("user-agent")?.slice(0, 300) ?? null,
    requestId: String(req.id ?? "") || null,
  };
}

export type ActorMeta = ReturnType<typeof auditContext>;

export async function recordAudit(db: DbOrTx, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      actorId: entry.actorId ?? null,
      leadId: entry.leadId ?? null,
      campaignId: entry.campaignId ?? null,
      previousStatus: entry.previousStatus ?? null,
      newStatus: entry.newStatus ?? null,
      ...(entry.meta !== undefined ? { meta: entry.meta } : {}),
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
      requestId: entry.requestId ?? null,
    },
  });
}

export async function listAudit(db: Db, query: ListAuditQuery): Promise<Paginated<AuditLogDto>> {
  const where: Prisma.AuditLogWhereInput = {
    ...(query.action ? { action: query.action } : {}),
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.from || query.to
      ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { actor: { select: { id: true, name: true, email: true } } },
    }),
    db.auditLog.count({ where }),
  ]);
  return {
    data: rows.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      actor: r.actor,
      leadId: r.leadId,
      campaignId: r.campaignId,
      previousStatus: r.previousStatus,
      newStatus: r.newStatus,
      meta: (r.meta as Record<string, unknown> | null) ?? null,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

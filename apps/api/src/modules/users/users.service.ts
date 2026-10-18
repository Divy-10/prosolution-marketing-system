import { hashPassword, type Db, type Prisma, type User } from "@prosolution/db";
import type {
  CreateUserInput,
  ListUsersQuery,
  Paginated,
  ResetPasswordInput,
  UpdateUserInput,
  UserDto,
} from "@prosolution/shared";
import { errors } from "../../lib/errors.ts";
import { recordAudit } from "../audit/audit.service.ts";
import { toUserDto } from "./user.mapper.ts";

interface ActorMeta {
  actorId: string | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export class UsersService {
  constructor(private readonly db: Db) {}

  async list(query: ListUsersQuery): Promise<Paginated<UserDto>> {
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status === "active" ? { isActive: true } : query.status === "inactive" ? { isActive: false } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" } },
              { email: { contains: query.q.toLowerCase() } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.user.findMany({
        where,
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.user.count({ where }),
    ]);
    return { data: rows.map(toUserDto), page: query.page, pageSize: query.pageSize, total };
  }

  async get(id: string): Promise<UserDto> {
    const user = await this.db.user.findUnique({ where: { id } });
    if (!user) throw errors.notFound("User");
    return toUserDto(user);
  }

  async create(input: CreateUserInput, meta: ActorMeta): Promise<UserDto> {
    const existing = await this.db.user.findUnique({ where: { email: input.email } });
    if (existing) throw errors.conflict("A user with this email already exists.");
    const passwordHash = await hashPassword(input.temporaryPassword);
    const user = await this.db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email: input.email,
          name: input.name,
          role: input.role,
          passwordHash,
          mustChangePassword: true,
        },
      });
      await recordAudit(tx, {
        action: "user.created",
        entityType: "User",
        entityId: u.id,
        newStatus: u.role,
        meta: { email: u.email, name: u.name },
        ...meta,
      });
      return u;
    });
    return toUserDto(user);
  }

  async update(id: string, input: UpdateUserInput, meta: ActorMeta): Promise<UserDto> {
    const target = await this.db.user.findUnique({ where: { id } });
    if (!target) throw errors.notFound("User");

    const isSelf = meta.actorId === id;
    const roleChanging = input.role !== undefined && input.role !== target.role;
    const deactivating = input.isActive === false && target.isActive;
    const reactivating = input.isActive === true && !target.isActive;

    if (isSelf && roleChanging) throw errors.forbidden("You can't change your own role. Ask another admin.");
    if (isSelf && deactivating) throw errors.forbidden("You can't deactivate your own account.");

    const losesAdmin = target.role === "ADMIN" && target.isActive && (deactivating || (roleChanging && input.role !== "ADMIN"));

    const updated = await this.db.$transaction(async (tx) => {
      if (losesAdmin) {
        const otherAdmins = await tx.user.count({ where: { role: "ADMIN", isActive: true, id: { not: id } } });
        if (otherAdmins === 0) throw errors.conflict("This is the last active admin. Make someone else an admin first.");
      }
      const u = await tx.user.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(reactivating ? { failedLoginCount: 0, lockedUntil: null } : {}),
        },
      });
      // Role or access changes take effect immediately: end the user's sessions.
      if (roleChanging || deactivating) await tx.session.deleteMany({ where: { userId: id } });

      if (roleChanging) {
        await recordAudit(tx, {
          action: "user.role_changed",
          entityType: "User",
          entityId: id,
          previousStatus: target.role,
          newStatus: u.role,
          ...meta,
        });
      }
      if (deactivating || reactivating) {
        await recordAudit(tx, {
          action: deactivating ? "user.deactivated" : "user.reactivated",
          entityType: "User",
          entityId: id,
          previousStatus: target.isActive ? "ACTIVE" : "INACTIVE",
          newStatus: u.isActive ? "ACTIVE" : "INACTIVE",
          ...meta,
        });
      }
      if (input.name !== undefined && input.name !== target.name) {
        await recordAudit(tx, {
          action: "user.updated",
          entityType: "User",
          entityId: id,
          meta: { field: "name", from: target.name, to: u.name },
          ...meta,
        });
      }
      return u;
    }, losesAdmin ? { isolationLevel: "Serializable" } : undefined);
    // Serializable makes two simultaneous "remove admin" requests unable to both succeed.
    return toUserDto(updated);
  }

  async resetPassword(id: string, input: ResetPasswordInput, meta: ActorMeta): Promise<UserDto> {
    const target = await this.db.user.findUnique({ where: { id } });
    if (!target) throw errors.notFound("User");
    if (meta.actorId === id) throw errors.forbidden("Use Account → Change password for your own password.");
    const passwordHash = await hashPassword(input.temporaryPassword);
    const updated: User = await this.db.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null },
      });
      await tx.session.deleteMany({ where: { userId: id } });
      await recordAudit(tx, { action: "user.password_reset", entityType: "User", entityId: id, ...meta });
      return u;
    });
    return toUserDto(updated);
  }
}

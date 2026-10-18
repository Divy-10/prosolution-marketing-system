import { hashPassword, verifyAgainstDummy, verifyPassword, type Db, type User } from "@prosolution/db";
import type { ChangePasswordInput, LoginInput } from "@prosolution/shared";
import type { AppConfig } from "../../config/env.ts";
import { AppError, errors } from "../../lib/errors.ts";
import { recordAudit } from "../audit/audit.service.ts";
import type { NewSession, SessionService } from "./session.service.ts";

interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly config: AppConfig,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Verifies credentials and opens a new session.
   * The same generic error is returned for unknown emails, wrong passwords and
   * deactivated accounts, and timing is equalised, so accounts can't be enumerated.
   */
  async login(input: LoginInput, meta: RequestMeta): Promise<NewSession & { user: User }> {
    const user = await this.db.user.findUnique({ where: { email: input.email } });

    if (!user) {
      await verifyAgainstDummy(input.password);
      await recordAudit(this.db, {
        action: "auth.login_failed",
        entityType: "User",
        meta: { email: input.email, reason: "unknown_email" },
        ...meta,
      });
      throw errors.invalidCredentials();
    }

    const now = Date.now();
    if (user.lockedUntil && user.lockedUntil.getTime() > now) {
      await verifyPassword(user.passwordHash, input.password); // keep timing uniform
      const minutes = Math.max(1, Math.ceil((user.lockedUntil.getTime() - now) / 60_000));
      await recordAudit(this.db, {
        action: "auth.login_failed",
        entityType: "User",
        entityId: user.id,
        meta: { email: input.email, reason: "locked" },
        ...meta,
      });
      throw errors.accountLocked(minutes);
    }

    const passwordOk = await verifyPassword(user.passwordHash, input.password);

    if (!passwordOk || !user.isActive) {
      if (!passwordOk) await this.registerFailure(user, meta);
      else
        await recordAudit(this.db, {
          action: "auth.login_failed",
          entityType: "User",
          entityId: user.id,
          meta: { email: input.email, reason: "inactive" },
          ...meta,
        });
      throw errors.invalidCredentials();
    }

    const updated = await this.db.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    const newSession = await this.sessions.create(user.id, meta);
    await recordAudit(this.db, {
      action: "auth.login_succeeded",
      entityType: "User",
      entityId: user.id,
      actorId: user.id,
      ...meta,
    });
    return { ...newSession, user: updated };
  }

  private async registerFailure(user: User, meta: RequestMeta): Promise<void> {
    const attempts = user.failedLoginCount + 1;
    const lock = attempts >= this.config.login.maxFailedAttempts;
    await this.db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: lock
          ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + this.config.login.lockMs) }
          : { failedLoginCount: attempts },
      });
      await recordAudit(tx, {
        action: "auth.login_failed",
        entityType: "User",
        entityId: user.id,
        meta: { email: user.email, reason: "wrong_password", attempt: attempts },
        ...meta,
      });
      if (lock) {
        await recordAudit(tx, {
          action: "auth.account_locked",
          entityType: "User",
          entityId: user.id,
          meta: { lockMinutes: Math.round(this.config.login.lockMs / 60_000) },
          ...meta,
        });
      }
    });
  }

  async logout(sessionId: string, userId: string, meta: RequestMeta): Promise<void> {
    await this.sessions.revoke(sessionId);
    await recordAudit(this.db, { action: "auth.logout", entityType: "User", entityId: userId, actorId: userId, ...meta });
  }

  async logoutAll(userId: string, meta: RequestMeta): Promise<number> {
    const count = await this.sessions.revokeAllForUser(userId);
    await recordAudit(this.db, {
      action: "auth.logout_all",
      entityType: "User",
      entityId: userId,
      actorId: userId,
      meta: { sessionsRevoked: count },
      ...meta,
    });
    return count;
  }

  /** Changes the password, clears the forced-change flag and signs out every other session. */
  async changePassword(user: User, currentSessionId: string, input: ChangePasswordInput, meta: RequestMeta): Promise<User> {
    const ok = await verifyPassword(user.passwordHash, input.currentPassword);
    if (!ok) {
      throw new AppError(400, "VALIDATION_FAILED", "Your current password is incorrect.", {
        currentPassword: ["Your current password is incorrect."],
      });
    }
    const passwordHash = await hashPassword(input.newPassword);
    const updated = await this.db.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() },
      });
      await tx.session.deleteMany({ where: { userId: user.id, id: { not: currentSessionId } } });
      await recordAudit(tx, {
        action: "auth.password_changed",
        entityType: "User",
        entityId: user.id,
        actorId: user.id,
        meta: { forced: user.mustChangePassword },
        ...meta,
      });
      return u;
    });
    return updated;
  }
}

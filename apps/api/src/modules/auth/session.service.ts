import type { Db, Session, User } from "@prosolution/db";
import type { AppConfig } from "../../config/env.ts";
import { hashToken, randomToken } from "../../lib/crypto.ts";

/** Update lastSeenAt at most this often, to avoid a DB write on every request. */
const TOUCH_INTERVAL_MS = 5 * 60_000;

export interface NewSession {
  token: string;
  session: Session;
}

export class SessionService {
  constructor(
    private readonly db: Db,
    private readonly config: AppConfig,
  ) {}

  async create(userId: string, meta: { ip?: string | null; userAgent?: string | null }): Promise<NewSession> {
    const token = randomToken(32);
    const session = await this.db.session.create({
      data: {
        tokenHash: hashToken(token, this.config.session.secret),
        csrfToken: randomToken(32),
        userId,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
        expiresAt: new Date(Date.now() + this.config.session.absoluteMs),
      },
    });
    return { token, session };
  }

  /** Returns the session and user if the token is valid; deletes it if expired or the user is inactive. */
  async resolve(token: string): Promise<{ session: Session; user: User } | null> {
    const found = await this.db.session.findUnique({
      where: { tokenHash: hashToken(token, this.config.session.secret) },
      include: { user: true },
    });
    if (!found) return null;

    const now = Date.now();
    const idleExpired = now - found.lastSeenAt.getTime() > this.config.session.idleMs;
    const absoluteExpired = found.expiresAt.getTime() <= now;
    if (idleExpired || absoluteExpired || !found.user.isActive) {
      await this.db.session.deleteMany({ where: { id: found.id } });
      return null;
    }

    const { user, ...session } = found;
    if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      session.lastSeenAt = new Date(now);
      await this.db.session.update({ where: { id: session.id }, data: { lastSeenAt: session.lastSeenAt } });
    }
    return { session, user };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.db.session.deleteMany({ where: { id: sessionId } });
  }

  /** Signs a user out everywhere, optionally keeping one session (e.g. the current one). */
  async revokeAllForUser(userId: string, exceptSessionId?: string): Promise<number> {
    const result = await this.db.session.deleteMany({
      where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    });
    return result.count;
  }

  async deleteExpired(): Promise<number> {
    const idleCutoff = new Date(Date.now() - this.config.session.idleMs);
    const result = await this.db.session.deleteMany({
      where: { OR: [{ expiresAt: { lte: new Date() } }, { lastSeenAt: { lt: idleCutoff } }] },
    });
    return result.count;
  }
}

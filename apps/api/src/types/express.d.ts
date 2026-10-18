import type { Session, User } from "@prosolution/db";

export interface AuthContext {
  user: User;
  session: Session;
}

declare global {
  namespace Express {
    interface Request {
      /** Set by the session middleware when the request carries a valid session cookie. */
      auth?: AuthContext;
    }
  }
}

export {};

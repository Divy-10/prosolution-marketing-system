import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";

export { PrismaClient } from "./generated/prisma/client.ts";
export type { Prisma, User, Session, AuditLog } from "./generated/prisma/client.ts";
export { Role as DbRole } from "./generated/prisma/enums.ts";
export { hashPassword, verifyPassword, verifyAgainstDummy } from "./password.ts";

export type Db = InstanceType<typeof PrismaClient>;

export interface CreateDbOptions {
  connectionString: string;
  /** Max pool connections. Defaults to 10. */
  max?: number;
}

/** Creates a Prisma client using the official node-postgres driver adapter. */
export function createDb({ connectionString, max = 10 }: CreateDbOptions): Db {
  const adapter = new PrismaPg({ connectionString, max });
  return new PrismaClient({ adapter });
}

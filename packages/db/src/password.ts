import { randomBytes } from "node:crypto";
import { hash, verify, type Options } from "@node-rs/argon2";

/** Algorithm.Argon2id (a const enum, which can't be imported under isolatedModules). */
const ARGON2ID = 2;

/**
 * Argon2id with OWASP-recommended minimum parameters
 * (19 MiB memory, 2 iterations, 1 lane).
 */
const OPTIONS: Options = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    // Malformed hash: treat as a failed match, never as a crash.
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Burns the same CPU time as a real check. Used when the email doesn't exist,
 * so sign-in timing doesn't reveal which accounts exist.
 */
export async function verifyAgainstDummy(plain: string): Promise<false> {
  dummyHash ??= hash(randomBytes(32).toString("hex"), OPTIONS);
  await verifyPassword(await dummyHash, plain);
  return false;
}

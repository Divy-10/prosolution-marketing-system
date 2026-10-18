/**
 * Creates the first ADMIN account.
 *
 *   pnpm seed:admin                     → asks for email, name and password
 *   pnpm seed:admin --non-interactive   → reads SEED_ADMIN_EMAIL / _NAME / _PASSWORD from .env
 *
 * There is no default admin password anywhere in the codebase.
 * Refuses to run if an active admin already exists (add more admins from the Users page).
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { emailSchema, nameSchema, passwordSchema } from "@prosolution/shared";
import { createDb, hashPassword } from "../src/index.ts";

loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"), quiet: true });

const nonInteractive = process.argv.includes("--non-interactive");

function fail(message: string): never {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

/** Reads a line without echoing it (works in Windows Terminal, PowerShell and cmd). */
async function askHidden(question: string): Promise<string> {
  if (!stdin.isTTY) fail("Password input needs an interactive terminal. Use --non-interactive with SEED_ADMIN_* in .env instead.");
  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  let value = "";
  return new Promise((resolve) => {
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === "\r" || c === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (c === "\u0003") {
          stdout.write("\n");
          process.exit(130);
        }
        if (c === "\u007f" || c === "\b") value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on("data", onData);
  });
}

async function collectInput() {
  if (nonInteractive) {
    return {
      email: process.env.SEED_ADMIN_EMAIL ?? "",
      name: process.env.SEED_ADMIN_NAME ?? "",
      password: process.env.SEED_ADMIN_PASSWORD ?? "",
    };
  }
  const rl = createInterface({ input: stdin, output: stdout });
  const email = await rl.question("Admin email: ");
  const name = await rl.question("Admin name: ");
  rl.close();
  const password = await askHidden("Password (min 12 characters, hidden): ");
  const confirm = await askHidden("Repeat password: ");
  if (password !== confirm) fail("Passwords don't match.");
  return { email, name, password };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");

  const input = await collectInput();
  const email = emailSchema.safeParse(input.email);
  const name = nameSchema.safeParse(input.name);
  const password = passwordSchema.safeParse(input.password);
  if (!email.success) fail(email.error.issues[0]?.message ?? "Invalid email.");
  if (!name.success) fail(name.error.issues[0]?.message ?? "Invalid name.");
  if (!password.success) fail(password.error.issues[0]?.message ?? "Invalid password.");

  const db = createDb({ connectionString: url, max: 1 });
  try {
    const existingAdmin = await db.user.findFirst({ where: { role: "ADMIN", isActive: true } });
    if (existingAdmin) {
      fail(`An active admin already exists (${existingAdmin.email}). Add more users from Settings → Users.`);
    }
    const taken = await db.user.findUnique({ where: { email: email.data } });
    if (taken) fail(`A user with email ${email.data} already exists.`);

    const passwordHash = await hashPassword(password.data);
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: email.data,
          name: name.data,
          passwordHash,
          role: "ADMIN",
          mustChangePassword: false,
          passwordChangedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: null,
          action: "system.admin_seeded",
          entityType: "User",
          entityId: user.id,
          newStatus: "ADMIN",
          meta: { email: user.email, via: nonInteractive ? "cli-non-interactive" : "cli" },
        },
      });
    });
    console.log(`\n✔ Admin ${email.data} created. Start the app with \`pnpm dev\` and sign in.`);
    if (nonInteractive) {
      console.log("  Now remove SEED_ADMIN_PASSWORD from your .env file.");
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  if (/ECONNREFUSED|Can't reach database/i.test(message)) {
    fail("Can't reach the database. Is Docker running? Try `pnpm services:up`.");
  }
  fail(message);
});

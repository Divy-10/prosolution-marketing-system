// Fails the build if anything secret-looking ends up in the browser bundle.
// Checks (1) names of server-only variables and (2) the actual values from .env.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const distDir = join(root, "apps", "web", "dist");

if (!existsSync(distDir)) {
  console.error("check-bundle-secrets: apps/web/dist not found — build the web app first.");
  process.exit(1);
}

const forbiddenNames = [
  "SESSION_SECRET",
  "DATABASE_URL",
  "TEST_DATABASE_URL",
  "POSTGRES_PASSWORD",
  "ANTHROPIC_API_KEY",
  "CLAUDE_API_KEY",
  "META_APP_SECRET",
  "META_ACCESS_TOKEN",
  "TOKEN_ENCRYPTION_KEY",
  "GOOGLE_PLACES_API_KEY",
  "SMTP_PASS",
  "SEED_ADMIN_PASSWORD",
];

// Collect real secret values from .env (if present) so we also catch leaked values.
const secretValues = [];
const envPath = join(root, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, raw] = m;
    const value = raw.replace(/^["']|["']$/g, "");
    if (forbiddenNames.includes(key) && value.length >= 8) secretValues.push(value);
  }
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

const problems = [];
for (const file of walk(distDir)) {
  if (!/\.(js|mjs|css|html|map|json|txt)$/.test(file)) continue;
  const text = readFileSync(file, "utf8");
  for (const name of forbiddenNames) {
    if (text.includes(name)) problems.push(`${file}: contains variable name ${name}`);
  }
  for (const value of secretValues) {
    if (text.includes(value)) problems.push(`${file}: contains a secret value from .env`);
  }
}

if (problems.length) {
  console.error("Secret check FAILED:\n" + problems.join("\n"));
  process.exit(1);
}
console.log(`Secret check passed: no server secrets found in apps/web/dist (${secretValues.length} .env values checked).`);

// Prints fresh random secrets to paste into .env. Nothing is written to disk.
import { randomBytes } from "node:crypto";

const hex = (n) => randomBytes(n).toString("hex");
const b64 = (n) => randomBytes(n).toString("base64");
const dbPassword = randomBytes(18).toString("base64url");

console.log(`# Paste these into your .env (do not commit):
SESSION_SECRET=${hex(64)}
POSTGRES_PASSWORD=${dbPassword}
# Remember to put the same password into DATABASE_URL and TEST_DATABASE_URL.

# For Phase 7 (keep for later):
# TOKEN_ENCRYPTION_KEY=${b64(32)}
`);

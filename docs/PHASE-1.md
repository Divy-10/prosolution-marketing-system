# Phase 1 — Foundation

**Status:** complete. Awaiting approval before Phase 2.

## What was built

| Area | Delivered |
|---|---|
| Project structure | pnpm monorepo: `apps/api`, `apps/web`, `packages/shared`, `packages/db`. Every dependency pinned to an exact version. |
| Configuration | One root `.env`, validated with Zod at start-up. Errors name the variable but never print its value. Placeholder values are rejected. Production rules: https only, longer secret, `__Host-` secure cookie. `.env.example` holds placeholders only. |
| Database | PostgreSQL 16 through Docker. Prisma 7 with the official `pg` driver adapter. First migration creates `User`, `Session` and `AuditLog`. A database trigger makes the audit log append-only. |
| Authentication | Email + password with Argon2id (OWASP parameters). Sign-in timing is equalised, so it doesn't reveal which accounts exist. Lockout after N failures (default 10, 15 minutes). Per-network sign-in rate limit. |
| Sessions | Server-side. Only an HMAC of the token is stored. Cookie is HttpOnly + SameSite=Strict. 8-hour idle and 7-day absolute expiry. A new session on every sign-in. Sign out, sign out everywhere, and other sessions end automatically after a password change, role change, deactivation or password reset. |
| CSRF / cross-site | Per-session CSRF token on every state-changing request, plus an Origin/Sec-Fetch-Site check. |
| Authorisation | Permission map in `packages/shared/src/roles.ts`, enforced by API middleware. Admins can't change their own role or deactivate themselves. A Serializable transaction guarantees at least one active admin always remains. |
| Users (admin) | List, search, filter, paginate, create (temporary password, forced change), change role, deactivate/reactivate, reset password. |
| Audit log | Records actor, action, entity, before/after status, IP, user agent, request ID. Admin-only, filterable, paginated. No API to edit or delete. |
| Errors | One JSON error shape for every failure. Validation errors carry per-field messages. Unknown errors become a generic 500 with a request ID; details go to the server log only. Logs redact passwords, cookies and tokens. |
| Security headers | API: strict CSP (`default-src 'none'`), no framing, nosniff, no-referrer, `Cache-Control: no-store`, no `X-Powered-By`. Web build: CSP meta tag (scripts limited to self). |
| Web app | Sign-in, forced password change, overview with the pipeline map and workspace status, users, audit log, account, and role-aware navigation. Placeholders say which phase delivers each screen. Responsive down to phone width. Loading, empty and error states, toasts, confirmation dialogs. |
| Tests | **74 automated tests**: 47 API integration tests against a real Postgres, 15 web, 12 shared. |
| Mocks | None in Phase 1, because no external integrations exist yet. Phase 5 and 7 adapters will put a "MOCK" label in the UI. |

## Verified before hand-over

- `pnpm check` passes: type checks, 74/74 tests, production build, bundle secret scan. Run on **Node 22.22.0 and 24.22.0** with PostgreSQL 16 on Linux.
- A browser walkthrough of the built app, with a real API and database:
  - Sign-in is refused for a wrong password and works with the right one.
  - The admin adds a user and changes that user's role through the confirmation dialog.
  - The audit log shows every step.
  - The new user is forced to change the temporary password, then sees only the screens their role allows.
  - At phone width there's no horizontal scrolling.
  - No CSP violations or script errors in the console.
- Sign-in from a different origin was blocked, as designed.

## Known limitations

1. **The migration SQL was written by hand.** My build environment couldn't download Prisma's migration engine, so I wrote `migration.sql` in Prisma's exact format.
   - It has been applied to PostgreSQL 16 and exercised by the 47 integration tests.
   - Prisma itself hasn't yet confirmed that it matches `schema.prisma`. Run `pnpm db:check-drift` on your PC, which does have the engine; it should report no differences.
2. **The automated tests rebuild the test database** by applying the migration SQL directly, not through `prisma migrate`. Your main database uses `pnpm db:migrate`.
3. **Not yet run on Windows.** Everything is written to be cross-platform: no shell-specific scripts, paths through Node, LF line endings enforced. Your first run is the Windows check.
4. **Rate limiting is in-memory**, which is fine for one local API process. It moves to Redis when the API runs as several processes.
5. **Redis is running but unused** until the job queues in Phase 5.
6. **No two-factor sign-in** yet (planned for Phase 12). No self-service "forgot password" email: an admin resets it, and email arrives with notifications in Phase 10.
7. **The web CSP allows inline styles** (needed by the dialog library's scroll lock). Scripts stay strict. The full HTTP-header CSP comes with the production server in Phase 12.
8. **The web bundle is 467 kB** (143 kB gzipped). Code splitting can come later; it's fine for an internal tool.

## Before Phase 2

1. Follow `docs/SETUP-WINDOWS.md`. Confirm `pnpm check` passes, `pnpm db:check-drift` reports no differences, and you can sign in.
2. Look through the screens and tell me anything to change in the design or wording.
3. Confirm the Phase 2 inputs:
   - The initial **industries**: the 11 in the Service Profile.
   - The **Surat areas**: Vesu, Adajan, City Light, Piplod, Pal, Dumas. Anything to add?
   - Whether to seed the **service knowledge base** from the Service Profile, with no prices.
   - A **retention period** for leads that are never contacted (proposed: 180 days).
4. Optional: initialise Git and push to a private GitHub repository. I can do this if you connect GitHub.
5. In parallel: start Meta Business Verification. It takes calendar time and doesn't depend on code.

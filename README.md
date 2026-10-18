# ProSolution Outreach

Internal AI outreach and lead-management platform for **ProSolution Infotech**: *Grow Your Business Digitally*.

- **Status:** Phase 1 of 12 (foundation) is complete. See `docs/PHASE-1.md`.
- **Plan:** `docs/ARCHITECTURE.md`
- **Setup on Windows:** `docs/SETUP-WINDOWS.md`
- **What was checked against official sources:** `docs/VERIFICATION.md`

## What Phase 1 includes

- **Sign-in.** Server-side sessions in an HttpOnly, SameSite=Strict cookie. Passwords are hashed with Argon2id. CSRF tokens and origin checks protect every change. Accounts lock after repeated failures, and each network is rate-limited.
- **Roles.** Admin, Sales manager, Sales user and Viewer are defined once in `packages/shared` and enforced by the API.
- **User management** for admins: add users with temporary passwords (forced change at first sign-in), change roles, deactivate, and reset passwords. The last admin can never be removed.
- **Append-only audit log.** The database itself refuses edits and deletions. Every sign-in and user change is recorded with who, what, before and after, IP and request ID.
- **App shell.** Brand design system, responsive layout, loading, empty and error states, toasts, confirmation dialogs, and clearly labelled placeholders for later phases.

## Repository layout

```
apps/api         Express 5 + TypeScript API
apps/web         React + Vite web app
packages/shared  Roles, permissions, Zod schemas and API types used by both
packages/db      Prisma schema, migrations, DB client, admin seeding
infra            Docker Compose for local Postgres + Redis
docs             Architecture, setup, verification, phase notes
brand            Logo source
```

## Common commands

| Command | What it does |
|---|---|
| `pnpm services:up` | Start local Postgres and Redis in Docker |
| `pnpm db:migrate` | Apply database migrations |
| `pnpm db:check-drift` | Confirm the database matches the Prisma schema |
| `pnpm seed:admin` | Create the first admin (interactive) |
| `pnpm dev` | Run API and web app at http://localhost:5173 |
| `pnpm check` | Type checks, all tests, production build and the bundle secret scan |

## Security rules for contributors

- Secrets live only in `.env`, which Git ignores. `.env.example` contains placeholders only.
- The web app gets no environment variables. `pnpm build` fails if a server secret name or value appears in the bundle.
- Every state change goes through a service that writes an audit row in the same transaction.
- Outbound messaging always requires human approval by default (`HUMAN_APPROVAL_REQUIRED=true`).
- Instagram integration uses official Meta APIs only. No password logins, no browser automation, no scraping.

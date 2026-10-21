# Windows setup — ProSolution Outreach (local development)

These steps take about 20 minutes the first time. Run the commands in **PowerShell** (Windows Terminal is fine). Every command is run from `D:\prosolution` unless a step says otherwise.

## 1. Install the tools (once)

```powershell
winget install OpenJS.NodeJS.LTS      # Node.js 24 LTS
winget install Git.Git
winget install Docker.DockerDesktop   # accept the WSL 2 option, then restart Windows
```

Close and reopen PowerShell, then:

```powershell
npm install -g pnpm@10.28.0
node -v      # should print v24.x (v22.12+ also works)
pnpm -v      # 10.28.0
docker version
```

> If PowerShell says *"running scripts is disabled on this system"* when you run `pnpm`, run this once:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

Start **Docker Desktop** and wait until it shows "Engine running".

## 2. Create your `.env`

```powershell
cd D:\prosolution
copy .env.example .env
node scripts\generate-secrets.mjs
```

Open `.env` in an editor and make these changes:

1. Set `SESSION_SECRET` to the generated value.
2. Set `POSTGRES_PASSWORD` to the generated value.
3. Put **the same password** into `DATABASE_URL` and `TEST_DATABASE_URL`, replacing `replace-with-a-local-db-password`.
4. Leave everything else as it is.

`.env` holds your secrets. Git ignores it, and it is never sent to the browser.

## 3. Install dependencies

```powershell
pnpm install
```

## 4. Start Postgres and Redis

```powershell
pnpm services:up
docker ps          # shows prosolution-dev-postgres-1 and prosolution-dev-redis-1 as "healthy"
```

The first start also creates the test database `prosolution_test`.

## 5. Create the database tables

```powershell
pnpm db:migrate
pnpm db:check-drift
```

- `db:migrate` applies the migrations in `packages/db/prisma/migrations`. The first run downloads Prisma's migration engine for Windows.
- `db:check-drift` compares the live database with `schema.prisma`. **It should report no differences and exit without error.** If it lists differences, send me the output before going further.

## 5b. Load the starting configuration

```powershell
pnpm db:seed
```

This loads ProSolution's company profile, 11 services, 16 industries and Surat's 12 areas. It's safe to run again: it only adds what is missing and never overwrites your edits. It creates no leads.

## 6. Create your admin account

```powershell
pnpm seed:admin
```

It asks for your email, name and a password of at least 12 characters (the password is hidden as you type). There is no default admin password anywhere in the code.

## 7. Check that everything works

```powershell
pnpm check
```

This runs type checks, all automated tests (against `prosolution_test`, never your main database), the production build, and a scan that fails if a server secret ends up in the browser bundle. The expected result (Phase 2) is 158 passing tests (42 shared, 25 web, 91 API) and "Secret check passed".

## 8. Run the app

```powershell
pnpm dev
```

Open **http://localhost:5173** and sign in. The API runs on http://127.0.0.1:4000 behind the web dev server. Stop both with `Ctrl+C`.

> Use exactly `http://localhost:5173`, the address set in `APP_URL`. If you open `http://127.0.0.1:5173` instead, sign-in is refused with "it came from another website". That's the cross-site protection doing its job.

## Daily use

| Task | Command |
|---|---|
| Start Postgres/Redis after a reboot | `pnpm services:up` |
| Run the app | `pnpm dev` |
| Run tests | `pnpm test` |
| Full check before handing over a change | `pnpm check` |
| Browse the database | `pnpm db:studio` |
| Stop Postgres/Redis | `pnpm services:down` |

## Putting it in Git

```powershell
git init
git check-ignore .env      # must print ".env" — proof it won't be committed
git add .
git status                 # make sure no .env file is listed
git commit -m "Phase 1: foundation"
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Can't reach the database` | Start Docker Desktop, then `pnpm services:up`. |
| Port 5432 already in use (another Postgres installed) | Set `POSTGRES_PORT=5433` in `.env` and change `:5432` to `:5433` in both database URLs. Then run `pnpm services:down` and `pnpm services:up`. |
| Tests fail with `database "prosolution_test" does not exist` | `docker exec -it prosolution-dev-postgres-1 createdb -U prosolution prosolution_test` |
| `Invalid environment configuration` when starting | The message names each variable that's missing or still has its placeholder. Fix those in `.env`. |
| Locked out after too many wrong passwords | Wait 15 minutes, or have another admin reset your password. |
| Start the database completely fresh (**deletes all local data**) | `pnpm services:down`, then `docker volume rm prosolution-dev_pgdata`, then repeat steps 4–6. |

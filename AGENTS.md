# AGENTS.md

## Cursor Cloud specific instructions

Remnawave Cabinet is a single **Next.js 14 (App Router) + Prisma + PostgreSQL** app (UI + API routes in `src/app`). Standard commands live in `package.json` `scripts`; deployment docs are in `README.md` / `DEPLOYMENT.md`. Notes below cover only non-obvious local/dev caveats.

### Services
- **PostgreSQL** (required): installed via apt as cluster `16/main` on port `5432`. It does NOT auto-start on VM boot — start it first: `sudo pg_ctlcluster 16 main start`. DB/user are `cabinet/cabinet/cabinet`, matching `DATABASE_URL` in `.env.example`.
- **Next.js dev app** (required): `npm run dev` → http://localhost:3000.
- **Payment reconciler worker** (optional): `npm run worker:payments`. Only needed for full payment→provisioning lifecycle; not required to boot the app.

### Environment file
- `.env` is gitignored (persists in the VM snapshot, not in git). If it is missing, recreate it: `cp .env.example .env` and set `JWT_SECRET` to a 32+ char value (e.g. `openssl rand -hex 32`). In dev, only `DATABASE_URL` and `JWT_SECRET` are strictly required (`scripts/check-env.mjs`); Remnawave/YooKassa/email/Telegram vars are enforced only when `NODE_ENV=production`.

### Database lifecycle (run after starting Postgres)
- Apply migrations: `npm run prisma:deploy` (use `npm run prisma:migrate` only when authoring new migrations).
- Seed starter plans: `npm run db:seed` (idempotent — skips if plans already exist).

### Non-obvious caveats
- **Email verification in dev**: with `EMAIL_VERIFICATION_WEBHOOK_URL` unset, no email is sent — the verification link is printed to the server console/log as `[email-verification] <email>: <url>`. Open that URL (or hit `/api/auth/verify-email?token=...`) to verify an account before login.
- API routes enforce same-origin: direct `curl` POSTs must send a matching `Origin: http://localhost:3000` header or they 403.
- `npm run build` requires Next.js `standalone` output and is intended for the Docker/prod path; for development always use `npm run dev`.

### Checks
- Lint: `npm run lint` · Typecheck: `npm run typecheck` · Tests: `npm run test` (vitest) · Env check: `npm run check:env` · All-in-one: `npm run validate`.

# Repository Guidelines

## Project Structure & Module Organization

- `src/app/` contains routes, pages, layouts, and API handlers.
- `src/components/` contains UI components grouped by area: `admin`, `auth`, `dashboard`, `support`, and shared `ui`.
- `src/lib/` contains business logic, integrations, serializers, auth helpers, and most tests.
- `prisma/` contains `schema.prisma`, migrations, and `seed.ts`.
- `scripts/` contains operational scripts, payment reconciliation, and env checks.
- `deploy/` and `docker-compose*.yml` contain server deployment assets.
- `public/` stores static assets. Runtime uploads should stay ignored unless intentionally versioned.

## Build, Test, and Development Commands

- `npm run dev` starts the local Next.js dev server.
- `npm run build` runs Prisma generate and builds the production app.
- `npm run start` starts the built Next.js app.
- `npm run lint` runs Next.js ESLint checks.
- `npm run typecheck` runs TypeScript without emitting files.
- `npm run test` runs Vitest tests.
- `npm run validate` runs lint, typecheck, and environment validation.
- `npm run prisma:migrate` creates and applies local Prisma migrations.
- `npm run prisma:deploy` applies migrations in production.
- `npm run db:seed` seeds default database data.

## Coding Style & Naming Conventions

Use TypeScript, React function components, and existing local patterns before adding abstractions. Keep indentation at 2 spaces. The codebase generally uses single quotes and no semicolons. Prefer explicit names: `createPayment`, `syncTelegramAccount`, `BroadcastAdmin`. Component files use kebab-case, for example `broadcast-admin.tsx`.

Use Tailwind utilities and shared helpers such as `cn` from `src/lib/cn`. Keep UI text concise and user-facing.

## Testing Guidelines

Tests use Vitest. Place focused tests near the related module, usually in `src/lib/*.test.ts` or nested folders such as `src/lib/auth/*.test.ts`. API route tests may live next to the route.

Run `npm run test` for the full suite, or a focused command such as:

```bash
npx vitest run src/lib/notifications.test.ts
```

## Commit & Pull Request Guidelines

Recent commits use conventional prefixes such as `feat:` and `fix:`. Keep messages imperative and scoped, for example `feat: add broadcast templates`.

Pull requests should include a summary, affected screens or APIs, migration notes if Prisma changed, and screenshots for UI work. Before opening a PR, run `npm run lint`, `npm run typecheck`, and relevant tests.

## Security & Configuration Tips

Do not commit `.env`, production secrets, tokens, database dumps, or uploaded user files. Validate new environment variables through `scripts/check-env.mjs`. For auth, payments, Telegram, Remnawave, and Remnashop changes, prefer server-side checks and permission tests.

# Production deployment

Ready-to-use one-command deployment files for `cabinet.alekseevvp.site` are in `deploy/`:

- `deploy/env.production.alekseevvp.example`
- `deploy/Caddyfile`
- `deploy/docker-compose.server.yml`
- `deploy/deploy.sh`
- `deploy/smoke-check.sh`
- `deploy/RUNBOOK.md`

## 1. Secrets

Create `.env.production` on the server from `deploy/env.production.alekseevvp.example`.

Generate fresh values:

```bash
openssl rand -hex 32 # JWT_SECRET
openssl rand -hex 32 # HEALTHCHECK_TOKEN
```

Use only production YooKassa keys. Do not deploy `test_...` keys.

Rotate any tokens that were used during local development before going live:

- `JWT_SECRET`
- `REMNAWAVE_TOKEN`
- `YOOKASSA_SECRET_KEY`
- `TELEGRAM_CLIENT_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `EMAIL_VERIFICATION_WEBHOOK_SECRET`

## 2. Required server settings

`APP_URL` and `ALLOWED_ORIGINS` must be the public HTTPS cabinet origin:

```env
APP_URL="https://cabinet.alekseevvp.site"
ALLOWED_ORIGINS="https://cabinet.alekseevvp.site"
YOOKASSA_WEBHOOK_URL="https://cabinet.alekseevvp.site/api/webhook/yookassa"
```

`EMAIL_VERIFICATION_WEBHOOK_URL` must send real email, otherwise new users cannot verify accounts.

If remnashop sync is enabled, use a read-only DB user.

## 3. Telegram

In BotFather Web Login settings add:

```text
https://cabinet.alekseevvp.site
https://cabinet.alekseevvp.site/api/me/telegram/oidc/callback
```

Then set:

```env
TELEGRAM_CLIENT_ID="..."
TELEGRAM_CLIENT_SECRET="..."
```

## 4. YooKassa

In YooKassa dashboard add webhook:

```text
POST https://cabinet.alekseevvp.site/api/webhook/yookassa
```

Events:

```text
payment.succeeded
payment.canceled
payment.waiting_for_capture
```

If you know YooKassa source IP/CIDR ranges for your account, set `YOOKASSA_WEBHOOK_ALLOWED_IPS`.

## 5. One-command deploy

For a clean server with built-in PostgreSQL and HTTPS via Caddy:

```bash
curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/install-server.sh | sudo bash
```

The installer creates `/opt/remnawave-cabinet/.env.production` and generates local secrets.
Fill the remaining production values, then run:

```bash
cd /opt/remnawave-cabinet
./deploy/deploy.sh
```

Manual equivalent:

```bash
cp deploy/env.production.alekseevvp.example .env.production
# edit .env.production
./deploy/deploy.sh
```

This starts:

- PostgreSQL
- Prisma migrations
- Next.js app
- Caddy HTTPS reverse proxy

## 6. Manual build and migrate

Run before start:

```bash
npm ci
NODE_ENV=production npm run check:env
npm run prisma:deploy
npm run build
```

Start:

```bash
NODE_ENV=production npm run start
```

Or with the app-only Docker Compose file:

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

Run Prisma migrations outside the runtime container before replacing the app.

## 7. Reverse proxy

Terminate HTTPS at nginx/Caddy/Traefik and proxy to:

```text
http://127.0.0.1:3000
```

Pass these headers:

```text
Host
X-Forwarded-Host
X-Forwarded-Proto
X-Forwarded-For
X-Real-IP
```

For one-command deployment this is already handled by `deploy/docker-compose.server.yml`.
Use `deploy/Caddyfile` or `deploy/nginx.conf` only if you manage the reverse proxy yourself.

## 8. Smoke checks

```bash
curl -H "x-healthcheck-token: $HEALTHCHECK_TOKEN" https://cabinet.alekseevvp.site/api/health
```

Or:

```bash
APP_URL="https://cabinet.alekseevvp.site" HEALTHCHECK_TOKEN="$HEALTHCHECK_TOKEN" bash deploy/smoke-check.sh
```

Then verify:

- registration sends a real email
- email verification redirects to `/login?verified=1`
- login sets `cabinet_session` with `HttpOnly`, `Secure`, `SameSite=Lax`
- Telegram link returns to `/dashboard/settings`
- YooKassa creates payment and webhook provisions subscription
- admin pages are unavailable to regular users

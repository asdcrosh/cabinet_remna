# One-command Server Runbook

This runbook assumes the public cabinet domain is:

```text
https://cabinet.alekseevvp.site
```

## 1. DNS

Create an `A` record:

```text
cabinet.alekseevvp.site -> YOUR_SERVER_IP
```

Wait until it resolves:

```bash
dig +short cabinet.alekseevvp.site
```

## 2. Server packages

Install Docker and Docker Compose plugin.

On Ubuntu/Debian the shortest practical path is:

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker "$USER"
```

Then reconnect to SSH.

## 3. Environment

On the server:

```bash
cp deploy/env.production.alekseevvp.example .env.production
openssl rand -hex 32
openssl rand -hex 32
```

Put the generated values into:

```env
JWT_SECRET="..."
HEALTHCHECK_TOKEN="..."
```

Fill real production values:

- `POSTGRES_PASSWORD`
- the password inside `DATABASE_URL`
- `DATABASE_URL`
- `EMAIL_VERIFICATION_WEBHOOK_URL`
- `REMNAWAVE_TOKEN`
- `YOOKASSA_SECRET_KEY`

Rotate any tokens that were used locally before going live.

Important: `POSTGRES_PASSWORD` and the password inside `DATABASE_URL` must be the same.

## 4. Deploy

Run one command:

```bash
./deploy/deploy.sh
```

This command will:

- validate `.env.production`
- build Docker images
- start PostgreSQL
- run Prisma migrations
- start the app
- start Caddy with HTTPS

## 5. Logs

App logs:

```bash
docker compose -f deploy/docker-compose.server.yml logs -f app
```

All services:

```bash
docker compose -f deploy/docker-compose.server.yml ps
```

Restart:

```bash
docker compose -f deploy/docker-compose.server.yml restart app
```

Stop:

```bash
docker compose -f deploy/docker-compose.server.yml down
```

Do not remove Docker volumes unless you intentionally want to delete the database.

## 6. YooKassa

Set webhook URL in YooKassa:

```text
https://cabinet.alekseevvp.site/api/webhook/yookassa
```

Events:

```text
payment.succeeded
payment.canceled
payment.waiting_for_capture
```

## 7. Smoke Check

```bash
export APP_URL="https://cabinet.alekseevvp.site"
export HEALTHCHECK_TOKEN="..."
bash deploy/smoke-check.sh
```

Then check manually:

- register a new user
- verify email
- buy a small tariff
- return from YooKassa
- open `/dashboard/subscription`
- confirm QR/link is visible

## 8. Backups

Create a database backup:

```bash
docker compose -f deploy/docker-compose.server.yml exec db pg_dump -U cabinet cabinet > cabinet_backup.sql
```

Restore only when you understand that it overwrites data.

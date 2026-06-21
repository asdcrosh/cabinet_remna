# One-command Server Runbook

This runbook assumes the public cabinet domain is:

```text
https://ВСТАВЬ_СЮДА_ДОМЕН_КАБИНЕТА
```

## 1. DNS

Create an `A` record:

```text
ВСТАВЬ_СЮДА_ДОМЕН_КАБИНЕТА -> YOUR_SERVER_IP
```

Wait until it resolves:

```bash
dig +short ВСТАВЬ_СЮДА_ДОМЕН_КАБИНЕТА
```

## 2. Server packages

Fast path on a clean Ubuntu/Debian server:

```bash
curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/install-server.sh | sudo bash
```

The installer will:

- install Docker, Docker Compose plugin and Git
- clone the project to `/opt/remnawave-cabinet`
- create `.env.production`
- generate database password, `JWT_SECRET` and `HEALTHCHECK_TOKEN`
- tell you which production values still need to be filled

After editing `.env.production`, run:

```bash
cd /opt/remnawave-cabinet
./deploy/deploy.sh
```

If you want to install Docker manually instead:

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker "$USER"
```

Then reconnect to SSH.

## 3. Environment

On the server:

```bash
cp deploy/env.production.example .env.production
openssl rand -hex 32
openssl rand -hex 32
```

Put the generated values into:

```env
JWT_SECRET="..."
HEALTHCHECK_TOKEN="..."
```

Fill real production values:

- `CABINET_DOMAIN`
- `POSTGRES_PASSWORD`
- the password inside `DATABASE_URL`
- `DATABASE_URL`
- `EMAIL_VERIFICATION_WEBHOOK_URL`
- `REMNAWAVE_BASE_URL`
- `REMNAWAVE_TOKEN`
- `REMNAWAVE_INTERNAL_SQUAD_UUIDS`
- `YOOKASSA_SHOP_ID`
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
https://ВСТАВЬ_СЮДА_ДОМЕН_КАБИНЕТА/api/webhook/yookassa
```

Events:

```text
payment.succeeded
payment.canceled
payment.waiting_for_capture
```

## 7. Smoke Check

```bash
export APP_URL="https://ВСТАВЬ_СЮДА_ДОМЕН_КАБИНЕТА"
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

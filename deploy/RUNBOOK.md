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

`deploy.sh` применит миграции, создаст стартовые тарифы, если база пустая, и запустит payment worker для периодической проверки ожидающих платежей. После первого входа админ может менять тарифы на:

```text
https://ВСТАВЬ_СЮДА_ДОМЕН_КАБИНЕТА/dashboard/admin/plans
```

Логи worker:

```bash
docker compose -f deploy/docker-compose.server.yml logs -f worker
```

If this server already has a reverse proxy on ports 80/443, disable bundled Caddy in `.env.production`:

```env
CABINET_ENABLE_CADDY="false"
CABINET_APP_BIND="127.0.0.1"
CABINET_APP_PORT="3000"
CABINET_EXTERNAL_NETWORK="remnawave-network"
```

Then proxy the cabinet domain from the existing Caddy/Nginx to:

```text
http://remnawave-cabinet-app:3000
```

`deploy/deploy.sh` creates `CABINET_EXTERNAL_NETWORK` if it is missing, and
the app/worker containers join it automatically. This is needed when Remnawave,
remnashop, and the existing Nginx live in a shared Docker network.

По умолчанию worker проверяет платежи раз в 60 секунд и отменяет ожидающий платёж через 600 секунд. Эти значения можно поменять в `.env.production`:

```env
PAYMENT_RECONCILE_INTERVAL_SECONDS="60"
PAYMENT_CANCEL_PENDING_AFTER_SECONDS="600"
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
- `EMAIL_VERIFICATION_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `REMNAWAVE_BASE_URL`
- `REMNAWAVE_TOKEN`
- `REMNAWAVE_INTERNAL_SQUAD_UUIDS`
- `YOOKASSA_SHOP_ID`
- `YOOKASSA_SECRET_KEY`

Rotate any tokens that were used locally before going live.

Important: `POSTGRES_PASSWORD` and the password inside `DATABASE_URL` must be the same.

## 4. Email Verification

Recommended built-in setup uses Resend:

```env
EMAIL_VERIFICATION_WEBHOOK_URL="https://ВСТАВЬ_СЮДА_ДОМЕН_КАБИНЕТА/api/email/resend"
EMAIL_VERIFICATION_WEBHOOK_SECRET="ВСТАВЬ_СЮДА_SECRET_ДЛЯ_EMAIL_WEBHOOK"
RESEND_API_KEY="ВСТАВЬ_СЮДА_RESEND_API_KEY"
EMAIL_FROM="VPN Cabinet <noreply@ВСТАВЬ_СЮДА_ДОМЕН_ПОЧТЫ>"
```

Generate webhook secret:

```bash
openssl rand -hex 32
```

## 5. Remote Remnashop Database

If remnashop database is on another server, create a read-only PostgreSQL user there:

```sql
CREATE USER remnashop_readonly WITH PASSWORD 'ВСТАВЬ_СЮДА_СИЛЬНЫЙ_ПАРОЛЬ';
GRANT CONNECT ON DATABASE remnashop TO remnashop_readonly;
GRANT USAGE ON SCHEMA public TO remnashop_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO remnashop_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO remnashop_readonly;
```

Allow PostgreSQL port `5432` only from the cabinet server IP.

Then set in cabinet `.env.production`:

```env
REMNASHOP_DATABASE_URL="postgresql://remnashop_readonly:ВСТАВЬ_СЮДА_ПАРОЛЬ@ВСТАВЬ_СЮДА_IP_ИЛИ_HOST_REMNASHOP:5432/remnashop?schema=public"
REMNASHOP_DATABASE_SSL="true"
```

Use `REMNASHOP_DATABASE_SSL="false"` only if PostgreSQL has no SSL and the network is private/trusted.

## 6. Deploy

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

## 7. Logs

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

## 8. YooKassa

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

## 9. Smoke Check

```bash
bash deploy/smoke-check.sh
```

Then check manually:

- register a new user
- verify email
- buy a small tariff
- return from YooKassa
- open `/dashboard/subscription`
- confirm QR/link is visible

## 10. Backups

Create a database backup:

```bash
docker compose -f deploy/docker-compose.server.yml exec db pg_dump -U cabinet cabinet > cabinet_backup.sql
```

Restore only when you understand that it overwrites data.

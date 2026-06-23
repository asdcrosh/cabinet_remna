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

## 2. Install

Fast path on a clean Ubuntu/Debian server:

```bash
curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/install-server.sh | sudo bash
```

The installer will:

- install Docker and Docker Compose plugin
- download `/opt/remnawave-cabinet/docker-compose.yml`
- create `/opt/remnawave-cabinet/.env`
- generate database password, `JWT_SECRET`, and `HEALTHCHECK_TOKEN`
- ask for missing production values
- create `CABINET_EXTERNAL_NETWORK` if it is missing
- deploy automatically after required production values are filled
- ask for the first administrator email and password after services start

This pulls the published image, starts PostgreSQL, validates `.env`, runs Prisma
migrations, creates starter plans if the database is empty, starts the app, and
starts the payment worker. After that it creates or updates the first admin user.

## 3. Required environment

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

Important: `POSTGRES_PASSWORD` and the password inside `DATABASE_URL` must be
the same. The installer keeps them in sync when it creates `.env`.

## 4. Reverse proxy

Bundled Caddy is enabled by default:

```env
COMPOSE_PROFILES="caddy"
```

If this server already has a reverse proxy on ports `80` and `443`, disable
bundled Caddy:

```env
COMPOSE_PROFILES=""
CABINET_APP_BIND="127.0.0.1"
CABINET_APP_PORT="3030"
CABINET_EXTERNAL_NETWORK="remnawave-network"
```

Then proxy the cabinet domain to:

```text
http://127.0.0.1:3030
```

If the proxy runs inside the shared Docker network, use:

```text
http://remnawave-cabinet-app:3000
```

The installer keeps `3000` on a clean server and automatically switches to
`3030` when `3000` is already used by Remnawave.

## 5. Email Verification

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

## 6. Remnashop Database

If `remnashop-db` runs on the same server, `install-server.sh` detects it
automatically, creates/updates the `remnashop_readonly` role, grants read-only
access, joins the cabinet to the same Docker network, and writes
`REMNASHOP_DATABASE_URL` to `.env`.

Manual setup is only needed when remnashop database is on another server.

On the remote remnashop PostgreSQL server, create a read-only user:

```sql
CREATE USER remnashop_readonly WITH PASSWORD 'ВСТАВЬ_СЮДА_СИЛЬНЫЙ_ПАРОЛЬ';
GRANT CONNECT ON DATABASE remnashop TO remnashop_readonly;
GRANT USAGE ON SCHEMA public TO remnashop_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO remnashop_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO remnashop_readonly;
```

Allow PostgreSQL port `5432` only from the cabinet server IP.

Then set in cabinet `.env`:

```env
REMNASHOP_DATABASE_URL="postgresql://remnashop_readonly:ВСТАВЬ_СЮДА_ПАРОЛЬ@ВСТАВЬ_СЮДА_IP_ИЛИ_HOST_REMNASHOP:5432/remnashop?schema=public"
REMNASHOP_DATABASE_SSL="true"
```

Use `REMNASHOP_DATABASE_SSL="false"` only if PostgreSQL has no SSL and the
network is private/trusted.

## 7. Updates and logs

Update:

```bash
cd /opt/remnawave-cabinet
docker compose --env-file .env -f docker-compose.yml up -d
```

Logs:

```bash
docker compose --env-file .env -f docker-compose.yml logs -f app
docker compose --env-file .env -f docker-compose.yml logs -f worker
```

Status:

```bash
docker compose --env-file .env -f docker-compose.yml ps
```

Restart app:

```bash
docker compose --env-file .env -f docker-compose.yml restart app
```

Stop:

```bash
docker compose --env-file .env -f docker-compose.yml down
```

Do not remove Docker volumes unless you intentionally want to delete the
database.

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
cd /opt/remnawave-cabinet
source .env
curl -H "x-healthcheck-token: $HEALTHCHECK_TOKEN" "$APP_URL/api/health"
```

Then check manually:

- register a new user
- verify email
- create a payment
- confirm subscription provisioning

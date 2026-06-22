# Production deployment

Production deployment is image-based. The server does not need the source tree,
`Dockerfile`, `package.json`, migrations checkout, or deploy scripts.

Only two files are required on the server:

- `/opt/remnawave-cabinet/docker-compose.yml`
- `/opt/remnawave-cabinet/.env`

The application image is configured with:

```env
CABINET_IMAGE="ghcr.io/asdcrosh/cabinet_remna:latest"
```

## Build and publish

`.github/workflows/docker-image.yml` publishes the `release` Docker target to
GitHub Container Registry on every push to `main`, on version tags, and on
manual workflow dispatch.

Make sure the GHCR package is public, or run `docker login ghcr.io` on the
server before deploying.

Manual publish equivalent:

```bash
docker buildx build --target release \
  -t ghcr.io/asdcrosh/cabinet_remna:latest \
  --push .
```

## One-command install

For a clean Ubuntu/Debian server:

```bash
curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/install-server.sh | sudo bash
```

The installer will:

- install Docker and the Docker Compose plugin
- download `docker-compose.yml`
- create `.env`
- generate `POSTGRES_PASSWORD`, `JWT_SECRET`, and `HEALTHCHECK_TOKEN`
- ask for missing production values
- create `CABINET_EXTERNAL_NETWORK` if it is missing
- deploy automatically after required values are filled
- ask for the first administrator email and password after services start

For non-interactive install, pass `SUPERUSER_EMAIL` and `SUPERUSER_PASSWORD` to the installer.

## Required environment

Fill real production values:

- `CABINET_DOMAIN`
- `EMAIL_VERIFICATION_WEBHOOK_URL`
- `EMAIL_VERIFICATION_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `REMNAWAVE_BASE_URL`
- `REMNAWAVE_TOKEN`
- `REMNAWAVE_INTERNAL_SQUAD_UUIDS`
- `YOOKASSA_SHOP_ID`
- `YOOKASSA_SECRET_KEY`

Use only production YooKassa keys. Do not deploy `test_...` keys.

`APP_URL`, `ALLOWED_ORIGINS`, and `YOOKASSA_WEBHOOK_URL` must point to the
public HTTPS cabinet origin:

```env
APP_URL="https://cabinet.example.com"
ALLOWED_ORIGINS="https://cabinet.example.com"
YOOKASSA_WEBHOOK_URL="https://cabinet.example.com/api/webhook/yookassa"
```

## Reverse proxy

Bundled Caddy is enabled by default:

```env
COMPOSE_PROFILES="caddy"
```

If the server already has Caddy/Nginx/Traefik on ports `80` and `443`, disable
the bundled proxy:

```env
COMPOSE_PROFILES=""
CABINET_APP_BIND="127.0.0.1"
CABINET_APP_PORT="3000"
```

Then proxy to:

```text
http://127.0.0.1:3000
```

If the external reverse proxy runs in Docker on `CABINET_EXTERNAL_NETWORK`, it
can proxy to:

```text
http://remnawave-cabinet-app:3000
```

## Operations

Update to the newest published image:

```bash
cd /opt/remnawave-cabinet
docker compose --env-file .env -f docker-compose.yml up -d
```

Logs:

```bash
docker compose --env-file .env -f docker-compose.yml logs -f app
docker compose --env-file .env -f docker-compose.yml logs -f worker
```

Smoke check:

```bash
source .env
curl -H "x-healthcheck-token: $HEALTHCHECK_TOKEN" "$APP_URL/api/health"
```

Database backup:

```bash
docker compose --env-file .env -f docker-compose.yml exec -T db \
  sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges' \
  > cabinet.dump
```

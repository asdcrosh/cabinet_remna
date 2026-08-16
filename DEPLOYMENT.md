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

`.github/workflows/docker-image.yml` publishes two Docker targets to GitHub
Container Registry on every push to `main`, on version tags, and on manual
workflow dispatch:

- `release` → `CABINET_IMAGE`, Next.js runner plus compact bundled workers,
  migrations, seed and env check.
- `provisioner` → `CABINET_PROVISIONER_IMAGE`, isolated Ansible/SSH worker for
  one-click node installation.

Make sure the GHCR package is public, or run `docker login ghcr.io` on the
server before deploying.

Manual publish equivalent:

```bash
docker buildx build --target release \
  -t ghcr.io/asdcrosh/cabinet_remna:latest \
  --push .
```

The image does not contain `src`, TypeScript workers, `tsx`, or full production
`node_modules`. Operational scripts are bundled into small JavaScript files;
only Prisma CLI files required by `migrate deploy` are included.

## One-command install

If this server is the destination of a full-stack migration and a backup of the
existing Remnawave, Remnashop, and Cabinet installation is available, install
only the management console first. Do not run `cabinetctl install` or install
the three applications separately. Run `sudo cabinetctl`, open `Backups`,
configure S3 or place the local archive in `/opt/remnawave-backups`, and restore
the stack from there.

For a clean Ubuntu/Debian server:

```bash
installer="$(mktemp)"
curl -fsSL --proto '=https' --tlsv1.2 \
  https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/install-console.sh \
  -o "${installer}"
bash -n "${installer}"
sudo bash "${installer}"
rm -f "${installer}"
sudo cabinetctl install
```

The installer will:

- install Docker and the Docker Compose plugin
- download `docker-compose.yml`
- create `.env`
- generate `POSTGRES_PASSWORD`, `JWT_SECRET`, `HEALTHCHECK_TOKEN`, and
  `BROADCAST_UPLOAD_SIGNING_SECRET`, plus the node-provisioning encryption key
- ask for missing production values
- create `CABINET_EXTERNAL_NETWORK` if it is missing
- deploy automatically after required values are filled
- ask for the first administrator email and password after services start
- configure node provisioning in the same `.env`; when its two new required
  values are missing, the worker stays disabled and the cabinet still starts

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

## One-click node provisioning

Provisioning uses the same `/opt/remnawave-cabinet/.env` as the cabinet. There
is no second `.env.provisioner` file. Compose exposes the Timeweb token only to
the provisioning worker. Run:

```bash
cabinetctl provisioning
```

Normally the wizard asks only for:

- `TIMEWEB_API_TOKEN`
- `NODE_PROVISIONING_BASE_DOMAIN`, for example `vpn.example.com`

It reuses the existing Remnawave URL/token, generates the encryption key,
detects the panel public IP when the panel domain resolves to this server,
reuses the configured support email, fills pinned images/timeouts, validates
both APIs with read-only requests, enables the
`provisioning` Compose profile and starts the worker. TCP and XHTTP template
hosts are selected in the admin page and do not have to be added to `.env`.

`APP_URL`, `ALLOWED_ORIGINS`, and `YOOKASSA_WEBHOOK_URL` must point to the
public HTTPS cabinet origin:

```env
APP_URL="https://cabinet.example.com"
ALLOWED_ORIGINS="https://cabinet.example.com"
YOOKASSA_WEBHOOK_URL="https://cabinet.example.com/api/webhook/yookassa"
```

Optional Подарочный бокс settings are kept in `.env`. The most important one is
`BONUS_BOX_RUB_PER_ATTEMPT`: it controls how many paid rubles give one opening.
Weekly and referral openings are controlled by `BONUS_BOX_WEEKLY_*` and
`BONUS_BOX_REFERRER_ATTEMPTS` / `BONUS_BOX_REFERRED_ATTEMPTS`.
`BONUS_BOX_ECONOMY_GUARD_ENABLED` and the `BONUS_BOX_*_COOLDOWN_OPENINGS`
settings protect the product economy from several expensive gifts in a row.
Rare and epic gifts do not reset the path to legendary gifts.

Application logs are emitted to Docker stdout/stderr as JSON. Use
`APP_LOG_LEVEL=info` and `APP_REQUEST_LOGS=true` while diagnosing production
issues, then read them with `docker compose logs -f app`.

When Remnashop sync imports users, the cabinet also resolves their current
Remnawave UUID and upserts the local subscription from Remnawave. The refresh
window is controlled by `REMNASHOP_USER_SUBSCRIPTION_SYNC_STALE_SECONDS`.

## Reverse proxy

Bundled Caddy is enabled by default:

```env
COMPOSE_PROFILES="caddy,maintenance"
```

If the server already has Caddy/Nginx/Traefik on ports `80` and `443`, disable
the bundled proxy:

```env
COMPOSE_PROFILES="maintenance"
CABINET_APP_BIND="127.0.0.1"
CABINET_APP_PORT="3000"
```

The installer and updater detect this port conflict and remove the `caddy`
profile automatically before starting services.

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
sudo cabinetctl update
```

Logs:

```bash
docker compose --env-file .env -f docker-compose.yml logs -f app
docker compose --env-file .env -f docker-compose.yml logs -f worker
docker compose --env-file .env -f docker-compose.yml logs -f broadcast-worker
```

The payment worker, broadcast worker, and retention cleanup run as long-lived
services by default. Cleanup is tied to the `maintenance` profile; its loop
interval is `RETENTION_CLEANUP_INTERVAL_SECONDS` and defaults to one day.

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

#!/usr/bin/env bash
set -euo pipefail

BRANCH="${BRANCH:-main}"
RAW_BASE_URL="${RAW_BASE_URL:-https://raw.githubusercontent.com/asdcrosh/cabinet_remna/${BRANCH}}"
COMPOSE_URL="${COMPOSE_URL:-${RAW_BASE_URL}/deploy/docker-compose.server.yml}"
ENV_URL="${ENV_URL:-${RAW_BASE_URL}/deploy/env.production.example}"
INSTALL_DIR="${INSTALL_DIR:-/opt/remnawave-cabinet}"
COMPOSE_FILE="${INSTALL_DIR}/docker-compose.yml"
ENV_FILE="${INSTALL_DIR}/.env"
LEGACY_ENV_FILE="${INSTALL_DIR}/.env.production"
DEFAULT_CABINET_IMAGE="ghcr.io/asdcrosh/cabinet_remna:latest"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root or with sudo:"
  echo "  curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/install-server.sh | sudo bash"
  exit 1
fi

echo "Installing base packages..."
if command -v apt-get >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl openssl python3
else
  echo "Only apt-based servers are supported by this installer."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is not available after Docker install."
  exit 1
fi

echo "Preparing deployment files in ${INSTALL_DIR}..."
mkdir -p "${INSTALL_DIR}"
curl -fsSL "${COMPOSE_URL}" -o "${COMPOSE_FILE}"

if [[ ! -f "${ENV_FILE}" ]]; then
  if [[ -f "${LEGACY_ENV_FILE}" ]]; then
    cp "${LEGACY_ENV_FILE}" "${ENV_FILE}"
  else
    curl -fsSL "${ENV_URL}" -o "${ENV_FILE}"
  fi
fi

env_key_exists() {
  local key="$1"
  grep -Eq "^${key}=" "${ENV_FILE}"
}

read_env_value() {
  local key="$1"
  ENV_FILE_PATH="${ENV_FILE}" python3 - "$key" <<'PY'
from pathlib import Path
import os
import sys

key = sys.argv[1]
path = Path(os.environ["ENV_FILE_PATH"])
for line in path.read_text().splitlines():
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or "=" not in stripped:
        continue
    current_key, value = stripped.split("=", 1)
    if current_key.strip() != key:
        continue
    value = value.strip()
    if (value.startswith('"') and value.endswith('"')) or (
        value.startswith("'") and value.endswith("'")
    ):
        value = value[1:-1]
    print(value)
    break
PY
}

replace_env_value() {
  local key="$1"
  local value="$2"
  ENV_FILE_PATH="${ENV_FILE}" python3 - "$key" "$value" <<'PY'
from pathlib import Path
import os
import sys

key, value = sys.argv[1], sys.argv[2]
path = Path(os.environ["ENV_FILE_PATH"])
lines = path.read_text().splitlines()
for index, line in enumerate(lines):
    if line.startswith(f"{key}="):
        lines[index] = f'{key}="{value}"'
        break
else:
    lines.append(f'{key}="{value}"')
path.write_text("\n".join(lines) + "\n")
PY
}

usable_env_value() {
  local value="$1"
  [[ -n "${value}" && "${value}" != *"ВСТАВЬ_СЮДА"* && "${value}" != *"CHANGE_ME"* && "${value}" != *"example.com"* ]]
}

existing_or_random_hex() {
  local key="$1"
  local bytes="$2"
  local current
  current="$(read_env_value "${key}" || true)"
  if usable_env_value "${current}"; then
    echo "${current}"
  else
    openssl rand -hex "${bytes}"
  fi
}

CURRENT_CABINET_DOMAIN="$(read_env_value CABINET_DOMAIN || true)"
if ! usable_env_value "${CURRENT_CABINET_DOMAIN}"; then
  CURRENT_CABINET_DOMAIN="cabinet.example.com"
fi

CABINET_DOMAIN="${CABINET_DOMAIN:-${CURRENT_CABINET_DOMAIN}}"
DB_PASSWORD="${POSTGRES_PASSWORD:-$(existing_or_random_hex POSTGRES_PASSWORD 24)}"
JWT_SECRET_VALUE="${JWT_SECRET:-$(existing_or_random_hex JWT_SECRET 32)}"
HEALTHCHECK_TOKEN_VALUE="${HEALTHCHECK_TOKEN:-$(existing_or_random_hex HEALTHCHECK_TOKEN 32)}"

replace_env_value "CABINET_DOMAIN" "${CABINET_DOMAIN}"
replace_env_value "APP_URL" "https://${CABINET_DOMAIN}"
replace_env_value "ALLOWED_ORIGINS" "https://${CABINET_DOMAIN}"
replace_env_value "YOOKASSA_WEBHOOK_URL" "https://${CABINET_DOMAIN}/api/webhook/yookassa"
replace_env_value "POSTGRES_PASSWORD" "${DB_PASSWORD}"
replace_env_value "DATABASE_URL" "postgresql://cabinet:${DB_PASSWORD}@db:5432/cabinet?schema=public"
replace_env_value "JWT_SECRET" "${JWT_SECRET_VALUE}"
replace_env_value "HEALTHCHECK_TOKEN" "${HEALTHCHECK_TOKEN_VALUE}"

CURRENT_REMNASHOP_DATABASE_URL="$(read_env_value REMNASHOP_DATABASE_URL || true)"
if [[ "${CURRENT_REMNASHOP_DATABASE_URL}" == *"ВСТАВЬ_СЮДА"* || "${CURRENT_REMNASHOP_DATABASE_URL}" == *"CHANGE_ME"* ]]; then
  replace_env_value "REMNASHOP_DATABASE_URL" ""
fi

if [[ -n "${CABINET_IMAGE:-}" ]]; then
  replace_env_value "CABINET_IMAGE" "${CABINET_IMAGE}"
elif ! env_key_exists "CABINET_IMAGE"; then
  replace_env_value "CABINET_IMAGE" "${DEFAULT_CABINET_IMAGE}"
fi

if [[ -n "${CABINET_PULL_POLICY:-}" ]]; then
  replace_env_value "CABINET_PULL_POLICY" "${CABINET_PULL_POLICY}"
elif ! env_key_exists "CABINET_PULL_POLICY"; then
  replace_env_value "CABINET_PULL_POLICY" "always"
fi

if [[ -n "${COMPOSE_PROFILES+x}" ]]; then
  replace_env_value "COMPOSE_PROFILES" "${COMPOSE_PROFILES}"
elif ! env_key_exists "COMPOSE_PROFILES"; then
  if [[ "${CABINET_ENABLE_CADDY:-true}" == "false" ]]; then
    replace_env_value "COMPOSE_PROFILES" ""
  else
    replace_env_value "COMPOSE_PROFILES" "caddy"
  fi
fi

for key in \
  CABINET_APP_BIND \
  CABINET_APP_PORT \
  CABINET_EXTERNAL_NETWORK \
  EMAIL_VERIFICATION_WEBHOOK_URL \
  EMAIL_VERIFICATION_WEBHOOK_SECRET \
  RESEND_API_KEY \
  EMAIL_FROM \
  REMNAWAVE_BASE_URL \
  REMNAWAVE_TOKEN \
  REMNAWAVE_INTERNAL_SQUAD_UUIDS \
  YOOKASSA_SHOP_ID \
  YOOKASSA_SECRET_KEY \
  YOOKASSA_WEBHOOK_ALLOWED_IPS \
  TELEGRAM_CLIENT_ID \
  TELEGRAM_CLIENT_SECRET \
  TELEGRAM_BOT_USERNAME \
  TELEGRAM_BOT_TOKEN \
  TELEGRAM_NOTIFY_CHAT_ID
do
  if [[ -n "${!key:-}" ]]; then
    replace_env_value "${key}" "${!key}"
  fi
done

EXTERNAL_NETWORK="$(read_env_value CABINET_EXTERNAL_NETWORK || true)"
EXTERNAL_NETWORK="${EXTERNAL_NETWORK:-remnawave-network}"
if ! docker network inspect "${EXTERNAL_NETWORK}" >/dev/null 2>&1; then
  echo "Creating external Docker network: ${EXTERNAL_NETWORK}"
  docker network create "${EXTERNAL_NETWORK}" >/dev/null
fi

if grep -Eq 'CHANGE_ME|ВСТАВЬ_СЮДА|test_|example\.com' "${ENV_FILE}"; then
  cat <<EOF

Deployment files are ready in:
  ${INSTALL_DIR}

Only these files are required on the server:
  ${COMPOSE_FILE}
  ${ENV_FILE}

.env was created and local secrets were generated.
Fill the remaining production values:
  nano ${ENV_FILE}

Required values:
  CABINET_DOMAIN
  EMAIL_VERIFICATION_WEBHOOK_URL
  EMAIL_VERIFICATION_WEBHOOK_SECRET
  RESEND_API_KEY
  EMAIL_FROM
  REMNAWAVE_BASE_URL
  REMNAWAVE_TOKEN
  REMNAWAVE_INTERNAL_SQUAD_UUIDS
  YOOKASSA_SHOP_ID
  YOOKASSA_SECRET_KEY

Then run this installer command again, or run:
  cd ${INSTALL_DIR} && docker compose --env-file .env -f docker-compose.yml up -d

EOF
  exit 0
fi

COMPOSE=(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}")

echo "Pulling images..."
CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" pull

echo "Starting services..."
CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" up -d --remove-orphans

echo "Deploy complete."
echo "Useful commands:"
echo "  cd ${INSTALL_DIR} && docker compose --env-file .env -f docker-compose.yml ps"
echo "  cd ${INSTALL_DIR} && docker compose --env-file .env -f docker-compose.yml logs -f app"
echo "  cd ${INSTALL_DIR} && docker compose --env-file .env -f docker-compose.yml logs -f worker"

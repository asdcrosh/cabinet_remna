#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/asdcrosh/cabinet_remna.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/remnawave-cabinet}"
CABINET_DOMAIN="${CABINET_DOMAIN:-cabinet.example.com}"
BRANCH="${BRANCH:-main}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root or with sudo:"
  echo "  curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/install-server.sh | sudo bash"
  exit 1
fi

echo "Installing base packages..."
if command -v apt-get >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl git openssl python3
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

echo "Preparing project in ${INSTALL_DIR}..."
if [[ -d "${INSTALL_DIR}/.git" ]]; then
  git -C "${INSTALL_DIR}" fetch origin "${BRANCH}"
  git -C "${INSTALL_DIR}" checkout "${BRANCH}"
  git -C "${INSTALL_DIR}" pull --ff-only origin "${BRANCH}"
else
  mkdir -p "$(dirname "${INSTALL_DIR}")"
  git clone --branch "${BRANCH}" "${REPO_URL}" "${INSTALL_DIR}"
fi

cd "${INSTALL_DIR}"

if [[ ! -f .env.production ]]; then
  cp deploy/env.production.example .env.production
fi

DB_PASSWORD="${POSTGRES_PASSWORD:-$(openssl rand -hex 24)}"
JWT_SECRET_VALUE="${JWT_SECRET:-$(openssl rand -hex 32)}"
HEALTHCHECK_TOKEN_VALUE="${HEALTHCHECK_TOKEN:-$(openssl rand -hex 32)}"

replace_env_value() {
  local key="$1"
  local value="$2"
  python3 - "$key" "$value" <<'PY'
from pathlib import Path
import sys

key, value = sys.argv[1], sys.argv[2]
path = Path(".env.production")
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

replace_env_value "CABINET_DOMAIN" "${CABINET_DOMAIN}"
replace_env_value "APP_URL" "https://${CABINET_DOMAIN}"
replace_env_value "ALLOWED_ORIGINS" "https://${CABINET_DOMAIN}"
replace_env_value "YOOKASSA_WEBHOOK_URL" "https://${CABINET_DOMAIN}/api/webhook/yookassa"
replace_env_value "POSTGRES_PASSWORD" "${DB_PASSWORD}"
replace_env_value "DATABASE_URL" "postgresql://cabinet:${DB_PASSWORD}@db:5432/cabinet?schema=public"
replace_env_value "JWT_SECRET" "${JWT_SECRET_VALUE}"
replace_env_value "HEALTHCHECK_TOKEN" "${HEALTHCHECK_TOKEN_VALUE}"

for key in \
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

if grep -Eq 'CHANGE_ME|ВСТАВЬ_СЮДА|test_|example\.com' .env.production; then
  cat <<EOF

Project is installed in:
  ${INSTALL_DIR}

.env.production was created and local secrets were generated.
Fill the remaining production values:
  nano ${INSTALL_DIR}/.env.production

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

Then run:
  cd ${INSTALL_DIR} && ./deploy/deploy.sh

EOF
  exit 0
fi

echo "Environment is complete. Deploying..."
./deploy/deploy.sh

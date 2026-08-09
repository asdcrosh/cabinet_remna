#!/usr/bin/env bash
set -euo pipefail

BRANCH="${BRANCH:-main}"
RAW_BASE_URL="${RAW_BASE_URL:-https://raw.githubusercontent.com/asdcrosh/cabinet_remna/${BRANCH}}"
GITHUB_API_URL="${GITHUB_API_URL:-https://api.github.com/repos/asdcrosh/cabinet_remna/commits/${BRANCH}}"
COMPOSE_URL="${COMPOSE_URL:-${RAW_BASE_URL}/deploy/docker-compose.server.yml}"
ENV_URL="${ENV_URL:-${RAW_BASE_URL}/deploy/env.production.example}"
INSTALL_DIR="${INSTALL_DIR:-/opt/remnawave-cabinet}"
COMPOSE_FILE="${INSTALL_DIR}/docker-compose.yml"
ENV_FILE="${INSTALL_DIR}/.env"
VERSION_FILE="${INSTALL_DIR}/.cabinet-version"
STATE_DIR="${CABINET_STATE_DIR:-${INSTALL_DIR}/state}"
DEPLOY_STATE_FILE="${STATE_DIR}/deployment.json"
LEGACY_ENV_FILE="${INSTALL_DIR}/.env.production"
DEFAULT_CABINET_IMAGE="ghcr.io/asdcrosh/cabinet_remna:latest"
TTY_DEVICE="${TTY_DEVICE:-/dev/tty}"
CABINETCTL_URL="${CABINETCTL_URL:-${RAW_BASE_URL}/deploy/cabinetctl.sh}"
CABINETCTL_PATH="${CABINETCTL_PATH:-/usr/local/bin/cabinetctl}"
CABINETCTL_TEMP="${CABINETCTL_PATH}.tmp"
FULL_BACKUP_URL="${FULL_BACKUP_URL:-${RAW_BASE_URL}/deploy/full-stack-backup.sh}"
FULL_BACKUP_PATH="${FULL_BACKUP_PATH:-/usr/local/bin/remna-backup}"
FULL_BACKUP_TEMP="${FULL_BACKUP_PATH}.tmp"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root or with sudo:"
  echo "  curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/install-server.sh | sudo bash"
  exit 1
fi

echo "Installing base packages..."
if command -v apt-get >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl openssl python3 util-linux
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

remote_commit_sha() {
  local response
  command -v curl >/dev/null 2>&1 || return 1
  response="$(curl -fsSL -H 'Accept: application/vnd.github+json' "${GITHUB_API_URL}" 2>/dev/null || true)"
  printf '%s\n' "${response}" \
    | sed -n 's/.*"sha"[[:space:]]*:[[:space:]]*"\([0-9a-f]\{40\}\)".*/\1/p' \
    | head -n 1
}

write_installed_version() {
  local sha="$1"
  [[ -n "${sha}" ]] || return 0
  mkdir -p "$(dirname "${VERSION_FILE}")" 2>/dev/null || true
  {
    printf 'commit=%s\n' "${sha}"
    printf 'branch=%s\n' "${BRANCH}"
    printf 'updated_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } >"${VERSION_FILE}" 2>/dev/null || true
}

running_app_revision() {
  local image_id revision
  image_id="$(docker inspect remnawave-cabinet-app --format '{{.Image}}' 2>/dev/null || true)"
  [[ -n "${image_id}" ]] || return 1
  revision="$(docker image inspect "${image_id}" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' 2>/dev/null || true)"
  if [[ "${revision}" =~ ^[0-9a-f]{40}$ ]]; then
    printf '%s\n' "${revision}"
    return 0
  fi
  return 1
}

echo "Preparing deployment files in ${INSTALL_DIR}..."
mkdir -p "${INSTALL_DIR}" "${STATE_DIR}"
chmod 755 "${STATE_DIR}" 2>/dev/null || true
curl -fsSL "${COMPOSE_URL}" -o "${COMPOSE_FILE}"
curl -fsSL "${CABINETCTL_URL}" -o "${CABINETCTL_TEMP}"
install -m 755 "${CABINETCTL_TEMP}" "${CABINETCTL_PATH}"
rm -f "${CABINETCTL_TEMP}"
curl -fsSL "${FULL_BACKUP_URL}" -o "${FULL_BACKUP_TEMP}"
install -m 755 "${FULL_BACKUP_TEMP}" "${FULL_BACKUP_PATH}"
rm -f "${FULL_BACKUP_TEMP}"
rm -f /usr/local/bin/remnactl

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

env_needs_value() {
  local key="$1"
  local value
  value="$(read_env_value "${key}" || true)"
  ! usable_env_value "${value}"
}

env_file_has_placeholders() {
  ENV_FILE_PATH="${ENV_FILE}" python3 <<'PY'
from pathlib import Path
import os
import sys

path = Path(os.environ["ENV_FILE_PATH"])
markers = ("CHANGE_ME", "ВСТАВЬ_СЮДА", "test_", "example.com")
for line in path.read_text().splitlines():
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or "=" not in stripped:
        continue
    _key, value = stripped.split("=", 1)
    if any(marker in value for marker in markers):
        sys.exit(0)
sys.exit(1)
PY
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

urlencode() {
  python3 - "$1" <<'PY'
from urllib.parse import quote
import sys

print(quote(sys.argv[1], safe=""))
PY
}

normalize_url_env() {
  local key="$1"
  local scheme="${2:-https}"
  local current

  current="$(read_env_value "${key}" || true)"
  if [[ -z "${current}" || "${current}" == *"://"* || "${current}" == *"ВСТАВЬ_СЮДА"* || "${current}" == *"CHANGE_ME"* ]]; then
    return
  fi

  replace_env_value "${key}" "${scheme}://${current}"
}

sql_literal() {
  python3 - "$1" <<'PY'
import sys

print("'" + sys.argv[1].replace("'", "''") + "'")
PY
}

sql_identifier() {
  python3 - "$1" <<'PY'
import sys

print('"' + sys.argv[1].replace('"', '""') + '"')
PY
}

docker_env_value() {
  local container="$1"
  local key="$2"

  docker inspect "${container}" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
    | awk -F= -v key="${key}" '$1 == key { sub(/^[^=]*=/, ""); print; exit }'
}

first_container_network() {
  local container="$1"

  docker inspect "${container}" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' 2>/dev/null \
    | head -n 1
}

host_port_available() {
  local bind_address="$1"
  local port="$2"

  if command -v ss >/dev/null 2>&1; then
    if ss -H -ltn "sport = :${port}" 2>/dev/null | grep -q .; then
      return 1
    fi
  fi

  python3 - "$bind_address" "$port" <<'PY'
import socket
import sys

host = sys.argv[1]
port = int(sys.argv[2])

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    sock.bind((host, port))
except OSError:
    sys.exit(1)
finally:
    sock.close()
PY
}

first_available_port() {
  local bind_address="$1"
  local preferred_port="$2"
  local port

  for port in "${preferred_port}" 3030 3031 3032 3033 3034 3035; do
    if host_port_available "${bind_address}" "${port}"; then
      echo "${port}"
      return 0
    fi
  done

  echo ""
  return 1
}

configure_app_port() {
  local bind_address
  local current_port
  local selected_port

  bind_address="$(read_env_value CABINET_APP_BIND || true)"
  bind_address="${bind_address:-127.0.0.1}"
  current_port="$(read_env_value CABINET_APP_PORT || true)"
  current_port="${current_port:-3000}"

  replace_env_value "CABINET_APP_BIND" "${bind_address}"

  if [[ -n "${CABINET_APP_PORT:-}" ]]; then
    replace_env_value "CABINET_APP_PORT" "${CABINET_APP_PORT}"
    return
  fi

  if host_port_available "${bind_address}" "${current_port}"; then
    replace_env_value "CABINET_APP_PORT" "${current_port}"
    return
  fi

  selected_port="$(first_available_port "${bind_address}" "3030")"
  if [[ -z "${selected_port}" ]]; then
    echo "No free local port found for cabinet app. Set CABINET_APP_PORT manually in ${ENV_FILE}."
    exit 1
  fi

  replace_env_value "CABINET_APP_PORT" "${selected_port}"
  echo "Local port ${bind_address}:${current_port} is busy. Cabinet app will use ${bind_address}:${selected_port}."
}

configure_caddy_profile() {
  local current_profiles
  local next_profiles

  if [[ "${CABINET_ENABLE_CADDY:-}" == "false" ]]; then
    replace_env_value "COMPOSE_PROFILES" "maintenance"
    return
  fi

  current_profiles="$(read_env_value COMPOSE_PROFILES || true)"
  if [[ -z "${current_profiles}" ]]; then
    return
  fi

  if [[ "${current_profiles}" != *"caddy"* ]]; then
    return
  fi

  if host_port_available "0.0.0.0" "80" && host_port_available "0.0.0.0" "443"; then
    return
  fi

  next_profiles=",${current_profiles},"
  next_profiles="${next_profiles//,caddy,/,}"
  next_profiles="${next_profiles#,}"
  next_profiles="${next_profiles%,}"
  replace_env_value "COMPOSE_PROFILES" "${next_profiles}"
  echo "Ports 80/443 are busy. Bundled Caddy is disabled; use your existing reverse proxy for the cabinet domain."
}

configure_local_remnashop_database() {
  local current_url
  local container="${REMNASHOP_DB_CONTAINER:-remnashop-db}"
  local db_user
  local db_name
  local network
  local readonly_password
  local readonly_password_literal
  local db_name_identifier
  local encoded_password
  local remnashop_crypt_key
  local redis_password
  local redis_database
  local encoded_redis_password
  local redis_url
  local database_url
  local role_exists

  current_url="$(read_env_value REMNASHOP_DATABASE_URL || true)"
  if usable_env_value "${current_url}"; then
    return
  fi

  if ! docker inspect "${container}" >/dev/null 2>&1; then
    return
  fi

  db_user="$(docker_env_value "${container}" POSTGRES_USER)"
  db_name="$(docker_env_value "${container}" POSTGRES_DB)"
  network="$(first_container_network "${container}")"

  if [[ -z "${db_user}" || -z "${db_name}" || -z "${network}" ]]; then
    echo "Local ${container} detected, but database env/network could not be read. Skipping remnashop auto-link."
    return
  fi

  readonly_password="$(existing_or_random_hex REMNASHOP_READONLY_PASSWORD 24)"
  readonly_password_literal="$(sql_literal "${readonly_password}")"
  db_name_identifier="$(sql_identifier "${db_name}")"

  echo "Local ${container} detected. Configuring Remnashop integration access..."

  role_exists="$(docker exec "${container}" psql -U "${db_user}" -d "${db_name}" -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'remnashop_readonly';" 2>/dev/null | tr -d '[:space:]' || true)"
  if [[ "${role_exists}" == "1" ]]; then
    docker exec "${container}" psql -v ON_ERROR_STOP=1 -U "${db_user}" -d "${db_name}" \
      -c "ALTER ROLE remnashop_readonly WITH LOGIN PASSWORD ${readonly_password_literal};" >/dev/null
  else
    docker exec "${container}" psql -v ON_ERROR_STOP=1 -U "${db_user}" -d "${db_name}" \
      -c "CREATE ROLE remnashop_readonly WITH LOGIN PASSWORD ${readonly_password_literal};" >/dev/null
  fi

  docker exec "${container}" psql -v ON_ERROR_STOP=1 -U "${db_user}" -d "${db_name}" \
    -c "GRANT CONNECT ON DATABASE ${db_name_identifier} TO remnashop_readonly;" \
    -c "GRANT USAGE ON SCHEMA public TO remnashop_readonly;" \
    -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO remnashop_readonly;" \
    -c "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO remnashop_readonly;" \
    -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO remnashop_readonly;" \
    -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO remnashop_readonly;" >/dev/null

  curl -fsSL "${RAW_BASE_URL}/deploy/remnashop-cabinet-link.sql" \
    | docker exec -i "${container}" psql -v ON_ERROR_STOP=1 -U "${db_user}" -d "${db_name}" >/dev/null

  encoded_password="$(urlencode "${readonly_password}")"
  database_url="postgresql://remnashop_readonly:${encoded_password}@${container}:5432/${db_name}?schema=public"

  replace_env_value "REMNASHOP_READONLY_PASSWORD" "${readonly_password}"
  replace_env_value "REMNASHOP_DATABASE_URL" "${database_url}"
  replace_env_value "REMNASHOP_DATABASE_SSL" "false"
  if docker inspect remnashop >/dev/null 2>&1; then
    replace_env_value "REMNASHOP_API_URL" "http://remnashop:5000/api/v1/public"
    remnashop_crypt_key="$(docker_env_value remnashop APP_CRYPT_KEY)"
    if [[ -n "${remnashop_crypt_key}" ]]; then
      replace_env_value "REMNASHOP_CRYPT_KEY" "${remnashop_crypt_key}"
    fi
  fi
  if docker inspect remnashop-redis >/dev/null 2>&1; then
    redis_password="$(docker_env_value remnashop-redis REDIS_PASSWORD)"
    redis_database="$(docker_env_value remnashop REDIS_NAME)"
    if [[ ! "${redis_database}" =~ ^[0-9]+$ ]]; then
      redis_database="0"
    fi
    if [[ -n "${redis_password}" ]]; then
      encoded_redis_password="$(urlencode "${redis_password}")"
      redis_url="redis://:${encoded_redis_password}@remnashop-redis:6379/${redis_database}"
    else
      redis_url="redis://remnashop-redis:6379/${redis_database}"
    fi
    replace_env_value "REMNASHOP_REDIS_URL" "${redis_url}"
  fi
  replace_env_value "CABINET_EXTERNAL_NETWORK" "${network}"

  echo "Remnashop sync auto-linked through Docker network: ${network}"
}

prompt_text() {
  local prompt="$1"
  local default_value="${2:-}"
  local value=""

  if [[ ! -r "${TTY_DEVICE}" ]]; then
    echo "${default_value}"
    return
  fi

  if [[ -n "${default_value}" ]]; then
    printf "%s [%s]: " "${prompt}" "${default_value}" >"${TTY_DEVICE}"
  else
    printf "%s: " "${prompt}" >"${TTY_DEVICE}"
  fi
  IFS= read -r value <"${TTY_DEVICE}" || value=""
  echo "${value:-${default_value}}"
}

prompt_env_text() {
  local key="$1"
  local label="$2"
  local default_value="${3:-}"
  local current
  local value

  current="$(read_env_value "${key}" || true)"
  if usable_env_value "${current}"; then
    return
  fi

  value="$(prompt_text "${label}" "${default_value}")"
  if [[ -n "${value}" ]]; then
    replace_env_value "${key}" "${value}"
  fi
}

prompt_env_secret() {
  local key="$1"
  local label="$2"
  local current
  local value

  current="$(read_env_value "${key}" || true)"
  if usable_env_value "${current}"; then
    return
  fi

  value="$(prompt_hidden "${label}")"
  if [[ -n "${value}" ]]; then
    replace_env_value "${key}" "${value}"
  fi
}

prompt_hidden() {
  local prompt="$1"
  local value=""

  if [[ ! -r "${TTY_DEVICE}" ]]; then
    echo ""
    return
  fi

  printf "%s: " "${prompt}" >"${TTY_DEVICE}"
  stty -echo <"${TTY_DEVICE}" 2>/dev/null || true
  IFS= read -r value <"${TTY_DEVICE}" || value=""
  stty echo <"${TTY_DEVICE}" 2>/dev/null || true
  printf "\n" >"${TTY_DEVICE}"
  echo "${value}"
}

prompt_secret() {
  local prompt="$1"
  local first=""
  local second=""

  if [[ ! -r "${TTY_DEVICE}" ]]; then
    echo ""
    return
  fi

  while true; do
    printf "%s: " "${prompt}" >"${TTY_DEVICE}"
    stty -echo <"${TTY_DEVICE}" 2>/dev/null || true
    IFS= read -r first <"${TTY_DEVICE}" || first=""
    stty echo <"${TTY_DEVICE}" 2>/dev/null || true
    printf "\nRepeat %s: " "${prompt}" >"${TTY_DEVICE}"
    stty -echo <"${TTY_DEVICE}" 2>/dev/null || true
    IFS= read -r second <"${TTY_DEVICE}" || second=""
    stty echo <"${TTY_DEVICE}" 2>/dev/null || true
    printf "\n" >"${TTY_DEVICE}"

    if [[ -z "${first}" ]]; then
      echo "Password cannot be empty." >"${TTY_DEVICE}"
      continue
    fi
    if [[ "${first}" != "${second}" ]]; then
      echo "Passwords do not match." >"${TTY_DEVICE}"
      continue
    fi
    if [[ "${#first}" -lt 8 ]]; then
      echo "Password must be at least 8 characters." >"${TTY_DEVICE}"
      continue
    fi
    if [[ ! "${first}" =~ [A-Za-z] || ! "${first}" =~ [0-9] ]]; then
      echo "Password must contain at least one latin letter and one digit." >"${TTY_DEVICE}"
      continue
    fi

    echo "${first}"
    return
  done
}

prompt_required_config() {
  if [[ ! -r "${TTY_DEVICE}" ]]; then
    return 0
  fi

  if ! env_file_has_placeholders; then
    return 0
  fi

  echo "" >"${TTY_DEVICE}"
  echo "================ Remnawave Cabinet setup ================" >"${TTY_DEVICE}"
  echo "Fill required production values. Press Enter to keep existing values." >"${TTY_DEVICE}"
  echo "" >"${TTY_DEVICE}"

  if env_needs_value "CABINET_DOMAIN"; then
    CABINET_DOMAIN="$(prompt_text "Cabinet domain" "${CABINET_DOMAIN}")"
    replace_env_value "CABINET_DOMAIN" "${CABINET_DOMAIN}"
    replace_env_value "APP_URL" "https://${CABINET_DOMAIN}"
    replace_env_value "ALLOWED_ORIGINS" "https://${CABINET_DOMAIN}"
    replace_env_value "YOOKASSA_WEBHOOK_URL" "https://${CABINET_DOMAIN}/api/webhook/yookassa"
  fi

  if env_needs_value "CABINET_BRAND_NAME"; then
    CABINET_BRAND_NAME="$(prompt_text "Cabinet brand name" "${CABINET_BRAND_NAME:-VPN Cabinet}")"
    replace_env_value "CABINET_BRAND_NAME" "${CABINET_BRAND_NAME}"
  else
    CABINET_BRAND_NAME="$(read_env_value CABINET_BRAND_NAME || echo "VPN Cabinet")"
  fi

  echo "" >"${TTY_DEVICE}"
  echo "Email verification / Resend" >"${TTY_DEVICE}"
  prompt_env_text "EMAIL_VERIFICATION_WEBHOOK_URL" "Email webhook URL" "https://${CABINET_DOMAIN}/api/email/resend"
  prompt_env_secret "EMAIL_VERIFICATION_WEBHOOK_SECRET" "Email webhook secret"
  prompt_env_secret "RESEND_API_KEY" "Resend API key"
  prompt_env_text "EMAIL_FROM" "Email from" "${CABINET_BRAND_NAME} <noreply@${CABINET_DOMAIN}>"

  echo "" >"${TTY_DEVICE}"
  echo "Remnawave Panel" >"${TTY_DEVICE}"
  prompt_env_text "REMNAWAVE_BASE_URL" "Remnawave panel URL"
  prompt_env_secret "REMNAWAVE_TOKEN" "Remnawave API token"

  echo "" >"${TTY_DEVICE}"
  echo "YooKassa" >"${TTY_DEVICE}"
  prompt_env_text "YOOKASSA_SHOP_ID" "YooKassa shop ID"
  prompt_env_secret "YOOKASSA_SECRET_KEY" "YooKassa secret key"

  echo "" >"${TTY_DEVICE}"
}

wait_for_app_container() {
  local attempts=60
  local status=""

  echo "Waiting for application container..."
  for _ in $(seq 1 "${attempts}"); do
    status="$("${COMPOSE[@]}" ps --status running --format '{{.Service}}' 2>/dev/null | grep -x app || true)"
    if [[ "${status}" == "app" ]]; then
      return 0
    fi
    sleep 2
  done

  echo "Application container did not start in time."
  return 1
}

wait_for_app_health() {
  local bind_address app_port health_token
  bind_address="$(read_env_value CABINET_APP_BIND || true)"
  app_port="$(read_env_value CABINET_APP_PORT || true)"
  health_token="$(read_env_value HEALTHCHECK_TOKEN || true)"
  bind_address="${bind_address:-127.0.0.1}"
  [[ "${bind_address}" == "0.0.0.0" ]] && bind_address="127.0.0.1"
  app_port="${app_port:-3000}"

  echo "Checking local health on ${bind_address}:${app_port}..."
  for _ in $(seq 1 60); do
    if curl -fsS --connect-timeout 2 --max-time 5 \
      -H "x-healthcheck-token: ${health_token}" \
      "http://${bind_address}:${app_port}/api/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "Application health-check did not pass in time."
  return 1
}

bootstrap_superuser() {
  local email="${SUPERUSER_EMAIL:-}"
  local password="${SUPERUSER_PASSWORD:-}"

  if "${COMPOSE[@]}" exec -T \
    -e SUPERUSER_CHECK_ONLY="true" \
    app node ops/bootstrap-superuser.js >/dev/null 2>&1; then
    echo "Administrator account already exists; bootstrap skipped."
    return 0
  fi

  if [[ -z "${email}" && -r "${TTY_DEVICE}" ]]; then
    echo "" >"${TTY_DEVICE}"
    echo "Create first administrator account." >"${TTY_DEVICE}"
    email="$(prompt_text "Admin email")"
  fi

  if [[ -z "${email}" ]]; then
    cat <<EOF

Admin account was not created because this install is non-interactive.
Create it later with:
  curl -fsSL ${RAW_BASE_URL}/deploy/install-server.sh | sudo env SUPERUSER_EMAIL="admin@example.com" SUPERUSER_PASSWORD="strong-password" bash

EOF
    return 0
  fi

  if [[ -z "${password}" && -r "${TTY_DEVICE}" ]]; then
    password="$(prompt_secret "Admin password")"
  fi

  if [[ -z "${password}" ]]; then
    echo "Admin password is empty; skipping admin bootstrap."
    return 0
  fi

  echo "Creating/updating administrator account..."
  "${COMPOSE[@]}" exec -T \
    -e SUPERUSER_EMAIL="${email}" \
    -e SUPERUSER_PASSWORD="${password}" \
    app node ops/bootstrap-superuser.js
}

CURRENT_CABINET_DOMAIN="$(read_env_value CABINET_DOMAIN || true)"
if ! usable_env_value "${CURRENT_CABINET_DOMAIN}"; then
  CURRENT_CABINET_DOMAIN="cabinet.example.com"
fi

CABINET_DOMAIN="${CABINET_DOMAIN:-${CURRENT_CABINET_DOMAIN}}"
DB_PASSWORD="${POSTGRES_PASSWORD:-$(existing_or_random_hex POSTGRES_PASSWORD 24)}"
JWT_SECRET_VALUE="${JWT_SECRET:-$(existing_or_random_hex JWT_SECRET 32)}"
HEALTHCHECK_TOKEN_VALUE="${HEALTHCHECK_TOKEN:-$(existing_or_random_hex HEALTHCHECK_TOKEN 32)}"
BROADCAST_UPLOAD_SIGNING_SECRET_VALUE="${BROADCAST_UPLOAD_SIGNING_SECRET:-$(existing_or_random_hex BROADCAST_UPLOAD_SIGNING_SECRET 32)}"
REMNASHOP_WEBHOOK_SECRET_VALUE="${REMNASHOP_WEBHOOK_SECRET:-$(existing_or_random_hex REMNASHOP_WEBHOOK_SECRET 32)}"

replace_env_value "CABINET_DOMAIN" "${CABINET_DOMAIN}"
if [[ -n "${CABINET_BRAND_NAME:-}" ]]; then
  replace_env_value "CABINET_BRAND_NAME" "${CABINET_BRAND_NAME}"
elif ! env_key_exists "CABINET_BRAND_NAME"; then
  replace_env_value "CABINET_BRAND_NAME" "VPN Cabinet"
fi
replace_env_value "APP_URL" "https://${CABINET_DOMAIN}"
replace_env_value "ALLOWED_ORIGINS" "https://${CABINET_DOMAIN}"
replace_env_value "YOOKASSA_WEBHOOK_URL" "https://${CABINET_DOMAIN}/api/webhook/yookassa"
replace_env_value "POSTGRES_PASSWORD" "${DB_PASSWORD}"
replace_env_value "DATABASE_URL" "postgresql://cabinet:${DB_PASSWORD}@db:5432/cabinet?schema=public&connection_limit=10&pool_timeout=20"
replace_env_value "JWT_SECRET" "${JWT_SECRET_VALUE}"
replace_env_value "HEALTHCHECK_TOKEN" "${HEALTHCHECK_TOKEN_VALUE}"
replace_env_value "BROADCAST_UPLOAD_SIGNING_SECRET" "${BROADCAST_UPLOAD_SIGNING_SECRET_VALUE}"
replace_env_value "BROADCAST_UPLOAD_ALLOW_UNSIGNED_LEGACY" "false"
replace_env_value "REMNASHOP_WEBHOOK_SECRET" "${REMNASHOP_WEBHOOK_SECRET_VALUE}"
if [[ -n "${APP_LOG_LEVEL:-}" ]]; then
  replace_env_value "APP_LOG_LEVEL" "${APP_LOG_LEVEL}"
elif ! env_key_exists "APP_LOG_LEVEL"; then
  replace_env_value "APP_LOG_LEVEL" "info"
fi
if [[ -n "${APP_REQUEST_LOGS:-}" ]]; then
  replace_env_value "APP_REQUEST_LOGS" "${APP_REQUEST_LOGS}"
elif ! env_key_exists "APP_REQUEST_LOGS"; then
  replace_env_value "APP_REQUEST_LOGS" "true"
fi

CURRENT_REMNASHOP_DATABASE_URL="$(read_env_value REMNASHOP_DATABASE_URL || true)"
if [[ "${CURRENT_REMNASHOP_DATABASE_URL}" == *"ВСТАВЬ_СЮДА"* || "${CURRENT_REMNASHOP_DATABASE_URL}" == *"CHANGE_ME"* ]]; then
  replace_env_value "REMNASHOP_DATABASE_URL" ""
fi

CURRENT_SQUADS="$(read_env_value REMNAWAVE_INTERNAL_SQUAD_UUIDS || true)"
if [[ "${CURRENT_SQUADS}" == *"ВСТАВЬ_СЮДА"* || "${CURRENT_SQUADS}" == *"CHANGE_ME"* ]]; then
  replace_env_value "REMNAWAVE_INTERNAL_SQUAD_UUIDS" ""
fi

if [[ -n "${CABINET_IMAGE:-}" ]]; then
  replace_env_value "CABINET_IMAGE" "${CABINET_IMAGE}"
elif ! env_key_exists "CABINET_IMAGE"; then
  replace_env_value "CABINET_IMAGE" "${DEFAULT_CABINET_IMAGE}"
fi
if [[ -n "${COMPOSE_PROFILES+x}" ]]; then
  replace_env_value "COMPOSE_PROFILES" "${COMPOSE_PROFILES}"
elif ! env_key_exists "COMPOSE_PROFILES"; then
  if [[ "${CABINET_ENABLE_CADDY:-true}" == "false" ]]; then
    replace_env_value "COMPOSE_PROFILES" "maintenance"
  else
    replace_env_value "COMPOSE_PROFILES" "caddy,maintenance"
  fi
fi

if [[ -n "${CABINET_APP_BIND:-}" ]]; then
  replace_env_value "CABINET_APP_BIND" "${CABINET_APP_BIND}"
fi
if [[ -n "${CABINET_DB_BIND:-}" ]]; then
  replace_env_value "CABINET_DB_BIND" "${CABINET_DB_BIND}"
elif ! env_key_exists "CABINET_DB_BIND"; then
  replace_env_value "CABINET_DB_BIND" "127.0.0.1"
fi
if [[ -n "${CABINET_DB_PORT:-}" ]]; then
  replace_env_value "CABINET_DB_PORT" "${CABINET_DB_PORT}"
elif ! env_key_exists "CABINET_DB_PORT"; then
  replace_env_value "CABINET_DB_PORT" "5433"
fi

configure_app_port
configure_caddy_profile

for key in \
  CABINET_APP_BIND \
  CABINET_DB_BIND \
  CABINET_DB_PORT \
  CABINET_APP_PORT \
  CABINET_EXTERNAL_NETWORK \
  CABINET_BRAND_NAME \
  EMAIL_VERIFICATION_WEBHOOK_URL \
  EMAIL_VERIFICATION_WEBHOOK_SECRET \
  RESEND_API_KEY \
  EMAIL_FROM \
  REMNAWAVE_BASE_URL \
  REMNAWAVE_TOKEN \
  REMNAWAVE_INTERNAL_SQUAD_UUIDS \
  REMNASHOP_DB_CONTAINER \
  REMNASHOP_CRYPT_KEY \
  REMNASHOP_REDIS_URL \
  REMNASHOP_USERS_SYNC_INTERVAL_SECONDS \
  REMNASHOP_USER_SUBSCRIPTION_SYNC_STALE_SECONDS \
  REMNASHOP_REVERSE_SYNC_BATCH_SIZE \
  REMNASHOP_REVERSE_SYNC_LOOKBACK_DAYS \
  REMNASHOP_SYNC_RETRY_BATCH_SIZE \
  PAYMENT_WORKER_HEARTBEAT_MAX_AGE_SECONDS \
  RETENTION_CLEANUP_INTERVAL_SECONDS \
  YOOKASSA_SHOP_ID \
  YOOKASSA_SECRET_KEY \
  YOOKASSA_WEBHOOK_ALLOWED_IPS \
  APP_LOG_LEVEL \
  APP_REQUEST_LOGS \
  TELEGRAM_CLIENT_ID \
  TELEGRAM_CLIENT_SECRET \
  TELEGRAM_BOT_USERNAME \
  TELEGRAM_BOT_TOKEN \
  TELEGRAM_NOTIFY_CHAT_ID \
  YANDEX_CLIENT_ID \
  YANDEX_CLIENT_SECRET \
  BONUS_BOX_ENABLED \
  BONUS_BOX_RUB_PER_ATTEMPT \
  BONUS_BOX_MIN_ATTEMPTS_PER_PAYMENT \
  BONUS_BOX_MAX_ATTEMPTS_PER_PAYMENT \
  BONUS_BOX_ATTEMPT_TTL_DAYS \
  BONUS_BOX_WEEKLY_ENABLED \
  BONUS_BOX_WEEKLY_DAY \
  BONUS_BOX_WEEKLY_ATTEMPTS \
  BONUS_BOX_WEEKLY_MAX_BALANCE \
  BONUS_BOX_REFERRER_ATTEMPTS \
  BONUS_BOX_REFERRED_ATTEMPTS \
  BONUS_BOX_PROMO_EXPIRES_IN_DAYS \
  BONUS_BOX_ECONOMY_GUARD_ENABLED \
  BONUS_BOX_RARE_COOLDOWN_OPENINGS \
  BONUS_BOX_EPIC_COOLDOWN_OPENINGS \
  BONUS_BOX_LEGENDARY_COOLDOWN_OPENINGS \
  BONUS_BOX_EPIC_MIN_OPENINGS \
  BONUS_BOX_LEGENDARY_MIN_OPENINGS
do
  if [[ -n "${!key:-}" ]]; then
    replace_env_value "${key}" "${!key}"
  fi
done

CABINET_DOMAIN="$(read_env_value CABINET_DOMAIN || true)"
if ! usable_env_value "${CABINET_DOMAIN}"; then
  CABINET_DOMAIN="cabinet.example.com"
fi
prompt_required_config
normalize_url_env "REMNAWAVE_BASE_URL" "https"
configure_local_remnashop_database

EXTERNAL_NETWORK="$(read_env_value CABINET_EXTERNAL_NETWORK || true)"
EXTERNAL_NETWORK="${EXTERNAL_NETWORK:-remnawave-network}"
if ! docker network inspect "${EXTERNAL_NETWORK}" >/dev/null 2>&1; then
  echo "Creating external Docker network: ${EXTERNAL_NETWORK}"
  docker network create "${EXTERNAL_NETWORK}" >/dev/null
fi

if env_file_has_placeholders; then
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
  YOOKASSA_SHOP_ID
  YOOKASSA_SECRET_KEY

Then run this installer command again.
After services start, it will ask for the first admin email and password.

EOF
  exit 0
fi

COMPOSE=(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}")

echo "Pulling images..."
CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" pull

echo "Starting services..."
CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" up -d --remove-orphans

wait_for_app_container
bootstrap_superuser
wait_for_app_health
INSTALLED_REVISION="$(running_app_revision || remote_commit_sha || true)"
write_installed_version "${INSTALLED_REVISION}"
DEPLOY_STATE_PATH="${DEPLOY_STATE_FILE}" DEPLOY_REVISION="${INSTALLED_REVISION}" python3 <<'PY'
import json
import os
from datetime import datetime, timezone
from pathlib import Path

now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
path = Path(os.environ["DEPLOY_STATE_PATH"])
payload = {
    "status": "success",
    "startedAt": now,
    "finishedAt": now,
    "previousRevision": None,
    "targetRevision": os.environ.get("DEPLOY_REVISION") or None,
    "deployedRevision": os.environ.get("DEPLOY_REVISION") or None,
    "rollbackRevision": None,
    "message": "Первичная установка завершена и прошла локальный health-check.",
    "migrations": "ok",
    "health": {"local": "ok", "public": "skipped"},
}
temporary = path.with_suffix(".tmp")
temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
temporary.chmod(0o644)
temporary.replace(path)
PY
mkdir -p /var/cache/remnawave-cabinet 2>/dev/null || true
printf '%s|%s\n' "$(date +%s)" latest >/var/cache/remnawave-cabinet/update-status 2>/dev/null || true

echo "Deploy complete."
echo "Management menu:"
echo "  cabinetctl"
echo "Useful commands:"
echo "  cd ${INSTALL_DIR} && docker compose --env-file .env -f docker-compose.yml ps"
echo "  cd ${INSTALL_DIR} && docker compose --env-file .env -f docker-compose.yml logs -f app"
echo "  cd ${INSTALL_DIR} && docker compose --env-file .env -f docker-compose.yml logs -f worker"
echo "  cd ${INSTALL_DIR} && docker compose --env-file .env -f docker-compose.yml logs -f watch-worker"

#!/usr/bin/env bash
set -euo pipefail

BRANCH="${BRANCH:-main}"
RAW_BASE_URL="${RAW_BASE_URL:-https://raw.githubusercontent.com/asdcrosh/cabinet_remna/${BRANCH}}"
GITHUB_API_URL="${GITHUB_API_URL:-https://api.github.com/repos/asdcrosh/cabinet_remna/commits/${BRANCH}}"
COMPOSE_URL="${COMPOSE_URL:-${RAW_BASE_URL}/deploy/docker-compose.server.yml}"
ENV_TEMPLATE_URL="${ENV_TEMPLATE_URL:-${RAW_BASE_URL}/deploy/env.production.example}"
INSTALL_DIR="${INSTALL_DIR:-/opt/remnawave-cabinet}"
COMPOSE_FILE="${INSTALL_DIR}/docker-compose.yml"
ENV_FILE="${INSTALL_DIR}/.env"
VERSION_FILE="${INSTALL_DIR}/.cabinet-version"
DEPLOY_NOTIFICATION_FILE="${INSTALL_DIR}/.last-deploy-notification"
CABINETCTL_URL="${CABINETCTL_URL:-${RAW_BASE_URL}/deploy/cabinetctl.sh}"
CABINETCTL_PATH="${CABINETCTL_PATH:-/usr/local/bin/cabinetctl}"
CABINETCTL_TEMP="${CABINETCTL_PATH}.tmp"
FULL_BACKUP_URL="${FULL_BACKUP_URL:-${RAW_BASE_URL}/deploy/full-stack-backup.sh}"
FULL_BACKUP_PATH="${FULL_BACKUP_PATH:-/usr/local/bin/remna-backup}"
FULL_BACKUP_TEMP="${FULL_BACKUP_PATH}.tmp"
ENV_TEMPLATE_TEMP="${INSTALL_DIR}/.env.template.tmp"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root or with sudo:"
  echo "  curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/update-server.sh | sudo bash"
  exit 1
fi

if [[ ! -d "${INSTALL_DIR}" ]]; then
  echo "${INSTALL_DIR} does not exist."
  echo "Run first install instead:"
  echo "  curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/install-server.sh | sudo bash"
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "${ENV_FILE} not found. Update cannot continue without existing production env."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Docker and Docker Compose plugin are required. Run install-server.sh first."
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

installed_version_revision() {
  local revision
  [[ -f "${VERSION_FILE}" ]] || return 1
  revision="$(sed -n 's/^commit=//p' "${VERSION_FILE}" 2>/dev/null | head -n 1)"
  if [[ "${revision}" =~ ^[0-9a-f]{40}$ ]]; then
    printf '%s\n' "${revision}"
    return 0
  fi
  return 1
}

last_notified_revision() {
  local revision
  [[ -f "${DEPLOY_NOTIFICATION_FILE}" ]] || return 1
  revision="$(head -n 1 "${DEPLOY_NOTIFICATION_FILE}" 2>/dev/null || true)"
  if [[ "${revision}" =~ ^[0-9a-f]{40}$ ]]; then
    printf '%s\n' "${revision}"
    return 0
  fi
  return 1
}

cd "${INSTALL_DIR}"
PREVIOUS_DEPLOYED_REVISION="$(running_app_revision || installed_version_revision || true)"

if docker inspect remnashop >/dev/null 2>&1; then
  ENV_FILE_PATH="${ENV_FILE}" python3 <<'PY'
from pathlib import Path
import os

path = Path(os.environ["ENV_FILE_PATH"])
lines = path.read_text().splitlines()
key = "REMNASHOP_API_URL"
value = "http://remnashop:5000/api/v1/public"
for index, line in enumerate(lines):
    if line.startswith(f"{key}="):
        current = line.split("=", 1)[1].strip().strip("\"'")
        if not current:
            lines[index] = f'{key}="{value}"'
        break
else:
    lines.append(f'{key}="{value}"')
path.write_text("\n".join(lines) + "\n")
PY
fi

configure_remnashop_link_function() {
  local container="${REMNASHOP_DB_CONTAINER:-remnashop-db}"
  local db_user db_name
  if ! docker inspect "${container}" >/dev/null 2>&1; then
    return
  fi
  db_user="$(docker inspect "${container}" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^POSTGRES_USER=//p' | head -n1)"
  db_name="$(docker inspect "${container}" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^POSTGRES_DB=//p' | head -n1)"
  if [[ -z "${db_user}" || -z "${db_name}" ]]; then
    return
  fi
  echo "Updating secure Remnashop account-link function..."
  curl -fsSL "${RAW_BASE_URL}/deploy/remnashop-cabinet-link.sql" \
    | docker exec -i "${container}" psql -v ON_ERROR_STOP=1 -U "${db_user}" -d "${db_name}" >/dev/null
}

read_update_env_value() {
  local key="$1"
  awk -F= -v key="${key}" '
    $1 == key {
      sub(/^[^=]*=/, "")
      gsub(/^"|"$/, "")
      print
      exit
    }
  ' "${ENV_FILE}" 2>/dev/null || true
}

write_update_env_value() {
  local key="$1"
  local value="$2"
  ENV_FILE_PATH="${ENV_FILE}" python3 - "${key}" "${value}" <<'PY'
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

host_port_available() {
  local bind_address="$1"
  local port="$2"

  if command -v ss >/dev/null 2>&1; then
    if ss -H -ltn "sport = :${port}" 2>/dev/null | grep -q .; then
      return 1
    fi
  fi

  python3 - "${bind_address}" "${port}" <<'PY'
import socket
import sys

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    sock.bind((sys.argv[1], int(sys.argv[2])))
except OSError:
    sys.exit(1)
finally:
    sock.close()
PY
}

disable_bundled_caddy_if_conflicting() {
  local current_profiles
  local normalized_profiles
  local next_profiles
  local own_caddy_running

  current_profiles="$(read_update_env_value COMPOSE_PROFILES)"
  normalized_profiles=",${current_profiles// /},"
  if [[ "${normalized_profiles}" != *",caddy,"* ]]; then
    return 1
  fi

  own_caddy_running="$(docker inspect remnawave-cabinet-caddy --format '{{.State.Running}}' 2>/dev/null || true)"
  if [[ "${own_caddy_running}" == "true" ]]; then
    return 1
  fi

  if host_port_available "0.0.0.0" "80" && host_port_available "0.0.0.0" "443"; then
    return 1
  fi

  next_profiles=",${current_profiles// /},"
  next_profiles="${next_profiles//,caddy,/,}"
  next_profiles="${next_profiles#,}"
  next_profiles="${next_profiles%,}"
  write_update_env_value "COMPOSE_PROFILES" "${next_profiles}"
  docker rm -f remnawave-cabinet-caddy >/dev/null 2>&1 || true
  echo "Ports 80/443 are already in use. Bundled Caddy is disabled; the existing reverse proxy stays in charge."
  return 0
}

if ! grep -q '^CABINET_DB_PORT=' "${ENV_FILE}"; then
  current_db_port="$(docker inspect remnawave-cabinet-db --format '{{with index .HostConfig.PortBindings "5432/tcp"}}{{(index . 0).HostPort}}{{end}}' 2>/dev/null || true)"
  current_db_bind="$(docker inspect remnawave-cabinet-db --format '{{with index .HostConfig.PortBindings "5432/tcp"}}{{(index . 0).HostIp}}{{end}}' 2>/dev/null || true)"
  if [[ -n "${current_db_port}" ]]; then
    printf '\nCABINET_DB_BIND="%s"\nCABINET_DB_PORT="%s"\n' "${current_db_bind:-127.0.0.1}" "${current_db_port}" >>"${ENV_FILE}"
    echo "Preserved current database port ${current_db_bind:-127.0.0.1}:${current_db_port} in .env."
  fi
fi

echo "Synchronizing .env schema..."
curl -fsSL --connect-timeout 5 --max-time 20 "${ENV_TEMPLATE_URL}" -o "${ENV_TEMPLATE_TEMP}"
ENV_FILE_PATH="${ENV_FILE}" ENV_TEMPLATE_PATH="${ENV_TEMPLATE_TEMP}" python3 <<'PY'
from pathlib import Path
import os
import re
import secrets

path = Path(os.environ["ENV_FILE_PATH"])
template_path = Path(os.environ["ENV_TEMPLATE_PATH"])
original_lines = path.read_text().splitlines()
obsolete = {"CABINET_OPS_IMAGE", "CABINET_PULL_POLICY"}
assignment = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$")
lines = []
existing = {}
for line in original_lines:
    match = assignment.match(line.strip())
    if match and match.group(1) in obsolete:
        continue
    lines.append(line)
    if match:
        existing[match.group(1)] = match.group(2).strip().strip("\"'")

domain = existing.get("CABINET_DOMAIN", "")
brand = existing.get("CABINET_BRAND_NAME", "")
generated_secrets = {
    "JWT_SECRET",
    "HEALTHCHECK_TOKEN",
    "BROADCAST_UPLOAD_SIGNING_SECRET",
    "EMAIL_VERIFICATION_WEBHOOK_SECRET",
}
additions = []
added_keys = []
for raw_line in template_path.read_text().splitlines():
    match = assignment.match(raw_line.strip())
    if not match:
        continue
    key, raw_value = match.groups()
    if key in existing or key in obsolete:
        continue
    value = raw_value
    if domain:
        value = value.replace("ВСТАВЬ_СЮДА_ДОМЕН_КАБИНЕТА", domain)
    if brand:
        value = value.replace("ВСТАВЬ_СЮДА_НАЗВАНИЕ_СЕРВИСА", brand)
    if key in generated_secrets and "ВСТАВЬ_СЮДА" in value:
        value = f'"{secrets.token_hex(32)}"'
    additions.append(f"{key}={value}")
    added_keys.append(key)

changed = lines != original_lines
if additions:
    if lines and lines[-1].strip():
        lines.append("")
    lines.append("# Added automatically during cabinet update from the current env template.")
    lines.extend(additions)
    changed = True
if changed:
    path.write_text("\n".join(lines) + "\n")
if added_keys:
    print(f"Added {len(added_keys)} new .env variables.")
PY
rm -f "${ENV_TEMPLATE_TEMP}"

echo "Updating compose file..."
curl -fsSL "${COMPOSE_URL}" -o "${COMPOSE_FILE}"
curl -fsSL "${CABINETCTL_URL}" -o "${CABINETCTL_TEMP}"
install -m 755 "${CABINETCTL_TEMP}" "${CABINETCTL_PATH}"
rm -f "${CABINETCTL_TEMP}"
curl -fsSL "${FULL_BACKUP_URL}" -o "${FULL_BACKUP_TEMP}"
install -m 755 "${FULL_BACKUP_TEMP}" "${FULL_BACKUP_PATH}"
rm -f "${FULL_BACKUP_TEMP}"
rm -f /usr/local/bin/remnactl
configure_remnashop_link_function
disable_bundled_caddy_if_conflicting || true

COMPOSE=(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}")

echo "Pulling latest images..."
CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" pull

echo "Preparing one-shot services..."
CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" rm -fsv check-env migrate seed >/dev/null 2>&1 || true

if ! grep -Eq '^COMPOSE_PROFILES=.*caddy' "${ENV_FILE}"; then
  CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" rm -fsv caddy >/dev/null 2>&1 || true
fi

echo "Applying migrations and restarting services..."
if ! CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" up -d --remove-orphans; then
  if disable_bundled_caddy_if_conflicting; then
    CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" up -d --remove-orphans
  else
    exit 1
  fi
fi

# A mutable `latest` tag can be pulled successfully while Compose keeps an
# already-running container. Recreate runtime services explicitly so the
# update always starts the image that was just pulled without touching the DB.
echo "Recreating runtime services from the pulled image..."
CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" up -d --no-deps --force-recreate \
  app worker broadcast-worker

wait_for_container() {
  local service="$1"
  local attempts="${2:-60}"
  local status=""

  for _ in $(seq 1 "${attempts}"); do
    status="$(CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" ps --status running --format '{{.Service}}' 2>/dev/null | grep -x "${service}" || true)"
    if [[ "${status}" == "${service}" ]]; then
      return 0
    fi
    sleep 2
  done

  echo "Service ${service} did not start in time."
  return 1
}

env_value() {
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

notify_telegram_deploy() {
  local previous_revision="$1"
  local deployed_revision="$2"
  local bot_token chat_id app_url brand_name message notified_revision

  if [[ ! "${deployed_revision}" =~ ^[0-9a-f]{40}$ ]]; then
    echo "Warning: Telegram deploy notification skipped because the running image revision is unknown." >&2
    return 0
  fi

  notified_revision="$(last_notified_revision || true)"
  if [[ "${notified_revision}" == "${deployed_revision}" ]]; then
    echo "Telegram deploy notification already sent for ${deployed_revision:0:7}."
    return 0
  fi

  bot_token="$(env_value TELEGRAM_BOT_TOKEN)"
  chat_id="$(env_value TELEGRAM_NOTIFY_CHAT_ID)"
  if [[ -z "${bot_token}" || -z "${chat_id}" ]]; then
    echo "Warning: Telegram deploy notification is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_NOTIFY_CHAT_ID." >&2
    return 0
  fi

  app_url="$(env_value APP_URL)"
  brand_name="$(env_value CABINET_BRAND_NAME)"
  brand_name="${brand_name:-Кабинет}"
  message="${brand_name} обновлён

Новая версия успешно развёрнута и прошла health-check.
Версия: ${deployed_revision:0:7}
Время: $(date -u '+%d.%m.%Y %H:%M UTC')"
  if [[ "${previous_revision}" =~ ^[0-9a-f]{40}$ && "${previous_revision}" != "${deployed_revision}" ]]; then
    message="${message}
Предыдущая: ${previous_revision:0:7}"
  fi
  if [[ -n "${app_url}" ]]; then
    message="${message}
Сайт: ${app_url%/}"
  fi

  if curl -fsS --max-time 10 \
    -X POST "https://api.telegram.org/bot${bot_token}/sendMessage" \
    --data-urlencode "chat_id=${chat_id}" \
    --data-urlencode "text=${message}" \
    --data "disable_web_page_preview=true" >/dev/null; then
    printf '%s\n' "${deployed_revision}" >"${DEPLOY_NOTIFICATION_FILE}" 2>/dev/null || true
    echo "Telegram deploy notification sent."
  else
    echo "Warning: deployment succeeded, but Telegram notification failed." >&2
  fi
}

is_truthy() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|y|Y) return 0 ;;
    *) return 1 ;;
  esac
}

image_is_used() {
  local image="$1"
  docker ps -a --filter "ancestor=${image}" --format '{{.ID}}' 2>/dev/null | grep -q .
}

remove_image_if_unused() {
  local image="$1"

  if [[ -z "${image}" ]]; then
    return
  fi

  if ! docker image inspect "${image}" >/dev/null 2>&1; then
    return
  fi

  if image_is_used "${image}"; then
    echo "Keeping image in use: ${image}"
    return
  fi

  if docker image rm -f "${image}" >/dev/null 2>&1; then
    echo "Removed unused image: ${image}"
  fi
}

cleanup_docker_artifacts() {
  if is_truthy "${UPDATE_SKIP_DOCKER_CLEANUP:-false}"; then
    echo "Docker cleanup skipped by UPDATE_SKIP_DOCKER_CLEANUP."
    return
  fi

  echo "Removing completed one-shot containers..."
  CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" rm -fsv check-env migrate seed >/dev/null 2>&1 || true

  echo "Removing unused legacy project images..."
  for image in \
    ghcr.io/asdcrosh/cabinet_remna:ops-latest \
    remnawave-cabinet-app \
    remnawave-cabinet-worker \
    remnawave-cabinet-migrate \
    remnawave-cabinet-check-env \
    remnawave-cabinet-seed \
    cabinet_remna-app \
    cabinet_remna-worker \
    cabinet_remna-migrate
  do
    remove_image_if_unused "${image}"
  done

  docker image ls --quiet --filter "label=com.docker.compose.project=remnawave-cabinet" \
    | sort -u \
    | while read -r image_id; do
        remove_image_if_unused "${image_id}"
      done || true

  echo "Pruning dangling Docker images..."
  docker image prune -f >/dev/null || true

  if is_truthy "${UPDATE_PRUNE_BUILD_CACHE:-false}"; then
    local max_age="${UPDATE_BUILD_CACHE_MAX_AGE:-168h}"
    echo "Pruning Docker build cache older than ${max_age}..."
    docker builder prune -f --filter "until=${max_age}" >/dev/null || true
  fi
}

wait_for_url() {
  local url="$1"
  local timeout_seconds="$2"
  shift 2
  local start
  start="$(date +%s)"

  until curl -fsS "$@" "${url}" >/dev/null; do
    if (( $(date +%s) - start >= timeout_seconds )); then
      echo "Timed out waiting for ${url}"
      return 1
    fi
    sleep 2
  done
}

wait_for_container app 60

CABINET_APP_BIND="$(env_value CABINET_APP_BIND)"
CABINET_APP_PORT="$(env_value CABINET_APP_PORT)"
APP_URL="$(env_value APP_URL)"
HEALTHCHECK_TOKEN="$(env_value HEALTHCHECK_TOKEN)"

CABINET_APP_BIND="${CABINET_APP_BIND:-127.0.0.1}"
CABINET_APP_PORT="${CABINET_APP_PORT:-3000}"

echo "Checking local app on ${CABINET_APP_BIND}:${CABINET_APP_PORT}..."
wait_for_url "http://${CABINET_APP_BIND}:${CABINET_APP_PORT}/login" 60

if [[ -n "${APP_URL}" && -n "${HEALTHCHECK_TOKEN}" ]]; then
  echo "Checking public health..."
  wait_for_url "${APP_URL%/}/api/health" 60 -H "x-healthcheck-token: ${HEALTHCHECK_TOKEN}"
fi

cleanup_docker_artifacts
DEPLOYED_REVISION="$(running_app_revision || true)"
VERSION_TO_RECORD="${DEPLOYED_REVISION:-$(remote_commit_sha || true)}"
write_installed_version "${VERSION_TO_RECORD}"
mkdir -p /var/cache/remnawave-cabinet 2>/dev/null || true
printf '%s|%s\n' "$(date +%s)" latest >/var/cache/remnawave-cabinet/update-status 2>/dev/null || true
notify_telegram_deploy "${PREVIOUS_DEPLOYED_REVISION}" "${DEPLOYED_REVISION}"

echo "Update complete."
echo "Management menu:"
echo "  cabinetctl"
echo "Useful commands:"
echo "  cd ${INSTALL_DIR} && docker compose --env-file .env -f docker-compose.yml ps"
echo "  cd ${INSTALL_DIR} && docker compose --env-file .env -f docker-compose.yml logs -f app"
echo "  cd ${INSTALL_DIR} && docker compose --env-file .env -f docker-compose.yml logs -f worker"

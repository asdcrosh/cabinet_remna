#!/usr/bin/env bash
set -euo pipefail

BRANCH="${BRANCH:-main}"
RAW_BASE_URL="${RAW_BASE_URL:-https://raw.githubusercontent.com/asdcrosh/cabinet_remna/${BRANCH}}"
COMPOSE_URL="${COMPOSE_URL:-${RAW_BASE_URL}/deploy/docker-compose.server.yml}"
INSTALL_DIR="${INSTALL_DIR:-/opt/remnawave-cabinet}"
COMPOSE_FILE="${INSTALL_DIR}/docker-compose.yml"
ENV_FILE="${INSTALL_DIR}/.env"
CABINETCTL_URL="${CABINETCTL_URL:-${RAW_BASE_URL}/deploy/cabinetctl.sh}"
CABINETCTL_PATH="${CABINETCTL_PATH:-/usr/local/bin/cabinetctl}"
CABINETCTL_TEMP="${CABINETCTL_PATH}.tmp"

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

cd "${INSTALL_DIR}"

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

ENV_FILE_PATH="${ENV_FILE}" python3 <<'PY'
from pathlib import Path
import os

path = Path(os.environ["ENV_FILE_PATH"])
lines = path.read_text().splitlines()
defaults = {
    "APP_LOG_LEVEL": "info",
    "APP_REQUEST_LOGS": "true",
    "REMNASHOP_USER_SUBSCRIPTION_SYNC_STALE_SECONDS": "300",
}
existing = {
    line.split("=", 1)[0].strip()
    for line in lines
    if line.strip() and not line.strip().startswith("#") and "=" in line
}
changed = False
for key, value in defaults.items():
    if key not in existing:
        lines.append(f'{key}="{value}"')
        changed = True
if changed:
    path.write_text("\n".join(lines) + "\n")
PY

echo "Updating compose file..."
curl -fsSL "${COMPOSE_URL}" -o "${COMPOSE_FILE}"
curl -fsSL "${CABINETCTL_URL}" -o "${CABINETCTL_TEMP}"
install -m 755 "${CABINETCTL_TEMP}" "${CABINETCTL_PATH}"
rm -f "${CABINETCTL_TEMP}"
configure_remnashop_link_function

COMPOSE=(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}")

echo "Pulling latest images..."
CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" pull

echo "Preparing one-shot services..."
CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" rm -fsv check-env migrate seed >/dev/null 2>&1 || true

if ! grep -Eq '^COMPOSE_PROFILES=.*caddy' "${ENV_FILE}"; then
  CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" rm -fsv caddy >/dev/null 2>&1 || true
fi

echo "Applying migrations and restarting services..."
CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" up -d --remove-orphans

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

echo "Update complete."
echo "Management menu:"
echo "  cabinetctl"
echo "Useful commands:"
echo "  cd ${INSTALL_DIR} && docker compose --env-file .env -f docker-compose.yml ps"
echo "  cd ${INSTALL_DIR} && docker compose --env-file .env -f docker-compose.yml logs -f app"
echo "  cd ${INSTALL_DIR} && docker compose --env-file .env -f docker-compose.yml logs -f worker"

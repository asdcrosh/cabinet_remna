#!/usr/bin/env bash
set -Eeuo pipefail

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
STATE_DIR="${CABINET_STATE_DIR:-${INSTALL_DIR}/state}"
DEPLOY_STATE_FILE="${STATE_DIR}/deployment.json"
CABINETCTL_URL="${CABINETCTL_URL:-${RAW_BASE_URL}/deploy/cabinetctl.sh}"
CABINETCTL_PATH="${CABINETCTL_PATH:-/usr/local/bin/cabinetctl}"
CABINETCTL_TEMP="${CABINETCTL_PATH}.tmp"
FULL_BACKUP_URL="${FULL_BACKUP_URL:-${RAW_BASE_URL}/deploy/full-stack-backup.sh}"
FULL_BACKUP_PATH="${FULL_BACKUP_PATH:-/usr/local/bin/remna-backup}"
FULL_BACKUP_TEMP="${FULL_BACKUP_PATH}.tmp"
ENV_TEMPLATE_TEMP="${INSTALL_DIR}/.env.template.tmp"
NODE_PROVISIONING_CONFIG_URL="${NODE_PROVISIONING_CONFIG_URL:-${RAW_BASE_URL}/deploy/configure-node-provisioning.sh}"
NODE_PROVISIONING_CONFIG_PATH="${NODE_PROVISIONING_CONFIG_PATH:-/usr/local/bin/cabinet-node-provisioning}"
NODE_PROVISIONING_CONFIG_TEMP="${NODE_PROVISIONING_CONFIG_PATH}.tmp"
NGINX_CONF="${NGINX_CONF:-/opt/remnawave/nginx/nginx.conf}"
NGINX_CONTAINER="${NGINX_CONTAINER:-remnawave-nginx}"
OFFICIAL_CABINET_IMAGE="ghcr.io/asdcrosh/cabinet_remna"
OFFICIAL_PROVISIONER_IMAGE="ghcr.io/asdcrosh/cabinet_remna-provisioner"
TARGET_CABINET_IMAGE=""
TARGET_PROVISIONER_IMAGE=""

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root or with sudo:"
  echo "  sudo cabinetctl update"
  exit 1
fi

if [[ ! -d "${INSTALL_DIR}" ]]; then
  echo "${INSTALL_DIR} does not exist."
  echo "Run first install instead:"
  echo "  sudo cabinetctl install"
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

running_app_image_id() {
  docker inspect remnawave-cabinet-app --format '{{.Image}}' 2>/dev/null || true
}

running_provisioner_revision() {
  local image_id revision
  image_id="$(docker inspect remnawave-cabinet-node-provisioning-worker --format '{{.Image}}' 2>/dev/null || true)"
  [[ -n "${image_id}" ]] || return 1
  revision="$(docker image inspect "${image_id}" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' 2>/dev/null || true)"
  if [[ "${revision}" =~ ^[0-9a-f]{40}$ ]]; then
    printf '%s\n' "${revision}"
    return 0
  fi
  return 1
}

running_provisioner_image_id() {
  docker inspect remnawave-cabinet-node-provisioning-worker --format '{{.Image}}' 2>/dev/null || true
}

image_revision() {
  local image="$1"
  local revision
  [[ -n "${image}" ]] || return 1
  revision="$(docker image inspect "${image}" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' 2>/dev/null || true)"
  if [[ "${revision}" =~ ^[0-9a-f]{40}$ ]]; then
    printf '%s\n' "${revision}"
    return 0
  fi
  return 1
}

configure_target_image() {
  local expected_image="" expected_provisioner_image=""

  if [[ -n "${CABINET_RELEASE_SHA:-}" && ! "${CABINET_RELEASE_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
    echo "Invalid CABINET_RELEASE_SHA: ${CABINET_RELEASE_SHA}" >&2
    return 1
  fi

  if [[ "${CABINET_RELEASE_SHA:-}" =~ ^[0-9a-f]{40}$ ]]; then
    expected_image="${OFFICIAL_CABINET_IMAGE}:sha-${CABINET_RELEASE_SHA}"
    expected_provisioner_image="${OFFICIAL_PROVISIONER_IMAGE}:sha-${CABINET_RELEASE_SHA}"
    if [[ -n "${CABINET_IMAGE:-}" && "${CABINET_IMAGE}" != "${expected_image}" ]]; then
      echo "CABINET_IMAGE does not match release ${CABINET_RELEASE_SHA}: ${CABINET_IMAGE}" >&2
      return 1
    fi
    TARGET_CABINET_IMAGE="${expected_image}"
    TARGET_PROVISIONER_IMAGE="${expected_provisioner_image}"
  else
    TARGET_CABINET_IMAGE="${CABINET_IMAGE:-$(read_update_env_value CABINET_IMAGE)}"
    TARGET_CABINET_IMAGE="${TARGET_CABINET_IMAGE:-${OFFICIAL_CABINET_IMAGE}:latest}"
    TARGET_PROVISIONER_IMAGE="${CABINET_PROVISIONER_IMAGE:-$(read_update_env_value CABINET_PROVISIONER_IMAGE)}"
    TARGET_PROVISIONER_IMAGE="${TARGET_PROVISIONER_IMAGE:-${OFFICIAL_PROVISIONER_IMAGE}:latest}"
  fi

  CABINET_IMAGE="${TARGET_CABINET_IMAGE}"
  CABINET_PROVISIONER_IMAGE="${TARGET_PROVISIONER_IMAGE}"
  export CABINET_IMAGE CABINET_PROVISIONER_IMAGE
}

provisioning_profile_enabled() {
  [[ ",$(read_update_env_value COMPOSE_PROFILES | tr -d ' ')," == *",provisioning,"* ]]
}

pull_progress_snapshot() {
  local log_file="$1"
  local elapsed="$2"
  python3 - "${log_file}" "${elapsed}" <<'PY'
import re
import sys

path = sys.argv[1]
elapsed = max(int(sys.argv[2]), 1)
units = {
    "b": 1,
    "kb": 1_000,
    "kib": 1_024,
    "mb": 1_000_000,
    "mib": 1_048_576,
    "gb": 1_000_000_000,
    "gib": 1_073_741_824,
    "tb": 1_000_000_000_000,
    "tib": 1_099_511_627_776,
}
layers = {}
pattern = re.compile(
    r"^([0-9a-f]{4,64})(?::|\s+)\s*.*?Downloading.*?"
    r"([0-9.]+)\s*(B|kB|KiB|MB|MiB|GB|GiB|TB|TiB)\s*/\s*"
    r"([0-9.]+)\s*(B|kB|KiB|MB|MiB|GB|GiB|TB|TiB)",
    re.IGNORECASE,
)
ansi_escape = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")

try:
    content = open(path, "rb").read().decode("utf-8", "replace").replace("\r", "\n")
except OSError:
    sys.exit(0)

for line in content.splitlines():
    match = pattern.search(ansi_escape.sub("", line).strip())
    if not match:
        continue
    layer, current, current_unit, total, total_unit = match.groups()
    current_bytes = float(current) * units[current_unit.lower()]
    total_bytes = float(total) * units[total_unit.lower()]
    if total_bytes > 0:
        layers[layer] = (min(current_bytes, total_bytes), total_bytes)

if not layers:
    sys.exit(0)

downloaded = sum(value[0] for value in layers.values())
total = sum(value[1] for value in layers.values())
percent = min(100, max(0, round(downloaded * 100 / total)))
if downloaded <= 0 or downloaded >= total:
    print(f"{percent}|-1")
else:
    eta = max(1, round((total - downloaded) / (downloaded / elapsed)))
    print(f"{percent}|{eta}")
PY
}

format_eta() {
  local seconds="$1"
  if ((seconds < 60)); then
    printf '%s сек.' "${seconds}"
  elif ((seconds < 3600)); then
    printf '%s мин.' "$(((seconds + 59) / 60))"
  else
    printf '%s ч. %s мин.' "$((seconds / 3600))" "$(((seconds % 3600 + 59) / 60))"
  fi
}

format_elapsed() {
  local seconds="$1"
  if ((seconds < 60)); then
    printf '%s сек.' "${seconds}"
  elif ((seconds < 3600)); then
    printf '%s мин. %s сек.' "$((seconds / 60))" "$((seconds % 60))"
  else
    printf '%s ч. %s мин.' "$((seconds / 3600))" "$(((seconds % 3600) / 60))"
  fi
}

pull_target_image() {
  local log_file pull_pid started_at elapsed pull_status=0 snapshot percent eta eta_label elapsed_label

  log_file="$(mktemp)"
  started_at="$(date +%s)"
  docker pull "${TARGET_CABINET_IMAGE}" >"${log_file}" 2>&1 &
  pull_pid=$!

  if [[ -t 1 ]]; then
    while kill -0 "${pull_pid}" 2>/dev/null; do
      elapsed=$(($(date +%s) - started_at))
      snapshot="$(pull_progress_snapshot "${log_file}" "${elapsed}" || true)"
      if [[ "${snapshot}" =~ ^([0-9]+)\|(-?[0-9]+)$ ]]; then
        percent="${BASH_REMATCH[1]}"
        eta="${BASH_REMATCH[2]}"
        if ((eta >= 0)); then
          eta_label="$(format_eta "${eta}")"
          printf '\r\033[2K[ 20%%] Загрузка образа кабинета: %s%%, осталось ~%s' "${percent}" "${eta_label}"
        else
          printf '\r\033[2K[ 20%%] Загрузка образа кабинета: завершаем...'
        fi
      else
        elapsed_label="$(format_elapsed "${elapsed}")"
        printf '\r\033[2K[ 20%%] Загрузка образа кабинета: прошло %s, ETA уточняется...' "${elapsed_label}"
      fi
      sleep 2
    done
    printf '\r\033[2K'
  fi

  wait "${pull_pid}" || pull_status=$?
  if ((pull_status != 0)); then
    cat "${log_file}" >&2
    rm -f "${log_file}"
    return "${pull_status}"
  fi
  elapsed=$(($(date +%s) - started_at))
  elapsed_label="$(format_elapsed "${elapsed}")"
  printf '[ 20%%] Загрузка образа кабинета: завершена за %s\n' "${elapsed_label}"
  rm -f "${log_file}"
}

pull_target_provisioner_image() {
  echo "Pulling node provisioner image..."
  docker pull "${TARGET_PROVISIONER_IMAGE}" >/dev/null
}

verify_target_image() {
  local pulled_revision

  echo "Target cabinet image: ${TARGET_CABINET_IMAGE}"
  if [[ "${CABINET_RELEASE_SHA:-}" =~ ^[0-9a-f]{40}$ ]]; then
    echo "Target cabinet revision: ${CABINET_RELEASE_SHA}"
  fi
  pulled_revision="$(image_revision "${TARGET_CABINET_IMAGE}" || true)"
  if [[ ! "${pulled_revision}" =~ ^[0-9a-f]{40}$ ]]; then
    echo "Pulled cabinet image has no valid org.opencontainers.image.revision label." >&2
    return 1
  fi
  if [[ "${CABINET_RELEASE_SHA:-}" =~ ^[0-9a-f]{40}$ && "${pulled_revision}" != "${CABINET_RELEASE_SHA}" ]]; then
    echo "Pulled image revision ${pulled_revision} does not match requested release ${CABINET_RELEASE_SHA}." >&2
    return 1
  fi
  DEPLOY_TARGET_REVISION="${pulled_revision}"
}

verify_target_provisioner_image() {
  local pulled_revision

  echo "Target provisioner image: ${TARGET_PROVISIONER_IMAGE}"
  pulled_revision="$(image_revision "${TARGET_PROVISIONER_IMAGE}" || true)"
  if [[ ! "${pulled_revision}" =~ ^[0-9a-f]{40}$ ]]; then
    echo "Pulled provisioner image has no valid org.opencontainers.image.revision label." >&2
    return 1
  fi
  if [[ "${CABINET_RELEASE_SHA:-}" =~ ^[0-9a-f]{40}$ && "${pulled_revision}" != "${CABINET_RELEASE_SHA}" ]]; then
    echo "Pulled provisioner image revision ${pulled_revision} does not match requested release ${CABINET_RELEASE_SHA}." >&2
    return 1
  fi
}

DEPLOY_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DEPLOY_TARGET_REVISION=""
DEPLOYED_REVISION=""
ROLLBACK_REVISION=""
ROLLBACK_IMAGE=""
ROLLBACK_PROVISIONER_IMAGE=""
ROLLBACK_ARMED="false"
MIGRATION_STATUS="pending"
LOCAL_HEALTH_STATUS="pending"
PUBLIC_HEALTH_STATUS="pending"
DEPLOY_STAGE="starting"
DEPLOY_PROGRESS=0
DEPLOY_CANDIDATE_STARTED="false"
DEPLOY_PROXY_SWITCHED="false"

write_deployment_state() {
  local status="$1"
  local message="$2"
  local finished_at="${3:-}"
  mkdir -p "${STATE_DIR}"
  chmod 755 "${STATE_DIR}" 2>/dev/null || true
  DEPLOY_STATE_PATH="${DEPLOY_STATE_FILE}" \
    DEPLOY_STATUS="${status}" \
    DEPLOY_MESSAGE="${message}" \
    DEPLOY_STARTED_AT_VALUE="${DEPLOY_STARTED_AT}" \
    DEPLOY_FINISHED_AT_VALUE="${finished_at}" \
    DEPLOY_PREVIOUS_REVISION_VALUE="${PREVIOUS_DEPLOYED_REVISION:-}" \
    DEPLOY_TARGET_REVISION_VALUE="${DEPLOY_TARGET_REVISION}" \
    DEPLOYED_REVISION_VALUE="${DEPLOYED_REVISION}" \
    ROLLBACK_REVISION_VALUE="${ROLLBACK_REVISION}" \
    MIGRATION_STATUS_VALUE="${MIGRATION_STATUS}" \
    LOCAL_HEALTH_STATUS_VALUE="${LOCAL_HEALTH_STATUS}" \
    PUBLIC_HEALTH_STATUS_VALUE="${PUBLIC_HEALTH_STATUS}" \
    DEPLOY_STAGE_VALUE="${DEPLOY_STAGE}" \
    DEPLOY_PROGRESS_VALUE="${DEPLOY_PROGRESS}" \
    python3 <<'PY'
import json
import os
from pathlib import Path

path = Path(os.environ["DEPLOY_STATE_PATH"])
payload = {
    "status": os.environ["DEPLOY_STATUS"],
    "startedAt": os.environ["DEPLOY_STARTED_AT_VALUE"],
    "previousRevision": os.environ.get("DEPLOY_PREVIOUS_REVISION_VALUE") or None,
    "targetRevision": os.environ.get("DEPLOY_TARGET_REVISION_VALUE") or None,
    "deployedRevision": os.environ.get("DEPLOYED_REVISION_VALUE") or None,
    "rollbackRevision": os.environ.get("ROLLBACK_REVISION_VALUE") or None,
    "message": os.environ.get("DEPLOY_MESSAGE") or None,
    "stage": os.environ.get("DEPLOY_STAGE_VALUE") or None,
    "progress": int(os.environ.get("DEPLOY_PROGRESS_VALUE") or 0),
    "migrations": os.environ["MIGRATION_STATUS_VALUE"],
    "health": {
        "local": os.environ["LOCAL_HEALTH_STATUS_VALUE"],
        "public": os.environ["PUBLIC_HEALTH_STATUS_VALUE"],
    },
}
finished_at = os.environ.get("DEPLOY_FINISHED_AT_VALUE")
if finished_at:
    payload["finishedAt"] = finished_at
temporary = path.with_suffix(".tmp")
temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
temporary.chmod(0o644)
temporary.replace(path)
PY
}

print_deploy_progress() {
  local progress="$1"
  local label="$2"
  printf '[%3d%%] %s\n' "${progress}" "${label}"
}

set_deploy_stage() {
  local progress="$1"
  local stage="$2"
  local label="$3"
  local message="$4"
  DEPLOY_PROGRESS="${progress}"
  DEPLOY_STAGE="${stage}"
  print_deploy_progress "${progress}" "${label}"
  write_deployment_state "deploying" "${message}"
}

wait_for_successful_container() {
  local container="$1"
  local attempts="${2:-90}"
  local status="" exit_code=""

  for _ in $(seq 1 "${attempts}"); do
    status="$(docker inspect "${container}" --format '{{.State.Status}}' 2>/dev/null || true)"
    exit_code="$(docker inspect "${container}" --format '{{.State.ExitCode}}' 2>/dev/null || true)"
    if [[ "${status}" == "exited" && "${exit_code}" == "0" ]]; then
      return 0
    fi
    if [[ "${status}" == "exited" && "${exit_code}" != "0" ]]; then
      docker logs "${container}" >&2 || true
      return 1
    fi
    sleep 2
  done

  echo "Container ${container} did not complete successfully in time." >&2
  docker logs "${container}" >&2 || true
  return 1
}

wait_for_healthy_container() {
  local container="$1"
  local attempts="${2:-60}"
  local status="" health=""

  for _ in $(seq 1 "${attempts}"); do
    status="$(docker inspect "${container}" --format '{{.State.Status}}' 2>/dev/null || true)"
    health="$(docker inspect "${container}" --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' 2>/dev/null || true)"
    if [[ "${status}" == "running" && "${health}" == "healthy" ]]; then
      return 0
    fi
    if [[ "${status}" == "exited" || "${status}" == "dead" ]]; then
      docker logs "${container}" >&2 || true
      return 1
    fi
    sleep 2
  done

  echo "Container ${container} did not become healthy in time." >&2
  docker logs "${container}" >&2 || true
  return 1
}

switch_nginx_upstream() {
  local upstream="$1"
  [[ -f "${NGINX_CONF}" ]] || return 1
  docker inspect "${NGINX_CONTAINER}" >/dev/null 2>&1 || return 1

  NGINX_CONF_PATH="${NGINX_CONF}" NGINX_UPSTREAM_VALUE="${upstream}" python3 <<'PY'
from pathlib import Path
import os
import re
import sys

path = Path(os.environ["NGINX_CONF_PATH"])
text = path.read_text()
begin = "# BEGIN REMNAWAVE CABINET"
end = "# END REMNAWAVE CABINET"
start = text.find(begin)
finish = text.find(end, start + len(begin))
pattern = re.compile(r"set \$cabinet_upstream [^;\r\n]+;")

# Remnawave can regenerate nginx.conf and remove comments while preserving the
# cabinet server block. Prefer the managed block, but safely fall back to the
# single cabinet upstream directive in the complete configuration.
if start >= 0 and finish >= 0:
    prefix = text[:start]
    target = text[start:finish]
    suffix = text[finish:]
else:
    prefix = ""
    target = text
    suffix = ""

if len(pattern.findall(target)) != 1:
    print("Could not identify a unique cabinet upstream in nginx.conf.", file=sys.stderr)
    sys.exit(1)
updated = pattern.sub(
    f"set $cabinet_upstream {os.environ['NGINX_UPSTREAM_VALUE']};",
    target,
    count=1,
)
temporary = path.with_suffix(path.suffix + ".cabinet-update")
temporary.write_text(prefix + updated + suffix)
metadata = path.stat()
temporary.chmod(metadata.st_mode)
os.chown(temporary, metadata.st_uid, metadata.st_gid)
temporary.replace(path)
PY
  if [[ "${upstream}" == "remnawave-cabinet-app-candidate:3000" ]]; then
    DEPLOY_PROXY_SWITCHED="true"
  fi
  docker exec "${NGINX_CONTAINER}" nginx -t >/dev/null
  docker exec "${NGINX_CONTAINER}" nginx -s reload >/dev/null
  if [[ "${upstream}" != "remnawave-cabinet-app-candidate:3000" ]]; then
    DEPLOY_PROXY_SWITCHED="false"
  fi
}

stop_deploy_candidate() {
  if [[ "${DEPLOY_CANDIDATE_STARTED}" == "true" ]]; then
    CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" --profile deployment rm -fsv app-candidate >/dev/null 2>&1 || true
    DEPLOY_CANDIDATE_STARTED="false"
  fi
}

rollback_runtime_services() {
  local bind_address app_port
  [[ -n "${ROLLBACK_IMAGE}" ]] || return 1
  echo "Health-check failed. Restoring previous runtime image..." >&2
  CABINET_IMAGE="${ROLLBACK_IMAGE}" CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" up -d --no-deps --force-recreate \
    app worker broadcast-worker watch-worker
  if [[ -n "${ROLLBACK_PROVISIONER_IMAGE}" ]] && provisioning_profile_enabled; then
    CABINET_PROVISIONER_IMAGE="${ROLLBACK_PROVISIONER_IMAGE}" CABINET_ENV_FILE="${ENV_FILE}" \
      "${COMPOSE[@]}" up -d --no-deps --force-recreate node-provisioning-worker
  fi
  bind_address="$(read_update_env_value CABINET_APP_BIND)"
  app_port="$(read_update_env_value CABINET_APP_PORT)"
  bind_address="${bind_address:-127.0.0.1}"
  [[ "${bind_address}" == "0.0.0.0" ]] && bind_address="127.0.0.1"
  app_port="${app_port:-3000}"
  for _ in $(seq 1 60); do
    if curl -fsS --connect-timeout 2 --max-time 5 "http://${bind_address}:${app_port}/login" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

handle_update_failure() {
  local exit_code=$?
  local finished_at
  trap - ERR INT TERM
  set +e
  finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  MIGRATION_STATUS="${MIGRATION_STATUS/pending/error}"
  LOCAL_HEALTH_STATUS="${LOCAL_HEALTH_STATUS/pending/error}"
  PUBLIC_HEALTH_STATUS="${PUBLIC_HEALTH_STATUS/pending/error}"
  if [[ "${ROLLBACK_ARMED}" == "true" ]] && rollback_runtime_services; then
    ROLLBACK_REVISION="$(running_app_revision || true)"
    LOCAL_HEALTH_STATUS="ok"
    write_deployment_state "rolled_back" "Новая версия не прошла проверку. Предыдущий образ восстановлен автоматически." "${finished_at}"
    echo "Previous runtime image restored." >&2
  else
    write_deployment_state "failed" "Обновление завершилось ошибкой. Проверьте журнал update-server и контейнеры." "${finished_at}"
  fi
  if [[ "${DEPLOY_PROXY_SWITCHED}" == "true" ]]; then
    switch_nginx_upstream "remnawave-cabinet-app:3000" || true
  fi
  stop_deploy_candidate
  exit "${exit_code}"
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
ENV_STATE_DIR="$(awk -F= '$1 == "CABINET_STATE_DIR" { sub(/^[^=]*=/, ""); gsub(/^"|"$/, ""); print; exit }' "${ENV_FILE}" 2>/dev/null || true)"
if [[ -n "${ENV_STATE_DIR}" ]]; then
  STATE_DIR="${ENV_STATE_DIR}"
  DEPLOY_STATE_FILE="${STATE_DIR}/deployment.json"
fi
PREVIOUS_DEPLOYED_REVISION="$(running_app_revision || installed_version_revision || true)"
PREVIOUS_IMAGE_ID="$(running_app_image_id)"
PREVIOUS_PROVISIONER_IMAGE_ID="$(running_provisioner_image_id)"
DEPLOY_TARGET_REVISION="$(remote_commit_sha || true)"
mkdir -p "${STATE_DIR}"
set_deploy_stage 5 "preparing" "Подготовка обновления" "Подготовка обновления и проверка конфигурации."
trap handle_update_failure ERR INT TERM

if docker inspect remnashop >/dev/null 2>&1; then
  REMNASHOP_CRYPT_KEY_VALUE="$(docker inspect remnashop --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^APP_CRYPT_KEY=//p' | head -n1)"
  REMNASHOP_REDIS_DATABASE_VALUE="$(docker inspect remnashop --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^REDIS_NAME=//p' | head -n1)"
  REMNASHOP_REDIS_PASSWORD_VALUE=""
  REMNASHOP_REDIS_PRESENT_VALUE="false"
  if docker inspect remnashop-redis >/dev/null 2>&1; then
    REMNASHOP_REDIS_PRESENT_VALUE="true"
    REMNASHOP_REDIS_PASSWORD_VALUE="$(docker inspect remnashop-redis --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^REDIS_PASSWORD=//p' | head -n1)"
  fi
  ENV_FILE_PATH="${ENV_FILE}" \
    REMNASHOP_CRYPT_KEY_VALUE="${REMNASHOP_CRYPT_KEY_VALUE}" \
    REMNASHOP_REDIS_DATABASE_VALUE="${REMNASHOP_REDIS_DATABASE_VALUE}" \
    REMNASHOP_REDIS_PASSWORD_VALUE="${REMNASHOP_REDIS_PASSWORD_VALUE}" \
    REMNASHOP_REDIS_PRESENT_VALUE="${REMNASHOP_REDIS_PRESENT_VALUE}" \
    python3 <<'PY'
from pathlib import Path
import os
from urllib.parse import quote

path = Path(os.environ["ENV_FILE_PATH"])
lines = path.read_text().splitlines()
redis_password = os.environ.get("REMNASHOP_REDIS_PASSWORD_VALUE", "")
redis_database = os.environ.get("REMNASHOP_REDIS_DATABASE_VALUE", "")
if not redis_database.isdigit():
    redis_database = "0"
redis_present = os.environ.get("REMNASHOP_REDIS_PRESENT_VALUE") == "true"
values = {
    "REMNASHOP_API_URL": "http://remnashop:5000/api/v1/public",
    "REMNASHOP_CRYPT_KEY": os.environ.get("REMNASHOP_CRYPT_KEY_VALUE", ""),
    "REMNASHOP_REDIS_URL": (
        (
            f"redis://:{quote(redis_password, safe='')}@remnashop-redis:6379/{redis_database}"
            if redis_password
            else f"redis://remnashop-redis:6379/{redis_database}"
        )
        if redis_present
        else ""
    ),
}
for key, value in values.items():
    if not value:
        continue
    for index, line in enumerate(lines):
        if line.startswith(f"{key}="):
            current = line.split("=", 1)[1].strip().strip("\"'")
            if key != "REMNASHOP_API_URL" or not current:
                lines[index] = f'{key}="{value}"'
            break
    else:
        lines.append(f'{key}="{value}"')
path.write_text("\n".join(lines) + "\n")
PY
fi

configure_remnashop_link_function() {
  local container="${REMNASHOP_DB_CONTAINER:-remnashop-db}"
  local db_user db_name database_url integration_role integration_password
  local readonly_password role role_exists role_password password_literal db_name_identifier
  local roles=("remnashop_readonly")
  if ! docker inspect "${container}" >/dev/null 2>&1; then
    return
  fi
  db_user="$(docker inspect "${container}" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^POSTGRES_USER=//p' | head -n1)"
  db_name="$(docker inspect "${container}" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^POSTGRES_DB=//p' | head -n1)"
  if [[ -z "${db_user}" || -z "${db_name}" ]]; then
    return
  fi
  database_url="$(read_update_env_value REMNASHOP_DATABASE_URL)"
  integration_role="$(python3 - "${database_url}" <<'PY'
from urllib.parse import unquote, urlparse
import re
import sys

try:
    username = unquote(urlparse(sys.argv[1]).username or "")
except Exception:
    username = ""
print(username if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", username) else "")
PY
)"
  integration_password="$(python3 - "${database_url}" <<'PY'
from urllib.parse import unquote, urlparse
import sys

try:
    print(unquote(urlparse(sys.argv[1]).password or ""))
except Exception:
    print("")
PY
)"
  readonly_password="$(read_update_env_value REMNASHOP_READONLY_PASSWORD)"
  if [[ -n "${integration_role}" && "${integration_role}" != "remnashop_readonly" ]]; then
    roles+=("${integration_role}")
  fi

  db_name_identifier="$(python3 - "${db_name}" <<'PY'
import sys

print('"' + sys.argv[1].replace('"', '""') + '"')
PY
)"

  for role in "${roles[@]}"; do
    role_exists="$(docker exec "${container}" psql -U "${db_user}" -d "${db_name}" -tAc "SELECT 1 FROM pg_roles WHERE rolname = '${role}';" 2>/dev/null | tr -d '[:space:]')"
    if [[ "${role_exists}" == "1" ]]; then
      continue
    fi
    role_password=""
    if [[ "${role}" == "${integration_role}" ]]; then
      role_password="${integration_password}"
    elif [[ "${role}" == "remnashop_readonly" ]]; then
      role_password="${readonly_password}"
    fi
    if [[ -z "${role_password}" ]]; then
      echo "Warning: Remnashop integration role ${role} is missing and its password is unavailable."
      continue
    fi
    password_literal="$(python3 - "${role_password}" <<'PY'
import sys

print("'" + sys.argv[1].replace("'", "''") + "'")
PY
)"
    docker exec "${container}" psql -v ON_ERROR_STOP=1 -U "${db_user}" -d "${db_name}" \
      -c "CREATE ROLE \"${role}\" WITH LOGIN PASSWORD ${password_literal};" >/dev/null
  done

  echo "Updating secure Remnashop account-link function..."
  curl -fsSL "${RAW_BASE_URL}/deploy/remnashop-cabinet-link.sql" \
    | docker exec -i "${container}" psql -v ON_ERROR_STOP=1 -U "${db_user}" -d "${db_name}" >/dev/null

  echo "Updating Remnashop integration database permissions..."
  for role in "${roles[@]}"; do
    role_exists="$(docker exec "${container}" psql -U "${db_user}" -d "${db_name}" -tAc "SELECT 1 FROM pg_roles WHERE rolname = '${role}';" 2>/dev/null | tr -d '[:space:]')"
    if [[ "${role_exists}" != "1" ]]; then
      continue
    fi
    docker exec "${container}" psql -v ON_ERROR_STOP=1 -U "${db_user}" -d "${db_name}" \
      -c "GRANT CONNECT ON DATABASE ${db_name_identifier} TO \"${role}\";" \
      -c "GRANT USAGE ON SCHEMA public TO \"${role}\";" \
      -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO \"${role}\";" \
      -c "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO \"${role}\";" \
      -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO \"${role}\";" \
      -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO \"${role}\";" \
      -c "GRANT EXECUTE ON FUNCTION public.cabinet_link_email_to_telegram(bigint, text, boolean) TO \"${role}\";" >/dev/null
  done
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
obsolete = {"CABINET_OPS_IMAGE", "CABINET_PULL_POLICY", "CABINET_PROVISIONER_ENV_FILE"}
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
    "REMNASHOP_WEBHOOK_SECRET",
    "NODE_PROVISIONING_ENCRYPTION_KEY",
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
curl -fsSL "${NODE_PROVISIONING_CONFIG_URL}" -o "${NODE_PROVISIONING_CONFIG_TEMP}"
bash -n "${NODE_PROVISIONING_CONFIG_TEMP}"
install -m 755 "${NODE_PROVISIONING_CONFIG_TEMP}" "${NODE_PROVISIONING_CONFIG_PATH}"
rm -f "${NODE_PROVISIONING_CONFIG_TEMP}"
rm -f /usr/local/bin/remnactl
configure_remnashop_link_function
disable_bundled_caddy_if_conflicting || true

ENV_FILE="${ENV_FILE}" \
COMPOSE_FILE="${COMPOSE_FILE}" \
NODE_PROVISIONING_INTERACTIVE="false" \
NODE_PROVISIONING_START="false" \
NODE_PROVISIONING_VALIDATE_APIS="false" \
NODE_PROVISIONING_API_FAILURE_FATAL="false" \
"${NODE_PROVISIONING_CONFIG_PATH}"

COMPOSE=(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}")
configure_target_image
set_deploy_stage 15 "configuration" "Проверка конфигурации" "Конфигурация синхронизирована. Подготавливается загрузка образа."

if [[ -n "${PREVIOUS_IMAGE_ID}" ]] && docker image inspect "${PREVIOUS_IMAGE_ID}" >/dev/null 2>&1; then
  ROLLBACK_IMAGE="remnawave-cabinet:rollback-$(date -u +%Y%m%d%H%M%S)"
  docker image tag "${PREVIOUS_IMAGE_ID}" "${ROLLBACK_IMAGE}"
fi
if provisioning_profile_enabled \
  && [[ -n "${PREVIOUS_PROVISIONER_IMAGE_ID}" ]] \
  && docker image inspect "${PREVIOUS_PROVISIONER_IMAGE_ID}" >/dev/null 2>&1; then
  ROLLBACK_PROVISIONER_IMAGE="remnawave-cabinet-provisioner:rollback-$(date -u +%Y%m%d%H%M%S)"
  docker image tag "${PREVIOUS_PROVISIONER_IMAGE_ID}" "${ROLLBACK_PROVISIONER_IMAGE}"
fi

set_deploy_stage 20 "pulling" "Загрузка образа кабинета" "Загружается точный Docker-образ новой версии."
pull_target_image
verify_target_image
if provisioning_profile_enabled; then
  pull_target_provisioner_image
  verify_target_provisioner_image
fi
set_deploy_stage 35 "image_ready" "Образ загружен и проверен" "Новый образ загружен и проверен. Запускаются миграции."

set_deploy_stage 45 "migrations" "Подготовка и применение миграций" "Подготавливаются и применяются миграции базы данных."
CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" rm -fsv check-env migrate seed >/dev/null 2>&1 || true

if ! grep -Eq '^COMPOSE_PROFILES=.*caddy' "${ENV_FILE}"; then
  CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" rm -fsv caddy >/dev/null 2>&1 || true
fi

if ! CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" up -d --remove-orphans seed; then
  if disable_bundled_caddy_if_conflicting; then
    CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" up -d --remove-orphans seed
  else
    false
  fi
fi
wait_for_successful_container remnawave-cabinet-seed 90
MIGRATION_STATUS="ok"
set_deploy_stage 60 "candidate" "Проверка нового приложения" "Миграции применены. Запускается временный экземпляр новой версии."
CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" --profile deployment up -d --no-deps --force-recreate app-candidate
DEPLOY_CANDIDATE_STARTED="true"
wait_for_healthy_container remnawave-cabinet-app-candidate 60
if switch_nginx_upstream "remnawave-cabinet-app-candidate:3000"; then
  echo "Public traffic switched to the healthy deployment candidate."
else
  echo "Warning: managed nginx was not found; continuing with the shared Docker network alias." >&2
fi
set_deploy_stage 65 "starting_services" "Запуск сервисов" "Временный экземпляр готов. Запускаются основные сервисы новой версии."

# A mutable `latest` tag can be pulled successfully while Compose keeps an
# already-running container. Recreate runtime services explicitly so the
# update always starts the image that was just pulled without touching the DB.
runtime_services=(app worker broadcast-worker watch-worker)
if provisioning_profile_enabled; then
  runtime_services+=(node-provisioning-worker)
fi
ROLLBACK_ARMED="true"
CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" up -d --no-deps --force-recreate "${runtime_services[@]}"
set_deploy_stage 75 "waiting_services" "Ожидание готовности сервисов" "Сервисы запущены. Ожидается их готовность."

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

wait_for_provisioner_ready() {
  local attempts="${1:-60}"
  local status=""

  for _ in $(seq 1 "${attempts}"); do
    status="$(docker inspect remnawave-cabinet-node-provisioning-worker --format '{{.State.Status}}' 2>/dev/null || true)"
    if [[ "${status}" == "running" ]] \
      && docker exec remnawave-cabinet-node-provisioning-worker test -f /tmp/node-provisioning-worker-heartbeat >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done

  echo "Node provisioning worker did not create its heartbeat in time."
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
    remnawave-cabinet-watch-worker \
    remnawave-cabinet-migrate \
    remnawave-cabinet-check-env \
    remnawave-cabinet-seed \
    cabinet_remna-app \
    cabinet_remna-worker \
    cabinet_remna-watch-worker \
    cabinet_remna-migrate
  do
    remove_image_if_unused "${image}"
  done

  docker image ls --quiet --filter "label=com.docker.compose.project=remnawave-cabinet" \
    | sort -u \
    | while read -r image_id; do
        remove_image_if_unused "${image_id}"
      done || true

  if [[ "${PREVIOUS_DEPLOYED_REVISION:-}" =~ ^[0-9a-f]{40}$ \
    && "${PREVIOUS_DEPLOYED_REVISION}" != "${DEPLOYED_REVISION}" ]]; then
    echo "Removing previous immutable cabinet image..."
    remove_image_if_unused "${OFFICIAL_CABINET_IMAGE}:sha-${PREVIOUS_DEPLOYED_REVISION}"
    remove_image_if_unused "${OFFICIAL_PROVISIONER_IMAGE}:sha-${PREVIOUS_DEPLOYED_REVISION}"
  fi

  echo "Pruning dangling Docker images..."
  docker image prune -f >/dev/null || true

  if is_truthy "${UPDATE_PRUNE_BUILD_CACHE:-false}"; then
    local max_age="${UPDATE_BUILD_CACHE_MAX_AGE:-168h}"
    echo "Pruning Docker build cache older than ${max_age}..."
    docker builder prune -f --filter "until=${max_age}" >/dev/null || true
  fi

  if [[ -n "${ROLLBACK_IMAGE}" ]]; then
    remove_image_if_unused "${ROLLBACK_IMAGE}"
  fi
  if [[ -n "${ROLLBACK_PROVISIONER_IMAGE}" ]]; then
    remove_image_if_unused "${ROLLBACK_PROVISIONER_IMAGE}"
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
wait_for_healthy_container remnawave-cabinet-app 60
wait_for_container worker 60
wait_for_container broadcast-worker 60
wait_for_container watch-worker 60
if [[ " ${runtime_services[*]} " == *" node-provisioning-worker "* ]]; then
  wait_for_provisioner_ready 60
  RUNNING_PROVISIONER_REVISION="$(running_provisioner_revision || true)"
  if [[ ! "${RUNNING_PROVISIONER_REVISION}" =~ ^[0-9a-f]{40}$ ]]; then
    echo "Running provisioner image has no valid revision label." >&2
    false
  fi
  if [[ "${CABINET_RELEASE_SHA:-}" =~ ^[0-9a-f]{40}$ && "${RUNNING_PROVISIONER_REVISION}" != "${CABINET_RELEASE_SHA}" ]]; then
    echo "Running provisioner revision ${RUNNING_PROVISIONER_REVISION} does not match requested release ${CABINET_RELEASE_SHA}." >&2
    false
  fi
fi

CABINET_APP_BIND="$(env_value CABINET_APP_BIND)"
CABINET_APP_PORT="$(env_value CABINET_APP_PORT)"
APP_URL="$(env_value APP_URL)"
HEALTHCHECK_TOKEN="$(env_value HEALTHCHECK_TOKEN)"

CABINET_APP_BIND="${CABINET_APP_BIND:-127.0.0.1}"
CABINET_APP_PORT="${CABINET_APP_PORT:-3000}"
[[ "${CABINET_APP_BIND}" == "0.0.0.0" ]] && CABINET_APP_BIND="127.0.0.1"

set_deploy_stage 85 "local_health" "Локальный health-check" "Проверяется локальная доступность новой версии."
if [[ -n "${HEALTHCHECK_TOKEN}" ]]; then
  wait_for_url "http://${CABINET_APP_BIND}:${CABINET_APP_PORT}/api/health" 60 \
    -H "x-healthcheck-token: ${HEALTHCHECK_TOKEN}"
else
  wait_for_url "http://${CABINET_APP_BIND}:${CABINET_APP_PORT}/login" 60
fi
LOCAL_HEALTH_STATUS="ok"

if [[ "${DEPLOY_PROXY_SWITCHED}" == "true" ]]; then
  set_deploy_stage 90 "proxy_switch" "Переключение на основное приложение" "Основной контейнер готов. Переключается публичный трафик."
  switch_nginx_upstream "remnawave-cabinet-app:3000"
fi

if [[ -n "${APP_URL}" && -n "${HEALTHCHECK_TOKEN}" ]]; then
  set_deploy_stage 92 "public_health" "Публичный health-check" "Локальная проверка пройдена. Проверяется публичный адрес."
  wait_for_url "${APP_URL%/}/api/health" 60 -H "x-healthcheck-token: ${HEALTHCHECK_TOKEN}"
  PUBLIC_HEALTH_STATUS="ok"
else
  PUBLIC_HEALTH_STATUS="skipped"
  set_deploy_stage 92 "public_health" "Публичный health-check пропущен" "Локальная проверка пройдена. Публичная проверка не настроена."
fi
stop_deploy_candidate

DEPLOYED_REVISION="$(running_app_revision || true)"
if [[ ! "${DEPLOYED_REVISION}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Running cabinet image has no valid revision label." >&2
  false
fi
if [[ "${DEPLOY_TARGET_REVISION}" =~ ^[0-9a-f]{40}$ && "${DEPLOYED_REVISION}" != "${DEPLOY_TARGET_REVISION}" ]]; then
  echo "Running image revision ${DEPLOYED_REVISION:-unknown} does not match pulled image ${DEPLOY_TARGET_REVISION}." >&2
  false
fi
if [[ "${CABINET_RELEASE_SHA:-}" =~ ^[0-9a-f]{40}$ && "${DEPLOYED_REVISION}" != "${CABINET_RELEASE_SHA}" ]]; then
  echo "Running image revision ${DEPLOYED_REVISION} does not match requested release ${CABINET_RELEASE_SHA}." >&2
  false
fi
ROLLBACK_ARMED="false"
if [[ "${CABINET_RELEASE_SHA:-}" =~ ^[0-9a-f]{40}$ \
  && "${DEPLOYED_REVISION}" == "${CABINET_RELEASE_SHA}" \
  && "${TARGET_CABINET_IMAGE}" == "${OFFICIAL_CABINET_IMAGE}:sha-${CABINET_RELEASE_SHA}" ]]; then
  write_update_env_value "CABINET_IMAGE" "${TARGET_CABINET_IMAGE}"
  if provisioning_profile_enabled \
    && [[ "${TARGET_PROVISIONER_IMAGE}" == "${OFFICIAL_PROVISIONER_IMAGE}:sha-${CABINET_RELEASE_SHA}" ]]; then
    write_update_env_value "CABINET_PROVISIONER_IMAGE" "${TARGET_PROVISIONER_IMAGE}"
  fi
fi
set_deploy_stage 97 "cleanup" "Очистка старого образа" "Новая версия проверена. Удаляется предыдущий образ."
cleanup_docker_artifacts
DEPLOY_PROGRESS=100
DEPLOY_STAGE="completed"
print_deploy_progress 100 "Обновление завершено"
write_deployment_state "success" "Новая версия запущена и прошла автоматические проверки." "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
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
echo "  cd ${INSTALL_DIR} && docker compose --env-file .env -f docker-compose.yml logs -f watch-worker"

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
OFFICIAL_CABINET_IMAGE="ghcr.io/asdcrosh/cabinet_remna"
TARGET_CABINET_IMAGE=""

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
  local expected_image=""

  if [[ -n "${CABINET_RELEASE_SHA:-}" && ! "${CABINET_RELEASE_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
    echo "Invalid CABINET_RELEASE_SHA: ${CABINET_RELEASE_SHA}" >&2
    return 1
  fi

  if [[ "${CABINET_RELEASE_SHA:-}" =~ ^[0-9a-f]{40}$ ]]; then
    expected_image="${OFFICIAL_CABINET_IMAGE}:sha-${CABINET_RELEASE_SHA}"
    if [[ -n "${CABINET_IMAGE:-}" && "${CABINET_IMAGE}" != "${expected_image}" ]]; then
      echo "CABINET_IMAGE does not match release ${CABINET_RELEASE_SHA}: ${CABINET_IMAGE}" >&2
      return 1
    fi
    TARGET_CABINET_IMAGE="${expected_image}"
  else
    TARGET_CABINET_IMAGE="${CABINET_IMAGE:-$(read_update_env_value CABINET_IMAGE)}"
    TARGET_CABINET_IMAGE="${TARGET_CABINET_IMAGE:-${OFFICIAL_CABINET_IMAGE}:latest}"
  fi

  CABINET_IMAGE="${TARGET_CABINET_IMAGE}"
  export CABINET_IMAGE
}

pull_and_verify_target_image() {
  local pulled_revision

  echo "Target cabinet image: ${TARGET_CABINET_IMAGE}"
  if [[ "${CABINET_RELEASE_SHA:-}" =~ ^[0-9a-f]{40}$ ]]; then
    echo "Target cabinet revision: ${CABINET_RELEASE_SHA}"
  fi
  docker pull "${TARGET_CABINET_IMAGE}"
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

DEPLOY_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DEPLOY_TARGET_REVISION=""
DEPLOYED_REVISION=""
ROLLBACK_REVISION=""
ROLLBACK_IMAGE=""
ROLLBACK_ARMED="false"
MIGRATION_STATUS="pending"
LOCAL_HEALTH_STATUS="pending"
PUBLIC_HEALTH_STATUS="pending"

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

rollback_runtime_services() {
  local bind_address app_port
  [[ -n "${ROLLBACK_IMAGE}" ]] || return 1
  echo "Health-check failed. Restoring previous runtime image..." >&2
  CABINET_IMAGE="${ROLLBACK_IMAGE}" CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" up -d --no-deps --force-recreate \
    app worker broadcast-worker watch-worker
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
  trap - ERR
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
DEPLOY_TARGET_REVISION="$(remote_commit_sha || true)"
mkdir -p "${STATE_DIR}"
write_deployment_state "deploying" "Подготовка обновления и проверка конфигурации."
trap handle_update_failure ERR

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

if [[ -n "${PREVIOUS_IMAGE_ID}" ]] && docker image inspect "${PREVIOUS_IMAGE_ID}" >/dev/null 2>&1; then
  ROLLBACK_IMAGE="remnawave-cabinet:rollback-$(date -u +%Y%m%d%H%M%S)"
  docker image tag "${PREVIOUS_IMAGE_ID}" "${ROLLBACK_IMAGE}"
fi

echo "Pulling target cabinet image..."
pull_and_verify_target_image
echo "Pulling supporting images..."
CABINET_IMAGE="${TARGET_CABINET_IMAGE}" CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" pull
write_deployment_state "deploying" "Новый образ загружен. Запускаются миграции."

echo "Preparing one-shot services..."
CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" rm -fsv check-env migrate seed >/dev/null 2>&1 || true

if ! grep -Eq '^COMPOSE_PROFILES=.*caddy' "${ENV_FILE}"; then
  CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" rm -fsv caddy >/dev/null 2>&1 || true
fi

echo "Applying migrations and restarting services..."
ROLLBACK_ARMED="true"
if ! CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" up -d --remove-orphans; then
  if disable_bundled_caddy_if_conflicting; then
    CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" up -d --remove-orphans
  else
    false
  fi
fi
MIGRATION_STATUS="ok"
write_deployment_state "deploying" "Миграции применены. Проверяется новая версия."

# A mutable `latest` tag can be pulled successfully while Compose keeps an
# already-running container. Recreate runtime services explicitly so the
# update always starts the image that was just pulled without touching the DB.
echo "Recreating runtime services from the pulled image..."
runtime_services=(app worker broadcast-worker watch-worker)
if [[ ",$(read_update_env_value COMPOSE_PROFILES | tr -d ' ')," == *",provisioning,"* ]]; then
  runtime_services+=(node-provisioning-worker)
fi
CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" up -d --no-deps --force-recreate "${runtime_services[@]}"

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

  echo "Pruning dangling Docker images..."
  docker image prune -f >/dev/null || true

  if is_truthy "${UPDATE_PRUNE_BUILD_CACHE:-false}"; then
    local max_age="${UPDATE_BUILD_CACHE_MAX_AGE:-168h}"
    echo "Pruning Docker build cache older than ${max_age}..."
    docker builder prune -f --filter "until=${max_age}" >/dev/null || true
  fi

  docker image ls --format '{{.Repository}}:{{.Tag}}' --filter 'reference=remnawave-cabinet:rollback-*' \
    | while read -r rollback_tag; do
        [[ -n "${rollback_tag}" && "${rollback_tag}" != "${ROLLBACK_IMAGE}" ]] || continue
        remove_image_if_unused "${rollback_tag}"
      done || true
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
wait_for_container worker 60
wait_for_container broadcast-worker 60
wait_for_container watch-worker 60
if [[ " ${runtime_services[*]} " == *" node-provisioning-worker "* ]]; then
  wait_for_container node-provisioning-worker 60
fi

CABINET_APP_BIND="$(env_value CABINET_APP_BIND)"
CABINET_APP_PORT="$(env_value CABINET_APP_PORT)"
APP_URL="$(env_value APP_URL)"
HEALTHCHECK_TOKEN="$(env_value HEALTHCHECK_TOKEN)"

CABINET_APP_BIND="${CABINET_APP_BIND:-127.0.0.1}"
CABINET_APP_PORT="${CABINET_APP_PORT:-3000}"
[[ "${CABINET_APP_BIND}" == "0.0.0.0" ]] && CABINET_APP_BIND="127.0.0.1"

echo "Checking local app on ${CABINET_APP_BIND}:${CABINET_APP_PORT}..."
if [[ -n "${HEALTHCHECK_TOKEN}" ]]; then
  wait_for_url "http://${CABINET_APP_BIND}:${CABINET_APP_PORT}/api/health" 60 \
    -H "x-healthcheck-token: ${HEALTHCHECK_TOKEN}"
else
  wait_for_url "http://${CABINET_APP_BIND}:${CABINET_APP_PORT}/login" 60
fi
LOCAL_HEALTH_STATUS="ok"
write_deployment_state "deploying" "Локальный health-check пройден. Проверяется публичный адрес."

if [[ -n "${APP_URL}" && -n "${HEALTHCHECK_TOKEN}" ]]; then
  echo "Checking public health..."
  wait_for_url "${APP_URL%/}/api/health" 60 -H "x-healthcheck-token: ${HEALTHCHECK_TOKEN}"
  PUBLIC_HEALTH_STATUS="ok"
else
  PUBLIC_HEALTH_STATUS="skipped"
fi

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
fi
write_deployment_state "success" "Новая версия запущена и прошла автоматические проверки." "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

cleanup_docker_artifacts
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

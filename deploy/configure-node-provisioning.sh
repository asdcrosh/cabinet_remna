#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${ENV_FILE:-/opt/remnawave-cabinet/.env}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/remnawave-cabinet/docker-compose.yml}"
LEGACY_ENV_FILE="${LEGACY_ENV_FILE:-$(dirname "${ENV_FILE}")/.env.provisioner}"
TTY_DEVICE="${TTY_DEVICE:-/dev/tty}"
INTERACTIVE="${NODE_PROVISIONING_INTERACTIVE:-false}"
START_WORKER="${NODE_PROVISIONING_START:-false}"
VALIDATE_APIS="${NODE_PROVISIONING_VALIDATE_APIS:-${START_WORKER}}"
API_FAILURE_FATAL="${NODE_PROVISIONING_API_FAILURE_FATAL:-${START_WORKER}}"
DEFAULT_PROVISIONER_IMAGE="ghcr.io/asdcrosh/cabinet_remna-provisioner:latest"
DEFAULT_REMNANODE_IMAGE="remnawave/node:latest"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Node provisioning: ${ENV_FILE} not found." >&2
  exit 1
fi

read_env_value_from() {
  local path="$1"
  local key="$2"
  ENV_FILE_PATH="${path}" python3 - "${key}" <<'PY'
from pathlib import Path
import os
import sys

path = Path(os.environ["ENV_FILE_PATH"])
key = sys.argv[1]
if not path.exists():
    raise SystemExit(0)
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

read_env_value() {
  read_env_value_from "${ENV_FILE}" "$1"
}

write_env_value() {
  local key="$1"
  local value="$2"
  ENV_FILE_PATH="${ENV_FILE}" python3 - "${key}" "${value}" <<'PY'
from pathlib import Path
import os
import sys

path = Path(os.environ["ENV_FILE_PATH"])
key, value = sys.argv[1], sys.argv[2]
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

remove_env_key() {
  local key="$1"
  ENV_FILE_PATH="${ENV_FILE}" python3 - "${key}" <<'PY'
from pathlib import Path
import os
import sys

path = Path(os.environ["ENV_FILE_PATH"])
key = sys.argv[1]
lines = [line for line in path.read_text().splitlines() if not line.startswith(f"{key}=")]
path.write_text("\n".join(lines) + "\n")
PY
}

usable_value() {
  local value="$1"
  [[ -n "${value}" && "${value}" != *"ВСТАВЬ_СЮДА"* && "${value}" != *"CHANGE_ME"* && "${value}" != *"example.com"* ]]
}

valid_domain() {
  python3 - "$1" <<'PY'
import re
import sys

value = sys.argv[1].strip().lower().strip(".")
pattern = r"^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$"
raise SystemExit(0 if re.fullmatch(pattern, value) else 1)
PY
}

valid_email() {
  [[ "$1" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$ ]]
}

valid_https_url() {
  python3 - "$1" <<'PY'
import sys
from urllib.parse import urlparse

url = urlparse(sys.argv[1])
valid = url.scheme == "https" and bool(url.hostname) and not url.username and not url.password
raise SystemExit(0 if valid else 1)
PY
}

valid_api_token() {
  python3 - "$1" <<'PY'
import sys

value = sys.argv[1]
unsafe = {'"', "'", "\\", "$", "\r", "\n", "\0"}
valid = len(value) >= 8 and value.isprintable() and not any(char.isspace() or char in unsafe for char in value)
raise SystemExit(0 if valid else 1)
PY
}

valid_secret() {
  python3 - "$1" <<'PY'
import sys

value = sys.argv[1]
unsafe = {'"', "'", "\\", "$", "\r", "\n", "\0"}
valid = len(value) >= 32 and value.isprintable() and not any(char.isspace() or char in unsafe for char in value)
raise SystemExit(0 if valid else 1)
PY
}

valid_image_reference() {
  [[ "$1" == *@sha256:* || "$1" =~ ^.+:[^/:]+$ ]]
}

official_remnanode_image() {
  case "$1" in
    remnawave/node:*|remnawave/node@sha256:*|\
    docker.io/remnawave/node:*|docker.io/remnawave/node@sha256:*|\
    index.docker.io/remnawave/node:*|index.docker.io/remnawave/node@sha256:*|\
    registry-1.docker.io/remnawave/node:*|registry-1.docker.io/remnawave/node@sha256:*|\
    ghcr.io/remnawave/node:*|ghcr.io/remnawave/node@sha256:*) return 0 ;;
    *) return 1 ;;
  esac
}

valid_positive_integer() {
  [[ "$1" =~ ^[1-9][0-9]*$ ]]
}

valid_config_value() {
  local key="$1"
  local value="$2"
  usable_value "${value}" || return 1
  case "${key}" in
    TIMEWEB_API_TOKEN|REMNAWAVE_TOKEN) valid_api_token "${value}" ;;
    REMNAWAVE_BASE_URL) valid_https_url "${value}" ;;
    NODE_PROVISIONING_BASE_DOMAIN) valid_domain "${value}" ;;
    NODE_PROVISIONING_ENCRYPTION_KEY) valid_secret "${value}" ;;
    NODE_PROVISIONING_ADMIN_EMAIL) valid_email "${value}" ;;
    NODE_PROVISIONING_COUNTRY_CODE) [[ "${value}" == "AUTO" || "${value}" =~ ^[A-Za-z]{2}$ ]] ;;
    NODE_PROVISIONING_REMNANODE_IMAGE) valid_image_reference "${value}" ;;
    NODE_PROVISIONING_WORKER_INTERVAL_SECONDS|NODE_PROVISIONING_WORKER_HEARTBEAT_MAX_AGE_SECONDS|NODE_PROVISIONING_CREDENTIALS_TTL_HOURS|NODE_PROVISIONING_DNS_TIMEOUT_SECONDS|NODE_PROVISIONING_CONNECT_TIMEOUT_SECONDS|NODE_PROVISIONING_ANSIBLE_TIMEOUT_SECONDS)
      valid_positive_integer "${value}"
      ;;
    *) return 0 ;;
  esac
}

ensure_default() {
  local key="$1"
  local default_value="$2"
  local current
  current="$(read_env_value "${key}" || true)"
  if ! usable_value "${current}"; then
    write_env_value "${key}" "${default_value}"
  fi
}

ensure_valid_default() {
  local key="$1"
  local default_value="$2"
  if ! valid_config_value "${key}" "$(read_env_value "${key}" || true)"; then
    write_env_value "${key}" "${default_value}"
  fi
}

ensure_current_remnanode_default() {
  local current
  current="$(read_env_value NODE_PROVISIONING_REMNANODE_IMAGE || true)"
  if ! valid_image_reference "${current}" || \
    { official_remnanode_image "${current}" && [[ "${current}" != "${DEFAULT_REMNANODE_IMAGE}" ]]; }; then
    write_env_value NODE_PROVISIONING_REMNANODE_IMAGE "${DEFAULT_REMNANODE_IMAGE}"
  fi
}

ensure_current_country_default() {
  local current
  current="$(read_env_value NODE_PROVISIONING_COUNTRY_CODE || true)"
  if ! valid_config_value NODE_PROVISIONING_COUNTRY_CODE "${current}"; then
    write_env_value NODE_PROVISIONING_COUNTRY_CODE "AUTO"
    return
  fi
  case "${current}" in
    XX|Xx|xX|xx) write_env_value NODE_PROVISIONING_COUNTRY_CODE "AUTO" ;;
  esac
}

import_legacy_env() {
  local key current legacy migrated_count=0
  [[ -f "${LEGACY_ENV_FILE}" && "${LEGACY_ENV_FILE}" != "${ENV_FILE}" ]] || return 0
  for key in \
    REMNAWAVE_BASE_URL \
    REMNAWAVE_TOKEN \
    TIMEWEB_API_TOKEN \
    NODE_PROVISIONING_BASE_DOMAIN \
    NODE_PROVISIONING_ENCRYPTION_KEY \
    NODE_PROVISIONING_TCP_TEMPLATE_HOST_UUID \
    NODE_PROVISIONING_XHTTP_TEMPLATE_HOST_UUID \
    NODE_PROVISIONING_COUNTRY_CODE \
    NODE_PROVISIONING_ADMIN_EMAIL \
    NODE_PROVISIONING_REMNANODE_IMAGE \
    NODE_PROVISIONING_WORKER_INTERVAL_SECONDS \
    NODE_PROVISIONING_WORKER_HEARTBEAT_MAX_AGE_SECONDS \
    NODE_PROVISIONING_CREDENTIALS_TTL_HOURS \
    NODE_PROVISIONING_DNS_TIMEOUT_SECONDS \
    NODE_PROVISIONING_CONNECT_TIMEOUT_SECONDS \
    NODE_PROVISIONING_ANSIBLE_PLAYBOOK \
    NODE_PROVISIONING_ANSIBLE_TIMEOUT_SECONDS
  do
    current="$(read_env_value "${key}" || true)"
    legacy="$(read_env_value_from "${LEGACY_ENV_FILE}" "${key}" || true)"
    if ! valid_config_value "${key}" "${current}" && valid_config_value "${key}" "${legacy}"; then
      write_env_value "${key}" "${legacy}"
      migrated_count=$((migrated_count + 1))
    fi
  done
  if [[ "${migrated_count}" -gt 0 ]]; then
    echo "Node provisioning: values from legacy .env.provisioner were copied into the main .env."
  fi
  chmod 600 "${ENV_FILE}"
  rm -f "${LEGACY_ENV_FILE}"
  echo "Node provisioning: removed obsolete legacy .env.provisioner after copying its settings."
}

env_override() {
  local key="$1"
  local value="${!key:-}"
  valid_config_value "${key}" "${value}" || return 0
  write_env_value "${key}" "${value}"
}

prompt_text() {
  local label="$1"
  local value=""
  [[ "${INTERACTIVE}" == "true" && -r "${TTY_DEVICE}" ]] || return 0
  printf '%s: ' "${label}" >"${TTY_DEVICE}"
  IFS= read -r value <"${TTY_DEVICE}" || value=""
  printf '%s' "${value}"
}

prompt_secret() {
  local label="$1"
  local value=""
  [[ "${INTERACTIVE}" == "true" && -r "${TTY_DEVICE}" ]] || return 0
  printf '%s: ' "${label}" >"${TTY_DEVICE}"
  stty -echo <"${TTY_DEVICE}" 2>/dev/null || true
  IFS= read -r value <"${TTY_DEVICE}" || value=""
  stty echo <"${TTY_DEVICE}" 2>/dev/null || true
  printf '\n' >"${TTY_DEVICE}"
  printf '%s' "${value}"
}

detect_admin_email() {
  local candidate email_from
  for candidate in \
    "$(read_env_value LEGAL_SUPPORT_EMAIL || true)" \
    "$(read_env_value SYSTEM_HEALTH_EMAIL_TO || true)"
  do
    if valid_email "${candidate}"; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done
  email_from="$(read_env_value EMAIL_FROM || true)"
  candidate="$(printf '%s' "${email_from}" | sed -n 's/.*<\([^<>[:space:]]*@[^<>[:space:]]*\)>.*/\1/p')"
  if valid_email "${candidate}"; then
    printf '%s\n' "${candidate}"
  fi
}

set_profile() {
  local action="$1"
  local current normalized next
  current="$(read_env_value COMPOSE_PROFILES || true)"
  normalized=",${current// /},"
  if [[ "${action}" == "add" ]]; then
    if [[ "${normalized}" != *",provisioning,"* ]]; then
      next="${current:+${current},}provisioning"
      write_env_value COMPOSE_PROFILES "${next}"
    fi
    return
  fi
  next="${normalized//,provisioning,/,}"
  next="${next#,}"
  next="${next%,}"
  write_env_value COMPOSE_PROFILES "${next}"
}

import_legacy_env
remove_env_key CABINET_PROVISIONER_ENV_FILE
remove_env_key NODE_PROVISIONING_PANEL_IP

for key in \
  TIMEWEB_API_TOKEN \
  NODE_PROVISIONING_BASE_DOMAIN \
  NODE_PROVISIONING_ADMIN_EMAIL \
  NODE_PROVISIONING_COUNTRY_CODE \
  NODE_PROVISIONING_REMNANODE_IMAGE
do
  env_override "${key}"
done

ensure_default CABINET_PROVISIONER_IMAGE "${DEFAULT_PROVISIONER_IMAGE}"
ensure_current_country_default
ensure_current_remnanode_default
ensure_valid_default NODE_PROVISIONING_WORKER_INTERVAL_SECONDS "5"
ensure_valid_default NODE_PROVISIONING_WORKER_HEARTBEAT_MAX_AGE_SECONDS "180"
ensure_valid_default NODE_PROVISIONING_CREDENTIALS_TTL_HOURS "24"
ensure_valid_default NODE_PROVISIONING_DNS_TIMEOUT_SECONDS "300"
ensure_valid_default NODE_PROVISIONING_CONNECT_TIMEOUT_SECONDS "300"
ensure_default NODE_PROVISIONING_ANSIBLE_PLAYBOOK "/app/deploy/provisioner/provision-remnanode.yml"
ensure_valid_default NODE_PROVISIONING_ANSIBLE_TIMEOUT_SECONDS "1800"

encryption_key="$(read_env_value NODE_PROVISIONING_ENCRYPTION_KEY || true)"
if ! valid_secret "${encryption_key}"; then
  write_env_value NODE_PROVISIONING_ENCRYPTION_KEY "$(openssl rand -hex 32)"
fi

admin_email="$(read_env_value NODE_PROVISIONING_ADMIN_EMAIL || true)"
if ! valid_email "${admin_email}"; then
  admin_email="$(detect_admin_email || true)"
  if valid_email "${admin_email}"; then
    write_env_value NODE_PROVISIONING_ADMIN_EMAIL "${admin_email}"
  fi
fi

base_domain="$(read_env_value NODE_PROVISIONING_BASE_DOMAIN || true)"
if ! valid_domain "${base_domain}"; then
  base_domain="$(prompt_text 'Основной домен для нод, например vpn.example.com' || true)"
  base_domain="$(printf '%s' "${base_domain}" | tr '[:upper:]' '[:lower:]' | sed 's/^\.//; s/\.$//')"
  if valid_domain "${base_domain}"; then
    write_env_value NODE_PROVISIONING_BASE_DOMAIN "${base_domain}"
  fi
fi

timeweb_token="$(read_env_value TIMEWEB_API_TOKEN || true)"
if ! usable_value "${timeweb_token}"; then
  timeweb_token="$(prompt_secret 'Timeweb API token' || true)"
  if valid_api_token "${timeweb_token}"; then
    write_env_value TIMEWEB_API_TOKEN "${timeweb_token}"
  fi
fi

admin_email="$(read_env_value NODE_PROVISIONING_ADMIN_EMAIL || true)"
if ! valid_email "${admin_email}"; then
  admin_email="$(prompt_text 'Email администратора для сертификатов' || true)"
  if valid_email "${admin_email}"; then
    write_env_value NODE_PROVISIONING_ADMIN_EMAIL "${admin_email}"
  fi
fi

chmod 600 "${ENV_FILE}"

if ! usable_value "$(read_env_value REMNAWAVE_BASE_URL || true)"; then
  remnawave_url="$(prompt_text 'URL панели Remnawave, например https://panel.example.com' || true)"
  if [[ -n "${remnawave_url}" && "${remnawave_url}" != *"://"* ]]; then
    remnawave_url="https://${remnawave_url}"
  fi
  if valid_https_url "${remnawave_url}"; then
    write_env_value REMNAWAVE_BASE_URL "${remnawave_url%/}"
  fi
fi

if ! usable_value "$(read_env_value REMNAWAVE_TOKEN || true)"; then
  remnawave_token="$(prompt_secret 'Remnawave API token' || true)"
  if valid_api_token "${remnawave_token}"; then
    write_env_value REMNAWAVE_TOKEN "${remnawave_token}"
  fi
fi

missing=()
for key in \
  TIMEWEB_API_TOKEN \
  REMNAWAVE_BASE_URL \
  REMNAWAVE_TOKEN \
  NODE_PROVISIONING_BASE_DOMAIN \
  NODE_PROVISIONING_ENCRYPTION_KEY \
  NODE_PROVISIONING_ADMIN_EMAIL \
  NODE_PROVISIONING_REMNANODE_IMAGE
do
  value="$(read_env_value "${key}" || true)"
  usable_value "${value}" || missing+=("${key}")
done

base_domain="$(read_env_value NODE_PROVISIONING_BASE_DOMAIN || true)"
admin_email="$(read_env_value NODE_PROVISIONING_ADMIN_EMAIL || true)"
remnanode_image="$(read_env_value NODE_PROVISIONING_REMNANODE_IMAGE || true)"
remnawave_url="$(read_env_value REMNAWAVE_BASE_URL || true)"
encryption_key="$(read_env_value NODE_PROVISIONING_ENCRYPTION_KEY || true)"
timeweb_token="$(read_env_value TIMEWEB_API_TOKEN || true)"
remnawave_token="$(read_env_value REMNAWAVE_TOKEN || true)"

valid_domain "${base_domain}" || missing+=("NODE_PROVISIONING_BASE_DOMAIN(valid domain)")
valid_email "${admin_email}" || missing+=("NODE_PROVISIONING_ADMIN_EMAIL(valid email)")
valid_https_url "${remnawave_url}" || missing+=("REMNAWAVE_BASE_URL(valid HTTPS URL)")
valid_api_token "${timeweb_token}" || missing+=("TIMEWEB_API_TOKEN(valid token)")
valid_api_token "${remnawave_token}" || missing+=("REMNAWAVE_TOKEN(valid token)")
valid_secret "${encryption_key}" || missing+=("NODE_PROVISIONING_ENCRYPTION_KEY(32+ safe chars)")
if ! valid_image_reference "${remnanode_image}"; then
  missing+=("NODE_PROVISIONING_REMNANODE_IMAGE(valid image)")
fi

if [[ ${#missing[@]} -gt 0 ]]; then
  set_profile remove
  echo "Node provisioning is disabled until these values are available:"
  printf '  - %s\n' "${missing[@]}" | awk '!seen[$0]++'
  echo "Run: cabinetctl provisioning"
  [[ "${START_WORKER}" == "true" ]] && exit 1
  exit 0
fi

set_profile add

if [[ -f "${COMPOSE_FILE}" ]] && command -v docker >/dev/null 2>&1; then
  CABINET_ENV_FILE="${ENV_FILE}" docker compose \
    --env-file "${ENV_FILE}" \
    -f "${COMPOSE_FILE}" \
    --profile provisioning \
    config --quiet
fi

if [[ "${VALIDATE_APIS}" == "true" ]]; then
  timeweb_status="$(curl -sS -o /dev/null -w '%{http_code}' \
    --connect-timeout 5 --max-time 15 \
    --config - \
    'https://api.timeweb.cloud/api/v1/domains?limit=1&offset=0' \
    <<<"header = \"Authorization: Bearer $(read_env_value TIMEWEB_API_TOKEN)\"" || true)"
  if [[ ! "${timeweb_status}" =~ ^2[0-9][0-9]$ ]]; then
    set_profile remove
    echo "Node provisioning: Timeweb API token check failed (HTTP ${timeweb_status:-000})." >&2
    echo "Run: cabinetctl provisioning" >&2
    [[ "${API_FAILURE_FATAL}" == "true" ]] && exit 1
    exit 0
  fi
  remnawave_status="$(curl -sS -o /dev/null -w '%{http_code}' \
    --connect-timeout 5 --max-time 15 \
    --config - \
    "${remnawave_url%/}/api/nodes" \
    <<<"header = \"Authorization: Bearer $(read_env_value REMNAWAVE_TOKEN)\"" || true)"
  if [[ ! "${remnawave_status}" =~ ^2[0-9][0-9]$ ]]; then
    set_profile remove
    echo "Node provisioning: Remnawave API token check failed (HTTP ${remnawave_status:-000})." >&2
    echo "Run: cabinetctl provisioning" >&2
    [[ "${API_FAILURE_FATAL}" == "true" ]] && exit 1
    exit 0
  fi
fi

if [[ "${START_WORKER}" == "true" ]]; then
  if [[ ! -f "${COMPOSE_FILE}" ]] || ! command -v docker >/dev/null 2>&1; then
    echo "Node provisioning: Docker Compose configuration is unavailable." >&2
    exit 1
  fi
  CABINET_ENV_FILE="${ENV_FILE}" docker compose \
    --env-file "${ENV_FILE}" \
    -f "${COMPOSE_FILE}" \
    --profile provisioning \
    pull node-provisioning-worker
  CABINET_ENV_FILE="${ENV_FILE}" docker compose \
    --env-file "${ENV_FILE}" \
    -f "${COMPOSE_FILE}" \
    --profile provisioning \
    up -d node-provisioning-worker
fi

echo "Node provisioning is configured in ${ENV_FILE}."
echo "Domain template: <node>.${base_domain}"
echo "Panel API IP: resolved from REMNAWAVE_BASE_URL for each node deployment"
echo "Worker profile: provisioning"

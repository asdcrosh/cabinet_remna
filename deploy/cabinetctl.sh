#!/usr/bin/env bash
set -euo pipefail

VERSION="1.9.6"
BRANCH="${BRANCH:-main}"
RAW_BASE_URL="${RAW_BASE_URL:-https://raw.githubusercontent.com/asdcrosh/cabinet_remna/${BRANCH}}"
GITHUB_API_URL="${GITHUB_API_URL:-https://api.github.com/repos/asdcrosh/cabinet_remna/commits/${BRANCH}}"
GITHUB_WORKFLOW_RUNS_URL="${GITHUB_WORKFLOW_RUNS_URL:-https://api.github.com/repos/asdcrosh/cabinet_remna/actions/workflows/docker-image.yml/runs}"
OFFICIAL_RAW_REPOSITORY="https://raw.githubusercontent.com/asdcrosh/cabinet_remna"
OFFICIAL_CONTENTS_API="https://api.github.com/repos/asdcrosh/cabinet_remna/contents"
INSTALL_URL="${INSTALL_URL:-${RAW_BASE_URL}/deploy/install-server.sh}"
UPDATE_URL="${UPDATE_URL:-${RAW_BASE_URL}/deploy/update-server.sh}"
NGINX_SETUP_URL="${NGINX_SETUP_URL:-${RAW_BASE_URL}/deploy/setup-nginx-proxy.sh}"
CONSOLE_INSTALL_URL="${CONSOLE_INSTALL_URL:-${RAW_BASE_URL}/deploy/install-console.sh}"
BACKUP_SCRIPT_URL="${BACKUP_SCRIPT_URL:-${RAW_BASE_URL}/deploy/full-stack-backup.sh}"
NODE_PROVISIONING_CONFIG_URL="${NODE_PROVISIONING_CONFIG_URL:-${RAW_BASE_URL}/deploy/configure-node-provisioning.sh}"
ENV_TEMPLATE_URL="${ENV_TEMPLATE_URL:-${RAW_BASE_URL}/deploy/env.production.example}"
CABINETCTL_PATH="${CABINETCTL_PATH:-/usr/local/bin/cabinetctl}"
BACKUP_SCRIPT_PATH="${BACKUP_SCRIPT_PATH:-/usr/local/bin/remna-backup}"
NODE_PROVISIONING_CONFIG_PATH="${NODE_PROVISIONING_CONFIG_PATH:-/usr/local/bin/cabinet-node-provisioning}"
CABINET_DIR="${INSTALL_DIR:-/opt/remnawave-cabinet}"
CABINET_ENV="${CABINET_DIR}/.env"
CABINET_COMPOSE="${CABINET_DIR}/docker-compose.yml"
CABINET_VERSION_FILE="${CABINET_VERSION_FILE:-${CABINET_DIR}/.cabinet-version}"
DEPLOY_STATE_FILE="${CABINET_STATE_DIR:-${CABINET_DIR}/state}/deployment.json"
UPDATE_STATUS_CACHE="${CABINETCTL_UPDATE_CACHE:-/var/cache/remnawave-cabinet/update-status}"
UPDATE_STATUS_CACHE_TTL="${CABINETCTL_UPDATE_CACHE_TTL:-60}"
CHECK_UPDATES_IN_MENU="${CABINETCTL_CHECK_UPDATES_IN_MENU:-1}"
DOCKER_INSTALL_COMMIT="a23123f03978989e95d257beb9de0c5ad9da6e70"
DOCKER_INSTALL_SHA256="754dc3837b3da3eb65c8a355a713569cf7f0328addd3edc783897c3b9a54e192"
DOCKER_INSTALL_URL="https://raw.githubusercontent.com/docker/docker-install/${DOCKER_INSTALL_COMMIT}/install.sh"
ENV_SCHEMA_SYNCED=0
ENV_SYNC_NOTICE=""
RESOLVED_RELEASE_SHA=""
VERIFIED_RELEASE_RAW_BASE_URL=""
MENU_CHOICE=""
STATUS_ANIMATION_PID=""
ANIM_MARKER_ROWS=()
ANIM_MARKER_COLUMNS=()
ANIM_MARKER_STATES=()

if [[ -t 1 ]]; then
  BOLD=$'\033[1m'
  DIM=$'\033[2m'
  CYAN=$'\033[36m'
  GREEN=$'\033[32m'
  YELLOW=$'\033[33m'
  RED=$'\033[31m'
  RESET=$'\033[0m'
else
  BOLD="" DIM="" CYAN="" GREEN="" YELLOW="" RED="" RESET=""
fi

info() { printf '%s\n' "${CYAN}•${RESET} $*"; }
ok() { printf '%s\n' "${GREEN}✓${RESET} $*"; }
warn() { printf '%s\n' "${YELLOW}!${RESET} $*"; }
fail() { printf '%s\n' "${RED}Ошибка:${RESET} $*" >&2; return 1; }

pause() {
  if [[ -r /dev/tty ]]; then
    printf '\nНажмите Enter, чтобы вернуться в меню...' >/dev/tty
    IFS= read -r _ </dev/tty || true
  fi
}

require_tty() {
  [[ -r /dev/tty ]] || {
    fail "Для этого действия нужен интерактивный терминал."
    return 1
  }
}

cabinet_installed() {
  [[ -f "${CABINET_ENV}" && -f "${CABINET_COMPOSE}" ]]
}

docker_available() {
  command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1
}

docker_running() {
  docker_available && docker info >/dev/null 2>&1
}

ensure_docker() {
  if docker_available; then
    return
  fi
  command -v curl >/dev/null 2>&1 || {
    command -v apt-get >/dev/null 2>&1 || {
      fail "Не найдены curl и apt-get."
      return 1
    }
    apt-get update
    apt-get install -y ca-certificates curl
  }
  info "Устанавливаем Docker..."
  install_verified_docker
  docker compose version >/dev/null 2>&1 || {
    fail "Docker Compose plugin не установлен."
    return 1
  }
}

install_verified_docker() {
  local installer actual_sha
  installer="$(mktemp)"
  if ! curl -fsSL --proto '=https' --tlsv1.2 "${DOCKER_INSTALL_URL}" -o "${installer}"; then
    rm -f "${installer}"
    fail "Не удалось скачать официальный Docker installer."
    return 1
  fi
  actual_sha="$(sha256sum "${installer}" | awk '{print $1}')"
  if [[ "${actual_sha}" != "${DOCKER_INSTALL_SHA256}" ]]; then
    rm -f "${installer}"
    fail "Контрольная сумма Docker installer не совпала. Установка остановлена."
    return 1
  fi
  sh -n "${installer}"
  sh "${installer}"
  rm -f "${installer}"
}

container_state() {
  local container="$1"
  local state
  state="$(docker inspect -f '{{.State.Status}}' "${container}" 2>/dev/null || true)"
  if [[ "${state}" == "running" ]]; then
    local health
    health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "${container}" 2>/dev/null || true)"
    [[ -n "${health}" ]] && state="${health}"
  fi
  [[ -n "${state}" ]] && printf '%s\n' "${state}" || printf '%s\n' "не найден"
}

state_label() {
  printf '%s%s[ %s ]%s' "$(state_color "${1:-}")" "${BOLD}" "$(state_text "${1:-}")" "${RESET}"
}

state_text() {
  case "${1:-}" in
    healthy) printf 'В НОРМЕ' ;;
    running) printf 'ЗАПУЩЕН' ;;
    starting) printf 'ЗАПУСК' ;;
    unhealthy) printf 'СБОЙ' ;;
    restarting) printf 'ПЕРЕЗАПУСК' ;;
    created) printf 'СОЗДАН' ;;
    exited|dead|removing|paused) printf 'ОСТАНОВЛЕН' ;;
    "не найден"|"") printf 'НЕТ' ;;
    *) printf '%s' "$1" ;;
  esac
}

state_color() {
  case "${1:-}" in
    healthy|running) printf '%s' "${GREEN}" ;;
    starting|restarting|created) printf '%s' "${YELLOW}" ;;
    unhealthy|exited|dead|removing|paused) printf '%s' "${RED}" ;;
    "не найден"|"") printf '%s' "${DIM}" ;;
    *) printf '%s' "${YELLOW}" ;;
  esac
}

print_service_state() {
  local label="$1"
  local container="$2"
  local state marker
  state="$(container_state "${container}")"
  marker="$(state_marker "${state}")"
  print_status_row "${marker}" "${label}" "$(state_label "${state}")"
}

state_marker() {
  case "${1:-}" in
    healthy|running) printf '%s' "${GREEN}●${RESET}" ;;
    starting|restarting|created) printf '%s' "${YELLOW}◐${RESET}" ;;
    unhealthy) printf '%s' "${RED}×${RESET}" ;;
    exited|dead|removing|paused) printf '%s' "${RED}●${RESET}" ;;
    *) printf '%s' "${DIM}○${RESET}" ;;
  esac
}

print_status_row() {
  local marker="$1"
  local label="$2"
  local value="$3"
  printf '  %b  %s%b\n' "${marker}" "$(pad_text "${label}" 16)" "${value}"
}

pad_text() {
  local value="$1"
  local width="$2"
  local padding=$((width - ${#value}))
  ((padding > 0)) || padding=0
  printf '%s%*s' "${value}" "${padding}" ''
}

print_menu_row() {
  local left_number="$1"
  local left_label="$2"
  local right_number="$3"
  local right_label="$4"
  printf '  │ %s%s%s  %s │ %s%s%s  %s │\n' \
    "${CYAN}" "${left_number}" "${RESET}" "$(pad_text "${left_label}" 22)" \
    "${CYAN}" "${right_number}" "${RESET}" "$(pad_text "${right_label}" 22)"
}

print_service_grid_row() {
  local left_label="$1" left_container="$2" right_label="$3" right_container="$4" row="$5"
  local left_state right_state
  left_state="$(container_state "${left_container}")"
  right_state="$(container_state "${right_container}")"
  register_animated_marker "${row}" 3 "${left_state}"
  register_animated_marker "${row}" 34 "${right_state}"
  printf '  %b  %s %b%s%b  %b  %s %b%s%b\n' \
    "$(state_marker "${left_state}")" "$(pad_text "${left_label}" 11)" "$(state_color "${left_state}")${BOLD}" \
    "$(pad_text "[ $(state_text "${left_state}") ]" 14)" "${RESET}" "$(state_marker "${right_state}")" \
    "$(pad_text "${right_label}" 11)" "$(state_color "${right_state}")${BOLD}" "[ $(state_text "${right_state}") ]" "${RESET}"
}

remote_console_version() {
  local source
  command -v curl >/dev/null 2>&1 || return 1
  source="$(curl -fsSL --proto '=https' --tlsv1.2 --connect-timeout 2 --max-time 5 \
    "${RAW_BASE_URL}/deploy/cabinetctl.sh?cache=$(date +%s)" 2>/dev/null || true)"
  printf '%s\n' "${source}" \
    | sed -n 's/^VERSION="\([0-9][0-9.]*\)"$/\1/p' \
    | head -n 1
}

console_update_badge() {
  local remote_version
  remote_version="$(remote_console_version || true)"
  [[ "${remote_version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 0
  if version_is_newer "${remote_version}" "${VERSION}"; then
    printf '  %s%s[ ДОСТУПНА v%s ]%s' "${YELLOW}" "${BOLD}" "${remote_version}" "${RESET}"
  fi
}

version_is_newer() {
  local candidate="$1" current="$2"
  local candidate_major candidate_minor candidate_patch
  local current_major current_minor current_patch
  IFS='.' read -r candidate_major candidate_minor candidate_patch <<<"${candidate}"
  IFS='.' read -r current_major current_minor current_patch <<<"${current}"
  (( candidate_major > current_major )) \
    || (( candidate_major == current_major && candidate_minor > current_minor )) \
    || (( candidate_major == current_major && candidate_minor == current_minor && candidate_patch > current_patch ))
}

register_animated_marker() {
  ANIM_MARKER_ROWS+=("$1")
  ANIM_MARKER_COLUMNS+=("$2")
  ANIM_MARKER_STATES+=("$3")
}

animation_character() {
  local state="$1"
  local frame="$2"
  local -a healthy_frames=('●' '◉' '●' '◉')
  local -a pending_frames=('◐' '◓' '◑' '◒')
  case "${state}" in
    healthy|running) printf '%s' "${healthy_frames[frame]}" ;;
    starting|restarting|created) printf '%s' "${pending_frames[frame]}" ;;
    *) printf '%s' "$(state_marker "${state}")" ;;
  esac
}

render_status_animation_frame() {
  local frame="$1"
  local index state color character
  printf '\0337'
  for index in "${!ANIM_MARKER_ROWS[@]}"; do
    state="${ANIM_MARKER_STATES[index]}"
    color="$(state_color "${state}")"
    character="$(animation_character "${state}" "${frame}")"
    printf '\033[%s;%sH%b%s%b' \
      "${ANIM_MARKER_ROWS[index]}" "${ANIM_MARKER_COLUMNS[index]}" \
      "${color}" "${character}" "${RESET}"
  done
  printf '\0338'
}

start_status_animation() {
  ((${#ANIM_MARKER_ROWS[@]} > 0)) || return 0
  (
    local frame=0
    while true; do
      sleep 0.45
      frame=$(((frame + 1) % 4))
      render_status_animation_frame "${frame}"
    done
  ) 2>/dev/null >/dev/tty &
  STATUS_ANIMATION_PID=$!
}

stop_status_animation() {
  [[ -n "${STATUS_ANIMATION_PID}" ]] || return 0
  kill "${STATUS_ANIMATION_PID}" 2>/dev/null || true
  wait "${STATUS_ANIMATION_PID}" 2>/dev/null || true
  STATUS_ANIMATION_PID=""
}

env_value() {
  local key="$1"
  [[ -f "${CABINET_ENV}" ]] || return 0
  awk -F= -v key="${key}" '
    $1 == key {
      sub(/^[^=]*=/, "")
      gsub(/^"/, "")
      gsub(/"$/, "")
      print
      exit
    }
  ' "${CABINET_ENV}" 2>/dev/null || true
}

sync_env_schema() {
  if [[ "${ENV_SCHEMA_SYNCED}" == "1" ]]; then
    return 0
  fi
  ENV_SCHEMA_SYNCED=1

  cabinet_installed || return 0
  command -v curl >/dev/null 2>&1 || return 0
  command -v python3 >/dev/null 2>&1 || return 0

  local template_file result added_count
  template_file="$(mktemp)"
  if ! download_verified_release_file "${ENV_TEMPLATE_URL}" "${template_file}" 2>/dev/null; then
    rm -f "${template_file}"
    return 0
  fi

  result="$(ENV_FILE_PATH="${CABINET_ENV}" ENV_TEMPLATE_PATH="${template_file}" python3 <<'PY'
from pathlib import Path
import os
import re
import secrets

env_path = Path(os.environ["ENV_FILE_PATH"])
template_path = Path(os.environ["ENV_TEMPLATE_PATH"])
original_lines = env_path.read_text().splitlines()
obsolete = {"CABINET_OPS_IMAGE", "CABINET_PULL_POLICY", "CABINET_PROVISIONER_ENV_FILE"}
lines = []
existing = {}

assignment = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$")
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
    lines.append("# Added automatically by cabinetctl from the current env template.")
    lines.extend(additions)
    changed = True

if changed:
    env_path.write_text("\n".join(lines) + "\n")

print(len(added_keys))
PY
)"
  rm -f "${template_file}"

  added_count="${result}"
  if [[ "${added_count}" =~ ^[1-9][0-9]*$ ]]; then
    ENV_SYNC_NOTICE="добавлено новых параметров: ${added_count}"
  fi
}

compose_image() {
  local image
  image="$(env_value CABINET_IMAGE)"
  [[ -n "${image}" ]] || image="ghcr.io/asdcrosh/cabinet_remna:latest"
  printf '%s\n' "${image}"
}

local_image_id() {
  local image="$1"
  docker image inspect "${image}" --format '{{.Id}}' 2>/dev/null || true
}

container_image_id() {
  local container="$1"
  docker inspect "${container}" --format '{{.Image}}' 2>/dev/null || true
}

pull_latest_image() {
  local image="$1"
  if command -v timeout >/dev/null 2>&1; then
    timeout 20s docker pull -q "${image}" >/dev/null 2>&1
    return
  fi
  docker pull -q "${image}" >/dev/null 2>&1
}

remote_commit_sha() {
  local response
  command -v curl >/dev/null 2>&1 || return 1
  response="$(curl -fsSL --connect-timeout 2 --max-time 5 -H 'Accept: application/vnd.github+json' "${GITHUB_API_URL}" 2>/dev/null || true)"
  printf '%s\n' "${response}" \
    | sed -n 's/.*"sha"[[:space:]]*:[[:space:]]*"\([0-9a-f]\{40\}\)".*/\1/p' \
    | head -n 1
}

resolve_release_sha() {
  local details workflow_sha workflow_status workflow_conclusion workflow_url
  if [[ "${RESOLVED_RELEASE_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
    return 0
  fi
  details="$(latest_workflow_details || true)"
  IFS='|' read -r workflow_sha workflow_status workflow_conclusion workflow_url <<<"${details}"
  if [[ ! "${workflow_sha}" =~ ^[0-9a-f]{40}$ ]]; then
    fail "Не удалось определить сборку последнего commit."
    return 1
  fi
  if [[ "${workflow_status}" != "completed" ]]; then
    fail "Последняя версия ${workflow_sha:0:7} ещё собирается (${workflow_status:-unknown}). Повторите обновление после завершения GitHub Actions: ${workflow_url:-unknown}"
    return 1
  fi
  if [[ "${workflow_conclusion}" != "success" ]]; then
    fail "Сборка последней версии ${workflow_sha:0:7} завершилась со статусом ${workflow_conclusion:-unknown}. Старый образ не будет установлен вместо неё: ${workflow_url:-unknown}"
    return 1
  fi
  RESOLVED_RELEASE_SHA="${workflow_sha}"
}

remote_blob_sha() {
  local relative_path="$1"
  local commit_sha="$2"
  local response
  response="$(curl -fsSL --proto '=https' --tlsv1.2 \
    --connect-timeout 5 --max-time 20 \
    -H 'Accept: application/vnd.github+json' \
    --get --data-urlencode "ref=${commit_sha}" \
    "${OFFICIAL_CONTENTS_API}/${relative_path}" 2>/dev/null || true)"
  printf '%s\n' "${response}" \
    | sed -n 's/.*"sha"[[:space:]]*:[[:space:]]*"\([0-9a-f]\{40\}\)".*/\1/p' \
    | head -n 1
}

git_blob_sha() {
  local file="$1"
  local size
  size="$(wc -c <"${file}" | tr -d '[:space:]')"
  { printf 'blob %s\0' "${size}"; cat "${file}"; } | sha1sum | awk '{print $1}'
}

download_verified_release_file() {
  local url="$1"
  local destination="$2"
  local official_prefix="${OFFICIAL_RAW_REPOSITORY}/${BRANCH}/"
  local source_url="${url}"
  local relative_path=""
  local expected_blob_sha=""
  local actual_blob_sha=""

  VERIFIED_RELEASE_RAW_BASE_URL=""
  if [[ "${url}" == "${official_prefix}"* ]]; then
    resolve_release_sha || return 1
    relative_path="${url#${official_prefix}}"
    source_url="${OFFICIAL_RAW_REPOSITORY}/${RESOLVED_RELEASE_SHA}/${relative_path}"
    expected_blob_sha="$(remote_blob_sha "${relative_path}" "${RESOLVED_RELEASE_SHA}")"
    if [[ ! "${expected_blob_sha}" =~ ^[0-9a-f]{40}$ ]]; then
      fail "Не удалось получить checksum ${relative_path} из commit ${RESOLVED_RELEASE_SHA}."
      return 1
    fi
    VERIFIED_RELEASE_RAW_BASE_URL="${OFFICIAL_RAW_REPOSITORY}/${RESOLVED_RELEASE_SHA}"
  fi

  if ! curl -fsSL --proto '=https' --tlsv1.2 --connect-timeout 5 --max-time 60 \
    "${source_url}" -o "${destination}"; then
    return 1
  fi

  if [[ -n "${expected_blob_sha}" ]]; then
    actual_blob_sha="$(git_blob_sha "${destination}")"
    if [[ "${actual_blob_sha}" != "${expected_blob_sha}" ]]; then
      rm -f "${destination}"
      fail "Checksum ${relative_path} не совпал с Git tree. Выполнение остановлено."
      return 1
    fi
  fi
}

run_verified_script() {
  local url="$1"
  local temporary status digest verified_raw_base verified_release_sha
  temporary="$(mktemp)"
  if ! download_verified_release_file "${url}" "${temporary}"; then
    rm -f "${temporary}"
    return 1
  fi
  bash -n "${temporary}"
  digest="$(sha256sum "${temporary}" | awk '{print $1}')"
  verified_raw_base="${VERIFIED_RELEASE_RAW_BASE_URL}"
  verified_release_sha="${RESOLVED_RELEASE_SHA}"
  info "Проверен установочный скрипт sha256:${digest}"

  status=0
  if [[ -n "${verified_raw_base}" ]]; then
    info "Целевая версия: ${verified_release_sha:0:12}"
    RAW_BASE_URL="${verified_raw_base}" \
      CABINET_RELEASE_SHA="${verified_release_sha}" \
      CABINET_IMAGE="ghcr.io/asdcrosh/cabinet_remna:sha-${verified_release_sha}" \
      bash "${temporary}" || status=$?
  else
    bash "${temporary}" || status=$?
  fi
  rm -f "${temporary}"
  return "${status}"
}

remote_image_sha() {
  local details workflow_sha workflow_status workflow_conclusion workflow_url
  details="$(latest_workflow_details || true)"
  IFS='|' read -r workflow_sha workflow_status workflow_conclusion workflow_url <<<"${details}"
  if [[ "${workflow_status}" == "completed" && "${workflow_conclusion}" == "success" ]]; then
    printf '%s\n' "${workflow_sha}"
  fi
}

latest_workflow_details() {
  local response
  command -v curl >/dev/null 2>&1 || return 1
  response="$(curl -fsSL --connect-timeout 2 --max-time 5 \
    -H 'Accept: application/vnd.github+json' \
    --get \
    --data-urlencode "branch=${BRANCH}" \
    --data-urlencode 'per_page=1' \
    "${GITHUB_WORKFLOW_RUNS_URL}" 2>/dev/null || true)"
  WORKFLOW_RESPONSE="${response}" python3 <<'PY'
import json
import os

try:
    runs = json.loads(os.environ.get("WORKFLOW_RESPONSE", "{}")).get("workflow_runs") or []
    run = runs[0]
    values = (
        run.get("head_sha") or "",
        run.get("status") or "",
        run.get("conclusion") or "",
        run.get("html_url") or "",
    )
    print("|".join(values))
except (IndexError, TypeError, ValueError):
    pass
PY
}

installed_commit_sha() {
  local image_id image_revision
  image_id=""
  if command -v docker >/dev/null 2>&1; then
    image_id="$(container_image_id remnawave-cabinet-app)"
  fi
  if [[ -n "${image_id}" ]] && docker image inspect "${image_id}" >/dev/null 2>&1; then
    image_revision="$(docker image inspect "${image_id}" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' 2>/dev/null || true)"
    if [[ "${image_revision}" =~ ^[0-9a-f]{40}$ ]]; then
      printf '%s\n' "${image_revision}"
      return 0
    fi
  fi

  [[ -f "${CABINET_VERSION_FILE}" ]] || return 1
  sed -n 's/^commit=//p' "${CABINET_VERSION_FILE}" 2>/dev/null | head -n 1
}

write_installed_version() {
  local sha="$1"
  [[ -n "${sha}" ]] || return 0
  mkdir -p "$(dirname "${CABINET_VERSION_FILE}")" 2>/dev/null || true
  {
    printf 'commit=%s\n' "${sha}"
    printf 'branch=%s\n' "${BRANCH}"
    printf 'updated_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } >"${CABINET_VERSION_FILE}" 2>/dev/null || true
}

check_update_status() {
  if ! cabinet_installed; then
    write_update_status_cache "not-installed"
    return 2
  fi

  local details remote_sha workflow_status workflow_conclusion workflow_url installed_sha
  details="$(latest_workflow_details || true)"
  IFS='|' read -r remote_sha workflow_status workflow_conclusion workflow_url <<<"${details}"
  if [[ ! "${remote_sha}" =~ ^[0-9a-f]{40}$ ]]; then
    write_update_status_cache "check-failed"
    return 2
  fi
  if [[ "${workflow_status}" != "completed" ]]; then
    write_update_status_cache "building"
    return 2
  fi
  if [[ "${workflow_conclusion}" != "success" ]]; then
    write_update_status_cache "build-failed"
    return 2
  fi

  installed_sha="$(installed_commit_sha || true)"
  if [[ -z "${installed_sha}" ]]; then
    write_update_status_cache "version-unknown"
    return 2
  fi

  if [[ "${installed_sha}" == "${remote_sha}" ]]; then
    write_update_status_cache "latest"
    return 1
  fi

  write_update_status_cache "available"
  return 0
}

print_update_status_key() {
  case "${1:-unknown}" in
    latest|current) print_status_row "$(state_marker healthy)" "Обновление" "${GREEN}${BOLD}[ АКТУАЛЬНО ]${RESET}" ;;
    available) print_status_row "${YELLOW}↑${RESET}" "Обновление" "${YELLOW}${BOLD}[ ДОСТУПНО ]${RESET}" ;;
    building) print_status_row "$(state_marker starting)" "Обновление" "${YELLOW}${BOLD}[ СОБИРАЕТСЯ ]${RESET}" ;;
    build-failed|build_failed) print_status_row "${RED}×${RESET}" "Обновление" "${RED}${BOLD}[ СБОРКА НЕ ГОТОВА ]${RESET}" ;;
    check-failed|check_failed|unknown) print_status_row "${DIM}○${RESET}" "Обновление" "${DIM}проверим позже${RESET}" ;;
    version-unknown|version_unknown) print_status_row "${YELLOW}○${RESET}" "Обновление" "${YELLOW}версия не определена${RESET}" ;;
    docker-unavailable|docker_unavailable) print_status_row "${YELLOW}○${RESET}" "Обновление" "${YELLOW}Docker недоступен${RESET}" ;;
    app-not-running|app_not_running) print_status_row "${YELLOW}○${RESET}" "Обновление" "${YELLOW}кабинет не запущен${RESET}" ;;
    not-installed|not_installed) print_status_row "${DIM}○${RESET}" "Обновление" "${DIM}после установки${RESET}" ;;
    *) return 1 ;;
  esac
}

write_update_status_cache() {
  local status="$1"
  local cache_dir
  cache_dir="$(dirname "${UPDATE_STATUS_CACHE}")"
  mkdir -p "${cache_dir}" 2>/dev/null || true
  printf '%s|%s|%s\n' "$(date +%s)" "${VERSION}" "${status}" >"${UPDATE_STATUS_CACHE}" 2>/dev/null || true
}

read_update_status_cache() {
  [[ -f "${UPDATE_STATUS_CACHE}" ]] || return 1
  local created_at cache_version status now
  IFS='|' read -r created_at cache_version status <"${UPDATE_STATUS_CACHE}" || return 1
  [[ "${created_at}" =~ ^[0-9]+$ ]] || return 1
  [[ "${cache_version}" == "${VERSION}" ]] || return 1
  [[ -n "${status}" ]] || return 1
  [[ "${UPDATE_STATUS_CACHE_TTL}" =~ ^[0-9]+$ ]] || return 1
  now="$(date +%s)"
  if (( now - created_at > UPDATE_STATUS_CACHE_TTL )); then
    return 1
  fi
  print_update_status_key "${status}"
}

update_status_line() {
  if ! cabinet_installed; then
    print_update_status_key "not-installed"
    return
  fi

  if read_update_status_cache; then
    return
  fi

  if [[ "${CHECK_UPDATES_IN_MENU}" == "1" || "${CHECK_UPDATES_IN_MENU}" == "true" ]]; then
    set +e
    check_update_status >/dev/null 2>&1
    set -e
    read_update_status_cache || print_update_status_key "check-failed"
    return
  fi

  print_update_status_key "unknown"
}

deployment_status_line() {
  [[ -f "${DEPLOY_STATE_FILE}" ]] || return 0
  local summary status revision finished_at
  summary="$(python3 - "${DEPLOY_STATE_FILE}" <<'PY' 2>/dev/null || true
import json
import sys

try:
    data = json.load(open(sys.argv[1]))
    revision = data.get("deployedRevision") or data.get("rollbackRevision") or data.get("targetRevision") or ""
    print("|".join((str(data.get("status") or "unknown"), revision[:7], str(data.get("finishedAt") or ""))))
except Exception:
    pass
PY
)"
  IFS='|' read -r status revision finished_at <<<"${summary}"
  case "${status}" in
    success) print_status_row "$(state_marker healthy)" "Деплой" "${GREEN}${BOLD}[ УСПЕШНО ]${RESET} ${DIM}${revision}${RESET}" ;;
    deploying) print_status_row "$(state_marker starting)" "Деплой" "${YELLOW}${BOLD}[ ВЫПОЛНЯЕТСЯ ]${RESET} ${revision}" ;;
    rolled_back) print_status_row "${RED}↶${RESET}" "Деплой" "${RED}откат ${revision}${RESET}" ;;
    failed) print_status_row "${RED}●${RESET}" "Деплой" "${RED}ошибка${RESET}" ;;
  esac
}

show_deployment_status() {
  if [[ ! -f "${DEPLOY_STATE_FILE}" ]]; then
    warn "История деплоя ещё не записана. Она появится после следующего обновления."
    return 0
  fi
  python3 - "${DEPLOY_STATE_FILE}" <<'PY'
import json
import sys

data = json.load(open(sys.argv[1]))
labels = {
    "deploying": "выполняется",
    "success": "успешно",
    "failed": "ошибка",
    "rolled_back": "выполнен автоматический откат",
}
print(f"Результат: {labels.get(data.get('status'), data.get('status', 'неизвестно'))}")
print(f"Начало: {data.get('startedAt') or 'неизвестно'}")
print(f"Завершение: {data.get('finishedAt') or 'ещё не завершено'}")
print(f"Предыдущая версия: {(data.get('previousRevision') or 'неизвестно')[:12]}")
print(f"Целевая версия: {(data.get('targetRevision') or 'неизвестно')[:12]}")
print(f"Запущенная версия: {(data.get('deployedRevision') or data.get('rollbackRevision') or 'неизвестно')[:12]}")
print(f"Миграции: {data.get('migrations') or 'неизвестно'}")
health = data.get("health") or {}
print(f"Локальная проверка: {health.get('local') or 'неизвестно'}")
print(f"Публичная проверка: {health.get('public') or 'неизвестно'}")
if data.get("message"):
    print(f"Комментарий: {data['message']}")
PY
}

show_update_check_result() {
  info "Проверяем обновление..."
  set +e
  check_update_status
  local result=$?
  set -e

  case "${result}" in
    0) warn "Доступно обновление." ;;
    1) ok "Установлена актуальная версия." ;;
    *)
      if [[ -f "${UPDATE_STATUS_CACHE}" ]] && grep -q '|building$' "${UPDATE_STATUS_CACHE}" 2>/dev/null; then
        warn "Последняя версия ещё собирается. Старый образ вместо неё установлен не будет."
      elif [[ -f "${UPDATE_STATUS_CACHE}" ]] && grep -Eq '\|build[-_]failed$' "${UPDATE_STATUS_CACHE}" 2>/dev/null; then
        warn "Сборка последней версии неуспешна или отменена. Старый образ вместо неё установлен не будет."
      elif [[ -f "${UPDATE_STATUS_CACHE}" ]] && grep -q '|version-unknown$' "${UPDATE_STATUS_CACHE}" 2>/dev/null; then
        warn "Версия не зафиксирована. Запустите обновление системы."
      else
        warn "Не удалось проверить обновление."
      fi
      ;;
  esac
  return "${result}"
}

check_update_command() {
  show_update_check_result || true
}

download_executable() {
  local url="$1"
  local destination="$2"
  local temporary="${destination}.tmp"
  download_verified_release_file "${url}" "${temporary}"
  bash -n "${temporary}"
  install -m 755 "${temporary}" "${destination}"
  rm -f "${temporary}"
}

ensure_backup_command() {
  if [[ ! -x "${BACKUP_SCRIPT_PATH}" ]]; then
    info "Устанавливаем модуль полного бэкапа..."
    download_executable "${BACKUP_SCRIPT_URL}" "${BACKUP_SCRIPT_PATH}"
  fi
}

ensure_node_provisioning_command() {
  if [[ ! -x "${NODE_PROVISIONING_CONFIG_PATH}" ]]; then
    info "Устанавливаем мастер настройки нод..."
    download_executable "${NODE_PROVISIONING_CONFIG_URL}" "${NODE_PROVISIONING_CONFIG_PATH}"
  fi
}

cabinet_compose() {
  cabinet_installed || {
    fail "Кабинет ещё не установлен."
    return 1
  }
  CABINET_ENV_FILE="${CABINET_ENV}" docker compose \
    --env-file "${CABINET_ENV}" \
    -f "${CABINET_COMPOSE}" "$@"
}

install_cabinet() {
  if cabinet_installed; then
    warn "Кабинет уже установлен в ${CABINET_DIR}. Используйте обновление."
    return 1
  fi
  ensure_docker
  info "Запускаем мастер установки кабинета..."
  run_verified_script "${INSTALL_URL}"
  write_update_status_cache "latest"
}

update_cabinet() {
  cabinet_installed || {
    fail "Кабинет ещё не установлен. Сначала выберите установку."
    return 1
  }
  info "Обновляем кабинет..."
  run_verified_script "${UPDATE_URL}"
  write_update_status_cache latest
}

configure_node_provisioning() {
  cabinet_installed || {
    fail "Сначала установите кабинет."
    return 1
  }
  ensure_docker
  ensure_node_provisioning_command
  info "Проверяем и настраиваем автоматическое создание нод..."
  if ! ENV_FILE="${CABINET_ENV}" \
    COMPOSE_FILE="${CABINET_COMPOSE}" \
    NODE_PROVISIONING_INTERACTIVE="true" \
    NODE_PROVISIONING_START="true" \
    "${NODE_PROVISIONING_CONFIG_PATH}"
  then
    fail "Provisioning worker не запущен. Исправьте показанные выше настройки."
    return 1
  fi
  ok "Provisioning worker настроен и запущен."
}

update_console() {
  info "Обновляем управляющую консоль..."
  run_verified_script "${CONSOLE_INSTALL_URL}"
  rm -f "${UPDATE_STATUS_CACHE}" 2>/dev/null || true
  ok "Консоль обновлена. Перезапустите cabinetctl для загрузки новой версии."
}

edit_env() {
  cabinet_installed || {
    fail "Файл конфигурации появится после установки кабинета."
    return 1
  }
  sync_env_schema
  local editor="${EDITOR:-}"
  if [[ -z "${editor}" ]]; then
    if command -v nano >/dev/null 2>&1; then
      editor="nano"
    else
      editor="vi"
    fi
  fi
  "${editor}" "${CABINET_ENV}"
  warn "После изменения конфигурации перезапустите кабинет."
}

show_status() {
  ANIM_MARKER_ROWS=()
  ANIM_MARKER_COLUMNS=()
  ANIM_MARKER_STATES=()
  if ! docker_available; then
    print_status_row "${YELLOW}○${RESET}" "Docker" "${YELLOW}не установлен${RESET}"
    return
  fi
  if ! docker_running; then
    print_status_row "${RED}●${RESET}" "Docker" "${RED}не запущен${RESET}"
    return
  fi

  if ! cabinet_installed; then
    print_status_row "${DIM}○${RESET}" "Кабинет" "${DIM}не установлен${RESET}"
    return
  fi

  printf '%s\n' "${BOLD}  СОСТОЯНИЕ СЕРВИСОВ${RESET}"
  printf '%s\n' "${DIM}  ─────────────────────────────────────────────────────────${RESET}"
  print_service_grid_row "Кабинет" "remnawave-cabinet-app" "База" "remnawave-cabinet-db" 6
  print_service_grid_row "Платежи" "remnawave-cabinet-worker" "Рассылки" "remnawave-cabinet-broadcast-worker" 7
  print_service_grid_row "Watch" "remnawave-cabinet-watch-worker" "Ноды" "remnawave-cabinet-node-provisioning-worker" 8
}

show_logs() {
  local service="${1:-app}"
  warn "Для выхода из логов нажмите Ctrl+C."
  cabinet_compose logs -f --tail=200 "${service}" || true
}

logs_menu() {
  cabinet_installed || {
    fail "Кабинет ещё не установлен."
    return 1
  }
  require_tty
  printf '%s\n' \
    "  1. Приложение" \
    "  2. Платежи" \
    "  3. Рассылки" \
    "  4. Watch" \
    "  5. База данных" \
    "  6. Установка нод" \
    "  7. Все сервисы кабинета" \
    "  0. Назад" >/dev/tty
  printf 'Выберите логи: ' >/dev/tty
  local choice
  IFS= read -r choice </dev/tty
  case "${choice}" in
    1) show_logs app ;;
    2) show_logs worker ;;
    3) show_logs broadcast-worker ;;
    4) show_logs watch-worker ;;
    5) show_logs db ;;
    6) show_logs node-provisioning-worker ;;
    7) warn "Для выхода из логов нажмите Ctrl+C."; cabinet_compose logs -f --tail=200 || true ;;
    0) return ;;
    *) warn "Неизвестный пункт." ;;
  esac
}

restart_cabinet() {
  sync_env_schema
  cabinet_compose restart app worker broadcast-worker watch-worker
  ok "Сервисы кабинета перезапущены."
  cabinet_compose ps
}

show_services() {
  cabinet_compose ps
}

check_config() {
  sync_env_schema
  info "Проверяем конфигурацию кабинета..."
  cabinet_compose run --rm check-env
  ok "Конфигурация прошла проверку."
}

show_url() {
  cabinet_installed || {
    fail "Кабинет ещё не установлен."
    return 1
  }
  local app_url
  app_url="$(env_value APP_URL)"
  if [[ -z "${app_url}" ]]; then
    warn "APP_URL не заполнен в ${CABINET_ENV}."
    return 1
  fi
  printf '%s\n' "${app_url}"
}

health_check() {
  show_status
  printf '\n'

  if cabinet_installed; then
    local app_port health_token
    app_port="$(env_value CABINET_APP_PORT)"
    health_token="$(env_value HEALTHCHECK_TOKEN)"
    [[ -n "${app_port}" ]] || app_port="3000"
    printf '%s\n' "${BOLD}Проверка кабинета${RESET}"
    if [[ -n "${health_token}" ]] && command -v curl >/dev/null 2>&1; then
      if curl -fsS -H "x-healthcheck-token: ${health_token}" "http://127.0.0.1:${app_port}/api/health" >/dev/null; then
        ok "HTTP health и база кабинета отвечают"
      else
        warn "HTTP health кабинета не прошёл"
      fi
    else
      warn "Нет curl или HEALTHCHECK_TOKEN, глубокая HTTP-проверка пропущена"
    fi
    cabinet_compose ps
    printf '\n%s\n' "${BOLD}Последний деплой${RESET}"
    show_deployment_status
  else
    warn "Кабинет ещё не установлен."
  fi

  if [[ -x "${BACKUP_SCRIPT_PATH}" ]]; then
    printf '\n%s\n' "${BOLD}Бэкапы${RESET}"
    "${BACKUP_SCRIPT_PATH}" status || true
  fi
}

setup_nginx() {
  cabinet_installed || {
    fail "Сначала установите кабинет и заполните его домен."
    return 1
  }
  info "Настраиваем существующий nginx Remnawave..."
  run_verified_script "${NGINX_SETUP_URL}"
}

backup_full() {
  ensure_docker
  ensure_backup_command
  "${BACKUP_SCRIPT_PATH}" backup
}

backup_menu() {
  ensure_docker
  ensure_backup_command
  "${BACKUP_SCRIPT_PATH}"
}

backup_schedule() {
  ensure_backup_command
  "${BACKUP_SCRIPT_PATH}" schedule
}

backup_schedule_status() {
  ensure_backup_command
  "${BACKUP_SCRIPT_PATH}" schedule-status
}

backup_notification_test() {
  ensure_backup_command
  "${BACKUP_SCRIPT_PATH}" schedule-notify-test
}

verify_backup() {
  ensure_backup_command
  "${BACKUP_SCRIPT_PATH}" verify "${1:-}"
}

restore_backup() {
  if [[ -z "${1:-}" && -r /dev/tty ]]; then
    ensure_docker
    ensure_backup_command
    "${BACKUP_SCRIPT_PATH}" menu
    return
  fi

  if [[ "${RESTORE_CONFIRM:-}" != "RESTORE_REMNAWAVE_REMNASHOP_CABINET" ]]; then
    fail "Для CLI-восстановления задайте RESTORE_CONFIRM=RESTORE_REMNAWAVE_REMNASHOP_CABINET"
    return 1
  fi
  ensure_docker
  ensure_backup_command
  "${BACKUP_SCRIPT_PATH}" restore "${1:-}"
}

show_header() {
  local console_badge
  console_badge="$(console_update_badge)"
  printf '\033[H\033[2J'
  printf '%s\n' "${BOLD}${CYAN}REMNAWAVE CABINET${RESET}  ${DIM}v${VERSION}${RESET}${console_badge}"
  printf '%s\n' "${DIM}${CABINET_DIR}${RESET}"
  printf '\n'
  show_status
  update_status_line
  deployment_status_line
  if [[ -n "${ENV_SYNC_NOTICE}" ]]; then
    print_status_row "${CYAN}+${RESET}" ".env" "${CYAN}${ENV_SYNC_NOTICE}${RESET}"
  fi
}

show_menu() {
  show_header
  printf '\n'
  if cabinet_installed; then
    printf '%s\n' "${BOLD}  УПРАВЛЕНИЕ${RESET}"
    printf '%s\n' "${DIM}${CYAN}  ╭───────────────────────────┬───────────────────────────╮${RESET}"
    print_menu_row "1" "Обновить кабинет" "6" "Проверить .env"
    print_menu_row "2" "Перезапустить" "7" "Логи"
    print_menu_row "3" "Диагностика" "8" "Бэкапы"
    print_menu_row "4" "Настроить ноды" "9" "Обновить cabinetctl"
    print_menu_row "5" "Открыть .env" " " ""
    printf '%s\n' "${DIM}${CYAN}  ╰───────────────────────────┴───────────────────────────╯${RESET}"
    printf '\n  %s[ 0 ]%s  Выход\n' "${DIM}" "${RESET}"
  else
    printf '  %s1%s  Установить кабинет\n' "${CYAN}" "${RESET}"
    printf '  %s2%s  Диагностика\n' "${CYAN}" "${RESET}"
    printf '  %s3%s  Бэкапы\n' "${CYAN}" "${RESET}"
    printf '  %s8%s  Обновить cabinetctl\n' "${CYAN}" "${RESET}"
    printf '\n  %s0%s  Выход\n' "${DIM}" "${RESET}"
  fi
  printf '\n  %sВыберите пункт%s  %sEnter не нужен%s' \
    "${CYAN}${BOLD}" "${RESET}" "${DIM}" "${RESET}" >/dev/tty
}

read_menu_choice() {
  MENU_CHOICE=""
  show_menu
  printf '\033[?25l' 2>/dev/null >/dev/tty || return 1
  start_status_animation
  if ! IFS= read -r -s -n 1 MENU_CHOICE 2>/dev/null </dev/tty; then
    stop_status_animation
    printf '\033[?25h' 2>/dev/null >/dev/tty || true
    return 1
  fi
  stop_status_animation
  printf '\033[?25h' 2>/dev/null >/dev/tty || true
  printf '\r\033[2K  %s›%s %s\n' "${CYAN}" "${RESET}" "${MENU_CHOICE}" >/dev/tty
}

cleanup_menu_terminal() {
  stop_status_animation
  printf '\033[?25h' 2>/dev/null >/dev/tty || true
}

run_menu() {
  [[ -r /dev/tty ]] || {
    show_help
    exit 1
  }

  sync_env_schema
  trap cleanup_menu_terminal EXIT

  while true; do
    local choice
    read_menu_choice || exit 0
    choice="${MENU_CHOICE}"
    printf '\n'
    if cabinet_installed; then
      case "${choice}" in
        1) update_cabinet || true; pause ;;
        2) restart_cabinet || true; pause ;;
        3) health_check || true; pause ;;
        4) configure_node_provisioning || true; pause ;;
        5) edit_env || true; pause ;;
        6) check_config || true; pause ;;
        7) logs_menu || true; pause ;;
        8) backup_menu || true; pause ;;
        9) update_console || true; pause ;;
        0) exit 0 ;;
        *) warn "Неизвестный пункт."; pause ;;
      esac
    else
      case "${choice}" in
        1) install_cabinet || true; pause ;;
        2) health_check || true; pause ;;
        3) backup_menu || true; pause ;;
        8) update_console || true; pause ;;
        0) exit 0 ;;
        *) warn "Неизвестный пункт."; pause ;;
      esac
    fi
  done
}

show_help() {
  cat <<EOF
Remnawave Cabinet ${VERSION}

Использование:
  cabinetctl                    интерактивная консоль
  cabinetctl install            установить кабинет
  cabinetctl update             обновить систему
  cabinetctl check-update       проверить наличие обновления
  cabinetctl deploy-status      результат последнего обновления и health-check
  cabinetctl env                открыть .env
  cabinetctl config-check       проверить переменные .env
  cabinetctl provisioning       настроить и запустить создание нод
  cabinetctl health             здоровье системы
  cabinetctl logs [service]     логи app, worker, broadcast-worker, watch-worker, node-provisioning-worker, db
  cabinetctl backups            бэкапы, восстановление и S3
  cabinetctl backup-schedule    настроить автоматический бэкап
  cabinetctl backup-status      статус автоматического бэкапа
  cabinetctl backup-notify-test проверить Telegram-уведомление
  cabinetctl status             краткое состояние сервисов
  cabinetctl ps                 состояние compose-сервисов
  cabinetctl url                показать адрес кабинета
  cabinetctl restart            перезапустить кабинет без обновления
  cabinetctl nginx              настроить nginx и HTTPS
  cabinetctl backup             создать бэкап без меню
  cabinetctl restore            восстановить через меню
  RESTORE_CONFIRM=RESTORE_REMNAWAVE_REMNASHOP_CABINET \\
    cabinetctl restore ARCHIVE  восстановить сервер
  cabinetctl self-update        обновить консоль
  cabinetctl version            показать версию консоли
EOF
}

case "${1:-menu}" in
  help|-h|--help) show_help; exit 0 ;;
  version|-v|--version) printf 'cabinetctl %s\n' "${VERSION}"; exit 0 ;;
esac

if [[ "$(id -u)" -ne 0 ]]; then
  exec sudo --preserve-env=BRANCH,RAW_BASE_URL,GITHUB_API_URL,GITHUB_WORKFLOW_RUNS_URL,INSTALL_URL,UPDATE_URL,NGINX_SETUP_URL,CONSOLE_INSTALL_URL,BACKUP_SCRIPT_URL,NODE_PROVISIONING_CONFIG_URL,ENV_TEMPLATE_URL,CABINETCTL_PATH,BACKUP_SCRIPT_PATH,NODE_PROVISIONING_CONFIG_PATH,INSTALL_DIR,CABINET_VERSION_FILE,CABINET_STATE_DIR,CABINETCTL_UPDATE_CACHE,CABINETCTL_UPDATE_CACHE_TTL,CABINETCTL_CHECK_UPDATES_IN_MENU "$0" "$@"
fi

case "${1:-menu}" in
  menu) run_menu ;;
  install) install_cabinet ;;
  update) update_cabinet ;;
  update-check|check-update) check_update_command ;;
  deploy-status) show_deployment_status ;;
  env) edit_env ;;
  config-check|check-config) check_config ;;
  provisioning|nodes-setup) configure_node_provisioning ;;
  status) show_status ;;
  ps|services) show_services ;;
  url) show_url ;;
  restart) restart_cabinet ;;
  logs)
    if [[ -n "${2:-}" ]]; then
      show_logs "${2}"
    else
      logs_menu
    fi
    ;;
  worker) show_logs worker ;;
  health) health_check ;;
  nginx) setup_nginx ;;
  backup) backup_full ;;
  backups) backup_menu ;;
  backup-schedule|schedule-backup) backup_schedule ;;
  backup-status|schedule-status) backup_schedule_status ;;
  backup-notify-test) backup_notification_test ;;
  verify) verify_backup "${2:-}" ;;
  restore) restore_backup "${2:-}" ;;
  self-update) update_console ;;
  *) show_help; exit 1 ;;
esac

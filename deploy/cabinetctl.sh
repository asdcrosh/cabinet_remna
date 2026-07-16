#!/usr/bin/env bash
set -euo pipefail

VERSION="1.4.0"
BRANCH="${BRANCH:-main}"
RAW_BASE_URL="${RAW_BASE_URL:-https://raw.githubusercontent.com/asdcrosh/cabinet_remna/${BRANCH}}"
GITHUB_API_URL="${GITHUB_API_URL:-https://api.github.com/repos/asdcrosh/cabinet_remna/commits/${BRANCH}}"
INSTALL_URL="${INSTALL_URL:-${RAW_BASE_URL}/deploy/install-server.sh}"
UPDATE_URL="${UPDATE_URL:-${RAW_BASE_URL}/deploy/update-server.sh}"
NGINX_SETUP_URL="${NGINX_SETUP_URL:-${RAW_BASE_URL}/deploy/setup-nginx-proxy.sh}"
CONSOLE_INSTALL_URL="${CONSOLE_INSTALL_URL:-${RAW_BASE_URL}/deploy/install-console.sh}"
BACKUP_SCRIPT_URL="${BACKUP_SCRIPT_URL:-${RAW_BASE_URL}/deploy/full-stack-backup.sh}"
ENV_TEMPLATE_URL="${ENV_TEMPLATE_URL:-${RAW_BASE_URL}/deploy/env.production.example}"
CABINETCTL_PATH="${CABINETCTL_PATH:-/usr/local/bin/cabinetctl}"
BACKUP_SCRIPT_PATH="${BACKUP_SCRIPT_PATH:-/usr/local/bin/remna-backup}"
CABINET_DIR="${INSTALL_DIR:-/opt/remnawave-cabinet}"
CABINET_ENV="${CABINET_DIR}/.env"
CABINET_COMPOSE="${CABINET_DIR}/docker-compose.yml"
CABINET_VERSION_FILE="${CABINET_VERSION_FILE:-${CABINET_DIR}/.cabinet-version}"
UPDATE_STATUS_CACHE="${CABINETCTL_UPDATE_CACHE:-/var/cache/remnawave-cabinet/update-status}"
UPDATE_STATUS_CACHE_TTL="${CABINETCTL_UPDATE_CACHE_TTL:-1800}"
CHECK_UPDATES_IN_MENU="${CABINETCTL_CHECK_UPDATES_IN_MENU:-1}"
ENV_SCHEMA_SYNCED=0
ENV_SYNC_NOTICE=""

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
  curl -fsSL https://get.docker.com | sh
  docker compose version >/dev/null 2>&1 || {
    fail "Docker Compose plugin не установлен."
    return 1
  }
}

container_state() {
  local container="$1"
  local state
  state="$(docker inspect -f '{{.State.Status}}' "${container}" 2>/dev/null || true)"
  [[ -n "${state}" ]] && printf '%s\n' "${state}" || printf '%s\n' "не найден"
}

state_label() {
  case "${1:-}" in
    running) printf '%s' "${GREEN}работает${RESET}" ;;
    restarting) printf '%s' "${YELLOW}перезапускается${RESET}" ;;
    created) printf '%s' "${YELLOW}создан${RESET}" ;;
    exited|dead|removing|paused) printf '%s' "${RED}остановлен${RESET}" ;;
    "не найден"|"") printf '%s' "${DIM}не найден${RESET}" ;;
    *) printf '%s%s%s' "${YELLOW}" "$1" "${RESET}" ;;
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
    running) printf '%s' "${GREEN}●${RESET}" ;;
    restarting|created) printf '%s' "${YELLOW}●${RESET}" ;;
    exited|dead|removing|paused) printf '%s' "${RED}●${RESET}" ;;
    *) printf '%s' "${DIM}○${RESET}" ;;
  esac
}

print_status_row() {
  local marker="$1"
  local label="$2"
  local value="$3"
  local padding=$((16 - ${#label}))
  (( padding > 0 )) || padding=1
  printf '  %b  %s%*s%b\n' "${marker}" "${label}" "${padding}" "" "${value}"
}

print_menu_row() {
  local left_number="$1"
  local left_label="$2"
  local right_number="$3"
  local right_label="$4"
  local padding=$((22 - ${#left_label}))
  (( padding > 0 )) || padding=1
  printf '  %s%s%s  %s%*s%s%s%s  %s\n' \
    "${CYAN}" "${left_number}" "${RESET}" \
    "${left_label}" "${padding}" "" \
    "${CYAN}" "${right_number}" "${RESET}" "${right_label}"
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
  if ! curl -fsSL --connect-timeout 2 --max-time 5 "${ENV_TEMPLATE_URL}" -o "${template_file}" 2>/dev/null; then
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
obsolete = {"CABINET_OPS_IMAGE", "CABINET_PULL_POLICY"}
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

  local remote_sha installed_sha
  remote_sha="$(remote_commit_sha)"
  if [[ -z "${remote_sha}" ]]; then
    write_update_status_cache "check-failed"
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
    latest|current) print_status_row "${GREEN}●${RESET}" "Обновление" "${GREEN}не требуется${RESET}" ;;
    available) print_status_row "${YELLOW}↑${RESET}" "Обновление" "${YELLOW}${BOLD}доступно${RESET}" ;;
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
  printf '%s|%s\n' "$(date +%s)" "${status}" >"${UPDATE_STATUS_CACHE}" 2>/dev/null || true
}

read_update_status_cache() {
  [[ -f "${UPDATE_STATUS_CACHE}" ]] || return 1
  local created_at status now
  IFS='|' read -r created_at status <"${UPDATE_STATUS_CACHE}" || return 1
  [[ "${created_at}" =~ ^[0-9]+$ ]] || return 1
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
      if [[ -f "${UPDATE_STATUS_CACHE}" ]] && grep -q '|version-unknown$' "${UPDATE_STATUS_CACHE}" 2>/dev/null; then
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
  curl -fsSL "${url}" -o "${temporary}"
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
  curl -fsSL "${INSTALL_URL}" | bash
  write_update_status_cache "latest"
}

update_cabinet() {
  cabinet_installed || {
    fail "Кабинет ещё не установлен. Сначала выберите установку."
    return 1
  }
  info "Обновляем кабинет..."
  curl -fsSL "${UPDATE_URL}" | bash
  write_update_status_cache latest
}

update_console() {
  info "Обновляем управляющую консоль..."
  curl -fsSL "${CONSOLE_INSTALL_URL}" | bash
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

  print_service_state "Кабинет" "remnawave-cabinet-app"
  print_service_state "База" "remnawave-cabinet-db"
  local payment_state broadcast_state workers_state
  payment_state="$(container_state remnawave-cabinet-worker)"
  broadcast_state="$(container_state remnawave-cabinet-broadcast-worker)"
  if [[ "${payment_state}" == "running" && "${broadcast_state}" == "running" ]]; then
    workers_state="running"
  elif [[ "${payment_state}" == "restarting" || "${broadcast_state}" == "restarting" ]]; then
    workers_state="restarting"
  elif [[ "${payment_state}" == "не найден" && "${broadcast_state}" == "не найден" ]]; then
    workers_state="не найден"
  else
    workers_state="exited"
  fi
  local workers_label
  case "${workers_state}" in
    running) workers_label="${GREEN}работают${RESET}" ;;
    restarting) workers_label="${YELLOW}перезапускаются${RESET}" ;;
    exited) workers_label="${RED}остановлены${RESET}" ;;
    *) workers_label="${DIM}не найдены${RESET}" ;;
  esac
  print_status_row "$(state_marker "${workers_state}")" "Фоновые задачи" "${workers_label}"
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
    "  4. База данных" \
    "  5. Все сервисы кабинета" \
    "  0. Назад" >/dev/tty
  printf 'Выберите логи: ' >/dev/tty
  local choice
  IFS= read -r choice </dev/tty
  case "${choice}" in
    1) show_logs app ;;
    2) show_logs worker ;;
    3) show_logs broadcast-worker ;;
    4) show_logs db ;;
    5) warn "Для выхода из логов нажмите Ctrl+C."; cabinet_compose logs -f --tail=200 || true ;;
    0) return ;;
    *) warn "Неизвестный пункт." ;;
  esac
}

restart_cabinet() {
  sync_env_schema
  cabinet_compose restart app worker broadcast-worker
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
  curl -fsSL "${NGINX_SETUP_URL}" | bash
}

backup_full() {
  ensure_docker
  ensure_backup_command
  "${BACKUP_SCRIPT_PATH}" backup
}

backup_menu() {
  ensure_backup_command
  "${BACKUP_SCRIPT_PATH}"
}

verify_backup() {
  ensure_backup_command
  "${BACKUP_SCRIPT_PATH}" verify "${1:-}"
}

restore_backup() {
  if [[ -z "${1:-}" && -r /dev/tty ]]; then
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
  clear 2>/dev/null || true
  printf '%s\n' "${BOLD}${CYAN}Remnawave Cabinet${RESET}  ${DIM}v${VERSION}${RESET}"
  printf '%s\n' "${DIM}${CABINET_DIR}${RESET}"
  printf '\n'
  show_status
  update_status_line
  if [[ -n "${ENV_SYNC_NOTICE}" ]]; then
    print_status_row "${CYAN}+${RESET}" ".env" "${CYAN}${ENV_SYNC_NOTICE}${RESET}"
  fi
}

show_menu() {
  show_header
  printf '\n'
  if cabinet_installed; then
    print_menu_row "1" "Обновить кабинет" "5" "Проверить .env"
    print_menu_row "2" "Перезапустить" "6" "Логи"
    print_menu_row "3" "Диагностика" "7" "Бэкапы"
    print_menu_row "4" "Открыть .env" "8" "Обновить cabinetctl"
    printf '\n  %s0%s  Выход\n' "${DIM}" "${RESET}"
  else
    printf '  %s1%s  Установить кабинет\n' "${CYAN}" "${RESET}"
    printf '  %s2%s  Диагностика\n' "${CYAN}" "${RESET}"
    printf '  %s3%s  Бэкапы\n' "${CYAN}" "${RESET}"
    printf '  %s8%s  Обновить cabinetctl\n' "${CYAN}" "${RESET}"
    printf '\n  %s0%s  Выход\n' "${DIM}" "${RESET}"
  fi
  printf '\n%s›%s ' "${CYAN}" "${RESET}" >/dev/tty
}

run_menu() {
  [[ -r /dev/tty ]] || {
    show_help
    exit 1
  }

  sync_env_schema

  while true; do
    show_menu
    local choice
    IFS= read -r choice </dev/tty || exit 0
    printf '\n'
    if cabinet_installed; then
      case "${choice}" in
        1) update_cabinet || true; pause ;;
        2) restart_cabinet || true; pause ;;
        3) health_check || true; pause ;;
        4) edit_env || true; pause ;;
        5) check_config || true; pause ;;
        6) logs_menu || true; pause ;;
        7) backup_menu || true; pause ;;
        8) update_console || true; pause ;;
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
  cabinetctl env                открыть .env
  cabinetctl config-check       проверить переменные .env
  cabinetctl health             здоровье системы
  cabinetctl logs [service]     меню или логи app, worker, broadcast-worker, db
  cabinetctl backups            бэкапы, восстановление и S3
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
  exec sudo --preserve-env=BRANCH,RAW_BASE_URL,GITHUB_API_URL,INSTALL_URL,UPDATE_URL,NGINX_SETUP_URL,CONSOLE_INSTALL_URL,BACKUP_SCRIPT_URL,ENV_TEMPLATE_URL,CABINETCTL_PATH,BACKUP_SCRIPT_PATH,INSTALL_DIR,CABINET_VERSION_FILE,CABINETCTL_UPDATE_CACHE,CABINETCTL_UPDATE_CACHE_TTL,CABINETCTL_CHECK_UPDATES_IN_MENU "$0" "$@"
fi

case "${1:-menu}" in
  menu) run_menu ;;
  install) install_cabinet ;;
  update) update_cabinet ;;
  update-check|check-update) check_update_command ;;
  env) edit_env ;;
  config-check|check-config) check_config ;;
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
  verify) verify_backup "${2:-}" ;;
  restore) restore_backup "${2:-}" ;;
  self-update) update_console ;;
  *) show_help; exit 1 ;;
esac

#!/usr/bin/env bash
set -euo pipefail

VERSION="1.2.0"
BRANCH="${BRANCH:-main}"
RAW_BASE_URL="${RAW_BASE_URL:-https://raw.githubusercontent.com/asdcrosh/cabinet_remna/${BRANCH}}"
INSTALL_URL="${INSTALL_URL:-${RAW_BASE_URL}/deploy/install-server.sh}"
UPDATE_URL="${UPDATE_URL:-${RAW_BASE_URL}/deploy/update-server.sh}"
NGINX_SETUP_URL="${NGINX_SETUP_URL:-${RAW_BASE_URL}/deploy/setup-nginx-proxy.sh}"
CONSOLE_INSTALL_URL="${CONSOLE_INSTALL_URL:-${RAW_BASE_URL}/deploy/install-console.sh}"
BACKUP_SCRIPT_URL="${BACKUP_SCRIPT_URL:-${RAW_BASE_URL}/deploy/full-stack-backup.sh}"
CABINETCTL_PATH="${CABINETCTL_PATH:-/usr/local/bin/cabinetctl}"
BACKUP_SCRIPT_PATH="${BACKUP_SCRIPT_PATH:-/usr/local/bin/remna-backup}"
CABINET_DIR="${INSTALL_DIR:-/opt/remnawave-cabinet}"
CABINET_ENV="${CABINET_DIR}/.env"
CABINET_COMPOSE="${CABINET_DIR}/docker-compose.yml"
UPDATE_STATUS_CACHE="${CABINETCTL_UPDATE_CACHE:-/var/cache/remnawave-cabinet/update-status}"
UPDATE_STATUS_CACHE_TTL="${CABINETCTL_UPDATE_CACHE_TTL:-3600}"

if [[ "$(id -u)" -ne 0 ]]; then
  exec sudo --preserve-env=BRANCH,RAW_BASE_URL,INSTALL_URL,UPDATE_URL,NGINX_SETUP_URL,CONSOLE_INSTALL_URL,BACKUP_SCRIPT_URL,CABINETCTL_PATH,BACKUP_SCRIPT_PATH,INSTALL_DIR,CABINETCTL_UPDATE_CACHE,CABINETCTL_UPDATE_CACHE_TTL,CABINETCTL_CHECK_UPDATES_IN_MENU "$0" "$@"
fi

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

check_update_status() {
  if ! cabinet_installed; then
    write_update_status_cache "not-installed"
    return 2
  fi
  if ! docker_available; then
    write_update_status_cache "docker-unavailable"
    return 2
  fi

  local image running_image latest_image
  image="$(compose_image)"
  running_image="$(container_image_id remnawave-cabinet-app)"

  if [[ -z "${running_image}" ]]; then
    write_update_status_cache "app-not-running"
    return 2
  fi

  if ! pull_latest_image "${image}"; then
    write_update_status_cache "check-failed"
    return 2
  fi

  latest_image="$(local_image_id "${image}")"
  if [[ -n "${latest_image}" && "${running_image}" == "${latest_image}" ]]; then
    write_update_status_cache "latest"
    return 1
  else
    write_update_status_cache "available"
    return 0
  fi
}

print_update_status_key() {
  case "${1:-unknown}" in
    latest|current) printf '  Обновление:  %s\n' "${GREEN}Установлена актуальная версия${RESET}" ;;
    available) printf '  Обновление:  %s\n' "${YELLOW}Доступно обновление${RESET}" ;;
    check-failed|check_failed|unknown) printf '  Обновление:  %s\n' "${YELLOW}не удалось проверить${RESET}" ;;
    docker-unavailable|docker_unavailable) printf '  Обновление:  %s\n' "${YELLOW}Docker недоступен${RESET}" ;;
    app-not-running|app_not_running) printf '  Обновление:  %s\n' "${YELLOW}кабинет не запущен${RESET}" ;;
    not-installed|not_installed) printf '  Обновление:  %s\n' "${DIM}доступно после установки${RESET}" ;;
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
    printf '  Обновление:  %s\n' "${DIM}доступно после установки${RESET}"
    return
  fi
  if read_update_status_cache; then
    return
  fi
  printf '  Обновление:  %s\n' "${DIM}не проверялось · cabinetctl check-update${RESET}"
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
    *) warn "Не удалось проверить обновление." ;;
  esac
  return "${result}"
}

check_update_command() {
  show_update_check_result || true
}

confirm_update_when_current() {
  require_tty || return 1
  printf 'Обновлений образа нет. Всё равно перезапустить и обновить служебные файлы? [y/N]: ' >/dev/tty
  local answer
  IFS= read -r answer </dev/tty
  case "${answer}" in
    y|Y|yes|YES|д|Д|да|ДА) return 0 ;;
    *) return 1 ;;
  esac
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
  set +e
  show_update_check_result
  local update_result=$?
  set -e

  if [[ "${update_result}" == "1" ]] && ! confirm_update_when_current; then
    return 0
  fi

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
    printf '  Docker:  %s\n' "${YELLOW}не установлен${RESET}"
    return
  fi

  printf '  Docker:    %s\n' "${GREEN}готов${RESET}"
  printf '  Кабинет:   app %s, worker %s, db %s\n' \
    "$(container_state remnawave-cabinet-app)" \
    "$(container_state remnawave-cabinet-worker)" \
    "$(container_state remnawave-cabinet-db)"
  printf '  Сервисы:   Remnawave %s, Remnashop %s, nginx %s\n' \
    "$(container_state remnawave)" \
    "$(container_state remnashop)" \
    "$(container_state remnawave-nginx)"
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
    "  2. Worker платежей" \
    "  3. Все сервисы кабинета" \
    "  0. Назад" >/dev/tty
  printf 'Выберите логи: ' >/dev/tty
  local choice
  IFS= read -r choice </dev/tty
  case "${choice}" in
    1) show_logs app ;;
    2) show_logs worker ;;
    3) warn "Для выхода из логов нажмите Ctrl+C."; cabinet_compose logs -f --tail=200 || true ;;
    0) return ;;
    *) warn "Неизвестный пункт." ;;
  esac
}

restart_cabinet() {
  cabinet_compose up -d --remove-orphans
  ok "Сервисы кабинета перезапущены."
  cabinet_compose ps
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

  printf '\n'
  ensure_backup_command
  "${BACKUP_SCRIPT_PATH}" status || true
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
  printf '%s\n' "${BOLD}${CYAN}Remnawave Cabinet${RESET} ${DIM}v${VERSION}${RESET}"
  printf '%s\n\n' "${DIM}Установка и управление кабинетом${RESET}"
  update_status_line
  printf '\n'
  show_status
  printf '\n'
}

show_menu() {
  show_header
  if cabinet_installed; then
    printf '%s\n' \
      "  1. Обновить систему" \
      "  2. Настроить .env" \
      "  3. Здоровье системы" \
      "  4. Логи" \
      "  5. Бэкапы" \
      "  0. Выход"
  else
    printf '%s\n' \
      "  1. Установить кабинет" \
      "  2. Здоровье системы" \
      "  3. Бэкапы" \
      "  0. Выход"
  fi
  printf '\nВыберите действие: ' >/dev/tty
}

run_menu() {
  [[ -r /dev/tty ]] || {
    show_help
    exit 1
  }

  while true; do
    show_menu
    local choice archive
    IFS= read -r choice </dev/tty || exit 0
    printf '\n'
    if cabinet_installed; then
      case "${choice}" in
        1) update_cabinet || true; pause ;;
        2) edit_env || true; pause ;;
        3) health_check || true; pause ;;
        4) logs_menu || true; pause ;;
        5) backup_menu || true; pause ;;
        0) exit 0 ;;
        *) warn "Неизвестный пункт."; pause ;;
      esac
    else
      case "${choice}" in
        1) install_cabinet || true; pause ;;
        2) health_check || true; pause ;;
        3) backup_menu || true; pause ;;
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
  cabinetctl health             здоровье системы
  cabinetctl logs               меню логов
  cabinetctl backups            бэкапы, восстановление и S3
  cabinetctl status             краткое состояние сервисов
  cabinetctl restart            перезапустить кабинет без обновления
  cabinetctl nginx              настроить nginx и HTTPS
  cabinetctl backup             создать бэкап без меню
  cabinetctl restore            восстановить через меню
  RESTORE_CONFIRM=RESTORE_REMNAWAVE_REMNASHOP_CABINET \\
    cabinetctl restore ARCHIVE  восстановить сервер
  cabinetctl self-update        обновить консоль
EOF
}

case "${1:-menu}" in
  menu) run_menu ;;
  install) install_cabinet ;;
  update) update_cabinet ;;
  update-check|check-update) check_update_command ;;
  env) edit_env ;;
  status) show_status ;;
  restart) restart_cabinet ;;
  logs) logs_menu ;;
  worker) show_logs worker ;;
  health) health_check ;;
  nginx) setup_nginx ;;
  backup) backup_full ;;
  backups) backup_menu ;;
  verify) verify_backup "${2:-}" ;;
  restore) restore_backup "${2:-}" ;;
  self-update) update_console ;;
  help|-h|--help) show_help ;;
  *) show_help; exit 1 ;;
esac

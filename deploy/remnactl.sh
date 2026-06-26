#!/usr/bin/env bash
set -euo pipefail

VERSION="1.1.1"
BRANCH="${BRANCH:-main}"
RAW_BASE_URL="${RAW_BASE_URL:-https://raw.githubusercontent.com/asdcrosh/cabinet_remna/${BRANCH}}"
INSTALL_URL="${INSTALL_URL:-${RAW_BASE_URL}/deploy/install-server.sh}"
UPDATE_URL="${UPDATE_URL:-${RAW_BASE_URL}/deploy/update-server.sh}"
NGINX_SETUP_URL="${NGINX_SETUP_URL:-${RAW_BASE_URL}/deploy/setup-nginx-proxy.sh}"
CONSOLE_INSTALL_URL="${CONSOLE_INSTALL_URL:-${RAW_BASE_URL}/deploy/install-console.sh}"
BACKUP_SCRIPT_URL="${BACKUP_SCRIPT_URL:-${RAW_BASE_URL}/deploy/full-stack-backup.sh}"
REMNACTL_PATH="${REMNACTL_PATH:-/usr/local/bin/remnactl}"
BACKUP_SCRIPT_PATH="${BACKUP_SCRIPT_PATH:-/usr/local/bin/remna-backup}"
CABINET_DIR="${INSTALL_DIR:-/opt/remnawave-cabinet}"
CABINET_ENV="${CABINET_DIR}/.env"
CABINET_COMPOSE="${CABINET_DIR}/docker-compose.yml"

if [[ "$(id -u)" -ne 0 ]]; then
  exec sudo --preserve-env=BRANCH,RAW_BASE_URL,INSTALL_URL,UPDATE_URL,NGINX_SETUP_URL,CONSOLE_INSTALL_URL,BACKUP_SCRIPT_URL,REMNACTL_PATH,BACKUP_SCRIPT_PATH,INSTALL_DIR "$0" "$@"
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
}

update_cabinet() {
  cabinet_installed || {
    fail "Кабинет ещё не установлен. Сначала выберите установку."
    return 1
  }
  info "Обновляем кабинет..."
  curl -fsSL "${UPDATE_URL}" | bash
}

update_console() {
  info "Обновляем управляющую консоль..."
  curl -fsSL "${CONSOLE_INSTALL_URL}" | bash
  ok "Консоль обновлена. Перезапустите remnactl для загрузки новой версии."
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
  printf '%s\n' "${BOLD}Состояние сервера${RESET}"
  if ! docker_available; then
    printf '  Docker:       %s\n' "${YELLOW}не установлен${RESET}"
    printf '  Remnawave:    неизвестно\n'
    printf '  Remnashop:    неизвестно\n'
    printf '  Кабинет:      не установлен\n'
    return
  fi

  printf '  Docker:       %s\n' "${GREEN}готов${RESET}"
  printf '  Remnawave:    %s\n' "$(container_state remnawave)"
  printf '  Remnashop:    %s\n' "$(container_state remnashop)"
  printf '  Кабинет:      %s\n' "$(container_state remnawave-cabinet-app)"
  printf '  Worker:       %s\n' "$(container_state remnawave-cabinet-worker)"
  printf '  Nginx:        %s\n' "$(container_state remnawave-nginx)"
  printf '\n'
  docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' \
    | grep -E 'NAMES|remnawave|remnashop' || true
}

show_logs() {
  local service="${1:-app}"
  warn "Для выхода из логов нажмите Ctrl+C."
  cabinet_compose logs -f --tail=200 "${service}" || true
}

restart_cabinet() {
  cabinet_compose up -d --remove-orphans
  ok "Сервисы кабинета перезапущены."
  cabinet_compose ps
}

health_check() {
  cabinet_installed || {
    fail "Кабинет ещё не установлен."
    return 1
  }
  if command -v cabinetctl >/dev/null 2>&1; then
    cabinetctl health
    return
  fi
  cabinet_compose ps
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
  printf '%s\n' "${BOLD}${CYAN}Remna Control${RESET} ${DIM}v${VERSION}${RESET}"
  printf '%s\n\n' "${DIM}Установка, обновление и перенос VPN-сервисов${RESET}"
  show_status
  printf '\n'
}

show_menu() {
  show_header
  if cabinet_installed; then
    printf '%s\n' \
      "  1. Обновить кабинет" \
      "  2. Настроить .env" \
      "  3. Перезапустить кабинет" \
      "  4. Логи приложения" \
      "  5. Логи worker" \
      "  6. Проверить кабинет" \
      "  7. Настроить nginx и HTTPS" \
      "  8. Резервные копии и S3" \
      "  9. Обновить консоль" \
      "  0. Выход"
  else
    printf '%s\n' \
      "  1. Установить кабинет" \
      "  2. Резервные копии и восстановление" \
      "  3. Показать состояние сервера" \
      "  4. Обновить консоль" \
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
        3) restart_cabinet || true; pause ;;
        4) show_logs app; pause ;;
        5) show_logs worker; pause ;;
        6) health_check || true; pause ;;
        7) setup_nginx || true; pause ;;
        8) backup_menu || true; pause ;;
        9) update_console || true; pause ;;
        0) exit 0 ;;
        *) warn "Неизвестный пункт."; pause ;;
      esac
    else
      case "${choice}" in
        1) install_cabinet || true; pause ;;
        2) backup_menu || true; pause ;;
        3) show_status; pause ;;
        4) update_console || true; pause ;;
        0) exit 0 ;;
        *) warn "Неизвестный пункт."; pause ;;
      esac
    fi
  done
}

show_help() {
  cat <<EOF
Remna Control ${VERSION}

Использование:
  remnactl                    интерактивная консоль
  remnactl install            установить кабинет
  remnactl update             обновить кабинет
  remnactl env                открыть .env
  remnactl status             состояние всех сервисов
  remnactl restart            перезапустить кабинет
  remnactl logs               логи приложения
  remnactl worker             логи worker
  remnactl health             проверить кабинет
  remnactl nginx              настроить nginx и HTTPS
  remnactl backup             создать полный бэкап
  remnactl backups            меню бэкапов
  remnactl verify ARCHIVE     проверить архив
  remnactl restore            выбрать архив и восстановить через меню
  RESTORE_CONFIRM=RESTORE_REMNAWAVE_REMNASHOP_CABINET \\
    remnactl restore ARCHIVE  восстановить сервер
  remnactl self-update        обновить консоль
EOF
}

case "${1:-menu}" in
  menu) run_menu ;;
  install) install_cabinet ;;
  update) update_cabinet ;;
  env) edit_env ;;
  status) show_status ;;
  restart) restart_cabinet ;;
  logs) show_logs app ;;
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

#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/remnawave-cabinet}"
ENV_FILE="${INSTALL_DIR}/.env"
COMPOSE_FILE="${INSTALL_DIR}/docker-compose.yml"
RAW_BASE_URL="${RAW_BASE_URL:-https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main}"
UPDATE_URL="${UPDATE_URL:-${RAW_BASE_URL}/deploy/update-server.sh}"
BACKUP_DIR="${INSTALL_DIR}/backups"

if [[ "$(id -u)" -ne 0 ]]; then
  exec sudo --preserve-env=INSTALL_DIR,RAW_BASE_URL,UPDATE_URL "$0" "$@"
fi

if [[ ! -f "${ENV_FILE}" || ! -f "${COMPOSE_FILE}" ]]; then
  echo "Cabinet installation was not found in ${INSTALL_DIR}."
  exit 1
fi

COMPOSE=(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}")
export CABINET_ENV_FILE="${ENV_FILE}"

if [[ -t 1 ]]; then
  BOLD=$'\033[1m'
  CYAN=$'\033[36m'
  GREEN=$'\033[32m'
  YELLOW=$'\033[33m'
  RED=$'\033[31m'
  RESET=$'\033[0m'
else
  BOLD="" CYAN="" GREEN="" YELLOW="" RED="" RESET=""
fi

title() {
  printf '%s\n' "${CYAN}${BOLD}Remnawave Cabinet${RESET}"
}

pause() {
  if [[ -r /dev/tty ]]; then
    printf '\nНажмите Enter, чтобы вернуться в меню...' >/dev/tty
    IFS= read -r _ </dev/tty || true
  fi
}

env_value() {
  local key="$1"
  ENV_FILE_PATH="${ENV_FILE}" python3 - "$key" <<'PY'
from pathlib import Path
import os
import sys

key = sys.argv[1]
for line in Path(os.environ["ENV_FILE_PATH"]).read_text().splitlines():
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or "=" not in stripped:
        continue
    current_key, value = stripped.split("=", 1)
    if current_key.strip() != key:
        continue
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        value = value[1:-1]
    print(value)
    break
PY
}

update_cabinet() {
  echo "${CYAN}Обновляем кабинет...${RESET}"
  curl -fsSL "${UPDATE_URL}" | bash
}

edit_env() {
  local editor="${EDITOR:-}"
  if [[ -z "${editor}" ]]; then
    if command -v nano >/dev/null 2>&1; then
      editor="nano"
    else
      editor="vi"
    fi
  fi
  "${editor}" "${ENV_FILE}"
  echo "${YELLOW}После изменения .env выберите «Перезапустить сервисы».${RESET}"
}

show_status() {
  "${COMPOSE[@]}" ps
}

show_logs() {
  local service="${1:-app}"
  echo "${YELLOW}Для выхода из логов нажмите Ctrl+C.${RESET}"
  "${COMPOSE[@]}" logs -f --tail=200 "${service}" || true
}

restart_services() {
  "${COMPOSE[@]}" up -d --remove-orphans
  echo "${GREEN}Сервисы перезапущены.${RESET}"
  show_status
}

health_check() {
  local bind port app_url health_token
  bind="$(env_value CABINET_APP_BIND)"
  port="$(env_value CABINET_APP_PORT)"
  app_url="$(env_value APP_URL)"
  health_token="$(env_value HEALTHCHECK_TOKEN)"
  bind="${bind:-127.0.0.1}"
  port="${port:-3000}"

  if curl -fsS "http://${bind}:${port}/login" >/dev/null; then
    echo "${GREEN}Локальное приложение отвечает.${RESET}"
  else
    echo "${RED}Локальное приложение недоступно на ${bind}:${port}.${RESET}"
    return 1
  fi

  if [[ -n "${app_url}" && -n "${health_token}" ]]; then
    if curl -fsS -H "x-healthcheck-token: ${health_token}" "${app_url%/}/api/health" >/dev/null; then
      echo "${GREEN}Публичный healthcheck отвечает: ${app_url}${RESET}"
    else
      echo "${RED}Публичный healthcheck не отвечает: ${app_url}${RESET}"
      return 1
    fi
  fi
}

backup_database() {
  local output temporary
  mkdir -p "${BACKUP_DIR}"
  chmod 700 "${BACKUP_DIR}"
  output="${BACKUP_DIR}/cabinet-$(date -u +%Y%m%d-%H%M%S).sql.gz"
  temporary="${output}.tmp"
  if ! "${COMPOSE[@]}" exec -T db sh -lc 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip -9 >"${temporary}"; then
    rm -f "${temporary}"
    echo "${RED}Не удалось создать резервную копию.${RESET}"
    return 1
  fi
  mv "${temporary}" "${output}"
  chmod 600 "${output}"
  echo "${GREEN}Резервная копия создана:${RESET} ${output}"
}

full_backup() {
  if ! command -v remna-backup >/dev/null 2>&1; then
    echo "${RED}Команда remna-backup не установлена. Сначала обновите кабинет.${RESET}"
    return 1
  fi
  remna-backup backup
}

full_backup_menu() {
  if ! command -v remna-backup >/dev/null 2>&1; then
    echo "${RED}Команда remna-backup не установлена. Сначала обновите кабинет.${RESET}"
    return 1
  fi
  remna-backup
}

show_menu() {
  clear 2>/dev/null || true
  title
  printf '%s\n' "Установка: ${INSTALL_DIR}"
  printf '\n'
  printf '%s\n' \
    "  1. Обновить кабинет" \
    "  2. Редактировать .env" \
    "  3. Статус сервисов" \
    "  4. Логи приложения" \
    "  5. Логи worker" \
    "  6. Перезапустить сервисы" \
    "  7. Проверить доступность" \
    "  8. Создать резервную копию БД" \
    "  9. Полный бэкап сервера" \
    " 10. Меню переноса и восстановления" \
    "  0. Выход"
  printf '\nВыберите действие: ' >/dev/tty
}

run_menu() {
  if [[ ! -r /dev/tty ]]; then
    echo "Interactive menu requires a terminal. Use: cabinetctl help"
    exit 1
  fi
  while true; do
    show_menu
    IFS= read -r choice </dev/tty || exit 0
    printf '\n'
    case "${choice}" in
      1) update_cabinet; pause ;;
      2) edit_env; pause ;;
      3) show_status; pause ;;
      4) show_logs app; pause ;;
      5) show_logs worker; pause ;;
      6) restart_services; pause ;;
      7) health_check || true; pause ;;
      8) backup_database; pause ;;
      9) full_backup; pause ;;
      10) full_backup_menu; pause ;;
      0) exit 0 ;;
      *) echo "${RED}Неизвестный пункт.${RESET}"; pause ;;
    esac
  done
}

show_help() {
  cat <<'EOF'
Использование:
  cabinetctl             интерактивное меню
  cabinetctl update      обновить кабинет
  cabinetctl env         открыть .env
  cabinetctl status      показать контейнеры
  cabinetctl logs        логи приложения
  cabinetctl worker      логи worker
  cabinetctl restart     перезапустить сервисы
  cabinetctl health      проверить доступность
  cabinetctl backup      создать резервную копию БД
  cabinetctl backup-full полный бэкап Remnawave, Remnashop и кабинета
  cabinetctl transfer    меню бэкапа и восстановления
EOF
}

case "${1:-menu}" in
  menu) run_menu ;;
  update) update_cabinet ;;
  env) edit_env ;;
  status) show_status ;;
  logs) show_logs app ;;
  worker) show_logs worker ;;
  restart) restart_services ;;
  health) health_check ;;
  backup) backup_database ;;
  backup-full) full_backup ;;
  transfer) full_backup_menu ;;
  help|-h|--help) show_help ;;
  *) show_help; exit 1 ;;
esac

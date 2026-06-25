#!/usr/bin/env bash
set -euo pipefail

VERSION="1.0.0"
INSTALL_PATH="${FULL_BACKUP_INSTALL_PATH:-/usr/local/bin/remna-backup}"
BACKUP_DIR="${FULL_BACKUP_DIR:-/opt/remnawave-backups}"
REMNAWAVE_DIR="${REMNAWAVE_DIR:-/opt/remnawave}"
REMNASHOP_DIR="${REMNASHOP_DIR:-/opt/remnashop}"
CABINET_DIR="${CABINET_DIR:-/opt/remnawave-cabinet}"
REMNAWAVE_DB_CONTAINER="${REMNAWAVE_DB_CONTAINER:-remnawave-db}"
REMNASHOP_DB_CONTAINER="${REMNASHOP_DB_CONTAINER:-remnashop-db}"
CABINET_DB_CONTAINER="${CABINET_DB_CONTAINER:-remnawave-cabinet-db}"
REMNAWAVE_DB_SERVICE="${REMNAWAVE_DB_SERVICE:-remnawave-db}"
REMNASHOP_DB_SERVICE="${REMNASHOP_DB_SERVICE:-remnashop-db}"
CABINET_DB_SERVICE="${CABINET_DB_SERVICE:-db}"
LOCK_FILE="${FULL_BACKUP_LOCK_FILE:-/var/lock/remna-full-backup.lock}"
KEEP_DAYS="${FULL_BACKUP_KEEP_DAYS:-14}"
CLEANUP_PATHS=("")

cleanup_paths() {
  local path
  for path in "${CLEANUP_PATHS[@]}"; do
    [[ -n "${path}" ]] && rm -rf -- "${path}"
  done
  return 0
}
trap cleanup_paths EXIT

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

info() { printf '%s\n' "${CYAN}[INFO]${RESET} $*"; }
ok() { printf '%s\n' "${GREEN}[OK]${RESET} $*"; }
warn() { printf '%s\n' "${YELLOW}[WARN]${RESET} $*"; }
fail() { printf '%s\n' "${RED}[ERROR]${RESET} $*" >&2; exit 1; }

require_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    fail "Запустите скрипт через sudo или от root."
  fi
}

require_commands() {
  local command
  for command in tar gzip sha256sum awk sed grep find; do
    command -v "${command}" >/dev/null 2>&1 || fail "Не найдена команда: ${command}"
  done
}

require_docker() {
  command -v docker >/dev/null 2>&1 || fail "Не найден Docker."
  docker compose version >/dev/null 2>&1 || fail "Требуется Docker Compose plugin."
}

assert_safe_directory() {
  local directory="$1"
  [[ "${directory}" == /* ]] || fail "Ожидался абсолютный путь: ${directory}"
  [[ "${directory}" != "/" && "${directory}" != "/opt" && "${directory}" != "/root" ]] \
    || fail "Небезопасный путь для операции: ${directory}"
  [[ "${#directory}" -ge 8 ]] || fail "Слишком короткий путь для операции: ${directory}"
}

acquire_lock() {
  command -v flock >/dev/null 2>&1 || fail "Не найдена команда flock. Установите пакет util-linux."
  mkdir -p "$(dirname "${LOCK_FILE}")"
  exec 9>"${LOCK_FILE}"
  flock -n 9 || fail "Уже выполняется другая операция backup/restore."
}

container_env() {
  local container="$1"
  local key="$2"
  docker inspect "${container}" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
    | awk -F= -v key="${key}" '$1 == key { sub(/^[^=]*=/, ""); print; exit }'
}

container_running() {
  [[ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null || true)" == "true" ]]
}

find_compose_file() {
  local directory="$1"
  local candidate
  for candidate in docker-compose.yml docker-compose.yaml compose.yml compose.yaml; do
    if [[ -f "${directory}/${candidate}" ]]; then
      printf '%s\n' "${directory}/${candidate}"
      return 0
    fi
  done
  return 1
}

compose() {
  local directory="$1"
  shift
  local compose_file
  compose_file="$(find_compose_file "${directory}")" || return 1

  if [[ -f "${directory}/.env" ]]; then
    docker compose --env-file "${directory}/.env" -f "${compose_file}" "$@"
  elif [[ -f "${directory}/.env.production" ]]; then
    docker compose --env-file "${directory}/.env.production" -f "${compose_file}" "$@"
  else
    docker compose -f "${compose_file}" "$@"
  fi
}

archive_directory() {
  local source="$1"
  local output="$2"
  [[ -d "${source}" ]] || fail "Каталог не найден: ${source}"

  tar \
    --numeric-owner \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='backups' \
    --exclude='*.log' \
    --exclude='*.tmp' \
    -czf "${output}" \
    -C "$(dirname "${source}")" \
    "$(basename "${source}")"
}

dump_database() {
  local component="$1"
  local container="$2"
  local output="$3"
  local db_user db_name

  container_running "${container}" || fail "${component}: контейнер ${container} не запущен."
  db_user="$(container_env "${container}" POSTGRES_USER)"
  db_name="$(container_env "${container}" POSTGRES_DB)"
  [[ -n "${db_user}" ]] || db_user="postgres"
  [[ -n "${db_name}" ]] || db_name="${db_user}"

  info "${component}: создаём согласованный дамп ${db_name}..."
  if ! docker exec "${container}" pg_dump \
    -U "${db_user}" \
    -d "${db_name}" \
    --format=custom \
    --no-owner \
    --no-privileges >"${output}"; then
    rm -f "${output}"
    fail "${component}: не удалось создать дамп базы."
  fi

  [[ -s "${output}" ]] || fail "${component}: получен пустой дамп."
  docker exec -i "${container}" pg_restore --list <"${output}" >/dev/null \
    || fail "${component}: дамп не прошёл проверку pg_restore."
}

write_manifest() {
  local file="$1"
  cat >"${file}" <<EOF
FORMAT_VERSION=1
SCRIPT_VERSION=${VERSION}
CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
SOURCE_HOST=$(hostname)
REMNAWAVE_DIR=${REMNAWAVE_DIR}
REMNASHOP_DIR=${REMNASHOP_DIR}
CABINET_DIR=${CABINET_DIR}
REMNAWAVE_DB_CONTAINER=${REMNAWAVE_DB_CONTAINER}
REMNASHOP_DB_CONTAINER=${REMNASHOP_DB_CONTAINER}
CABINET_DB_CONTAINER=${CABINET_DB_CONTAINER}
EOF
}

create_backup() {
  require_root
  require_commands
  require_docker
  acquire_lock
  assert_safe_directory "${REMNAWAVE_DIR}"
  assert_safe_directory "${REMNASHOP_DIR}"
  assert_safe_directory "${CABINET_DIR}"

  local timestamp staging final temporary
  timestamp="$(date -u +%Y%m%d-%H%M%S)"
  staging="$(mktemp -d /tmp/remna-full-backup.XXXXXX)"
  final="${BACKUP_DIR}/remna-full-backup-${timestamp}.tar.gz"
  temporary="${final}.tmp"
  CLEANUP_PATHS+=("${staging}" "${temporary}")

  mkdir -p "${BACKUP_DIR}"
  chmod 700 "${BACKUP_DIR}"
  mkdir -p "${staging}/directories" "${staging}/databases"

  info "Архивируем конфигурацию Remnawave..."
  archive_directory "${REMNAWAVE_DIR}" "${staging}/directories/remnawave.tar.gz"
  info "Архивируем конфигурацию Remnashop..."
  archive_directory "${REMNASHOP_DIR}" "${staging}/directories/remnashop.tar.gz"
  info "Архивируем конфигурацию кабинета..."
  archive_directory "${CABINET_DIR}" "${staging}/directories/cabinet.tar.gz"

  dump_database "Remnawave" "${REMNAWAVE_DB_CONTAINER}" "${staging}/databases/remnawave.dump"
  dump_database "Remnashop" "${REMNASHOP_DB_CONTAINER}" "${staging}/databases/remnashop.dump"
  dump_database "Кабинет" "${CABINET_DB_CONTAINER}" "${staging}/databases/cabinet.dump"

  write_manifest "${staging}/manifest.env"
  (
    cd "${staging}"
    find directories databases -type f -print0 | sort -z | xargs -0 sha256sum >SHA256SUMS
    sha256sum -c SHA256SUMS >/dev/null
  )

  info "Собираем итоговый архив..."
  tar --numeric-owner -czf "${temporary}" -C "${staging}" manifest.env SHA256SUMS directories databases
  tar -tzf "${temporary}" >/dev/null || fail "Итоговый архив повреждён."
  mv "${temporary}" "${final}"
  chmod 600 "${final}"
  sha256sum "${final}" >"${final}.sha256"
  chmod 600 "${final}.sha256"

  find "${BACKUP_DIR}" -maxdepth 1 -type f \
    \( -name 'remna-full-backup-*.tar.gz' -o -name 'remna-full-backup-*.tar.gz.sha256' \) \
    -mtime "+${KEEP_DAYS}" -delete 2>/dev/null || true

  ok "Полный бэкап создан: ${final}"
  printf 'Размер: %s\n' "$(du -h "${final}" | awk '{print $1}')"
  printf 'SHA-256: %s\n' "$(awk '{print $1}' "${final}.sha256")"
}

verify_backup() {
  require_commands
  local archive="${1:-}"
  [[ -f "${archive}" ]] || fail "Укажите существующий архив."

  local staging
  staging="$(mktemp -d /tmp/remna-full-verify.XXXXXX)"
  CLEANUP_PATHS+=("${staging}")

  tar -xzf "${archive}" -C "${staging}"
  [[ -f "${staging}/manifest.env" ]] || fail "В архиве нет manifest.env."
  [[ -f "${staging}/SHA256SUMS" ]] || fail "В архиве нет SHA256SUMS."
  (
    cd "${staging}"
    sha256sum -c SHA256SUMS
  )
  ok "Архив прошёл проверку."
  sed -n '1,20p' "${staging}/manifest.env"
}

stop_component() {
  local directory="$1"
  if [[ -d "${directory}" ]] && find_compose_file "${directory}" >/dev/null; then
    compose "${directory}" down --remove-orphans || warn "Не удалось полностью остановить ${directory}."
  fi
}

restore_directory_archive() {
  local archive="$1"
  local target="$2"
  local extracted root
  extracted="$(mktemp -d /tmp/remna-dir-restore.XXXXXX)"
  tar -xzf "${archive}" -C "${extracted}"
  root="$(find "${extracted}" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  [[ -n "${root}" ]] || fail "В ${archive} не найден каталог."

  mkdir -p "$(dirname "${target}")"
  rm -rf "${target}"
  mkdir -p "${target}"
  cp -a "${root}/." "${target}/"
  rm -rf "${extracted}"
}

wait_for_database() {
  local container="$1"
  local attempts="${2:-90}"
  local db_user db_name

  for _ in $(seq 1 "${attempts}"); do
    if container_running "${container}"; then
      db_user="$(container_env "${container}" POSTGRES_USER)"
      db_name="$(container_env "${container}" POSTGRES_DB)"
      [[ -n "${db_user}" ]] || db_user="postgres"
      [[ -n "${db_name}" ]] || db_name="${db_user}"
      if docker exec "${container}" pg_isready -U "${db_user}" -d "${db_name}" >/dev/null 2>&1; then
        return 0
      fi
    fi
    sleep 2
  done
  fail "База ${container} не стала доступна вовремя."
}

restore_database() {
  local component="$1"
  local directory="$2"
  local service="$3"
  local container="$4"
  local dump="$5"
  local db_user db_name

  info "${component}: запускаем PostgreSQL..."
  compose "${directory}" up -d "${service}"
  wait_for_database "${container}"
  db_user="$(container_env "${container}" POSTGRES_USER)"
  db_name="$(container_env "${container}" POSTGRES_DB)"
  [[ -n "${db_user}" ]] || db_user="postgres"
  [[ -n "${db_name}" ]] || db_name="${db_user}"

  info "${component}: восстанавливаем ${db_name}..."
  docker exec -i "${container}" pg_restore \
    -U "${db_user}" \
    -d "${db_name}" \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges <"${dump}" || fail "${component}: восстановление базы завершилось ошибкой."
}

start_optional_nginx() {
  local nginx_dir="${REMNAWAVE_DIR}/nginx"
  if [[ -d "${nginx_dir}" ]] && find_compose_file "${nginx_dir}" >/dev/null; then
    info "Запускаем nginx Remnawave..."
    compose "${nginx_dir}" up -d
  fi
}

restore_backup() {
  require_root
  require_commands
  require_docker
  acquire_lock
  assert_safe_directory "${REMNAWAVE_DIR}"
  assert_safe_directory "${REMNASHOP_DIR}"
  assert_safe_directory "${CABINET_DIR}"

  local archive="${1:-}"
  [[ -f "${archive}" ]] || fail "Укажите существующий архив."
  if [[ "${RESTORE_CONFIRM:-}" != "RESTORE_REMNAWAVE_REMNASHOP_CABINET" ]]; then
    fail "Восстановление перезапишет три установки. Запустите с RESTORE_CONFIRM=RESTORE_REMNAWAVE_REMNASHOP_CABINET"
  fi

  local staging safety_dir
  staging="$(mktemp -d /tmp/remna-full-restore.XXXXXX)"
  safety_dir="/opt/remna-pre-restore-$(date -u +%Y%m%d-%H%M%S)"
  CLEANUP_PATHS+=("${staging}")

  info "Проверяем архив..."
  tar -xzf "${archive}" -C "${staging}"
  (
    cd "${staging}"
    sha256sum -c SHA256SUMS >/dev/null
  ) || fail "Контрольные суммы архива не совпали."

  for required in \
    directories/remnawave.tar.gz \
    directories/remnashop.tar.gz \
    directories/cabinet.tar.gz \
    databases/remnawave.dump \
    databases/remnashop.dump \
    databases/cabinet.dump
  do
    [[ -f "${staging}/${required}" ]] || fail "В архиве отсутствует ${required}."
  done

  info "Останавливаем текущие сервисы..."
  stop_component "${CABINET_DIR}"
  stop_component "${REMNASHOP_DIR}"
  if [[ -d "${REMNAWAVE_DIR}/nginx" ]]; then
    stop_component "${REMNAWAVE_DIR}/nginx"
  fi
  stop_component "${REMNAWAVE_DIR}"

  mkdir -p "${safety_dir}"
  for directory in "${REMNAWAVE_DIR}" "${REMNASHOP_DIR}" "${CABINET_DIR}"; do
    if [[ -d "${directory}" ]]; then
      mv "${directory}" "${safety_dir}/$(basename "${directory}")"
    fi
  done
  warn "Предыдущие каталоги сохранены в ${safety_dir}."

  restore_directory_archive "${staging}/directories/remnawave.tar.gz" "${REMNAWAVE_DIR}"
  restore_directory_archive "${staging}/directories/remnashop.tar.gz" "${REMNASHOP_DIR}"
  restore_directory_archive "${staging}/directories/cabinet.tar.gz" "${CABINET_DIR}"

  restore_database "Remnawave" "${REMNAWAVE_DIR}" "${REMNAWAVE_DB_SERVICE}" "${REMNAWAVE_DB_CONTAINER}" "${staging}/databases/remnawave.dump"
  compose "${REMNAWAVE_DIR}" up -d

  restore_database "Remnashop" "${REMNASHOP_DIR}" "${REMNASHOP_DB_SERVICE}" "${REMNASHOP_DB_CONTAINER}" "${staging}/databases/remnashop.dump"
  compose "${REMNASHOP_DIR}" up -d

  restore_database "Кабинет" "${CABINET_DIR}" "${CABINET_DB_SERVICE}" "${CABINET_DB_CONTAINER}" "${staging}/databases/cabinet.dump"
  compose "${CABINET_DIR}" up -d
  start_optional_nginx

  ok "Восстановление завершено."
  warn "Проверьте DNS, внешний IP, firewall и адреса узлов Remnawave."
  printf '%s\n' "Предыдущие файлы: ${safety_dir}"
}

install_script() {
  require_root
  install -m 755 "$0" "${INSTALL_PATH}"
  ok "Команда установлена: remna-backup"
}

list_backups() {
  mkdir -p "${BACKUP_DIR}"
  find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'remna-full-backup-*.tar.gz' \
    -printf '%TY-%Tm-%Td %TH:%TM  %10s  %p\n' 2>/dev/null | sort -r
}

show_menu() {
  if [[ ! -r /dev/tty ]]; then
    show_help
    exit 1
  fi
  while true; do
    clear 2>/dev/null || true
    printf '%s\n\n' "${BOLD}${CYAN}Remnawave Full Backup${RESET}"
    printf '%s\n' \
      "  1. Создать полный бэкап" \
      "  2. Показать бэкапы" \
      "  3. Проверить архив" \
      "  4. Восстановить архив" \
      "  0. Выход"
    printf '\nВыберите действие: ' >/dev/tty
    local choice archive
    IFS= read -r choice </dev/tty
    case "${choice}" in
      1) create_backup ;;
      2) list_backups ;;
      3)
        printf 'Путь к архиву: ' >/dev/tty
        IFS= read -r archive </dev/tty
        verify_backup "${archive}"
        ;;
      4)
        printf 'Путь к архиву: ' >/dev/tty
        IFS= read -r archive </dev/tty
        printf 'Введите RESTORE для продолжения: ' >/dev/tty
        IFS= read -r choice </dev/tty
        if [[ "${choice}" == "RESTORE" ]]; then
          RESTORE_CONFIRM=RESTORE_REMNAWAVE_REMNASHOP_CABINET restore_backup "${archive}"
        else
          warn "Восстановление отменено."
        fi
        ;;
      0) exit 0 ;;
      *) warn "Неизвестный пункт." ;;
    esac
    printf '\nНажмите Enter...' >/dev/tty
    IFS= read -r _ </dev/tty || true
  done
}

show_help() {
  cat <<EOF
Remnawave Full Backup ${VERSION}

Использование:
  remna-backup                       интерактивное меню
  remna-backup backup                полный бэкап трёх систем
  remna-backup list                  список архивов
  remna-backup verify ARCHIVE        проверка архива
  RESTORE_CONFIRM=RESTORE_REMNAWAVE_REMNASHOP_CABINET \\
    remna-backup restore ARCHIVE     полное восстановление
  remna-backup install               установить команду в ${INSTALL_PATH}

Переменные:
  FULL_BACKUP_DIR=${BACKUP_DIR}
  FULL_BACKUP_KEEP_DAYS=${KEEP_DAYS}
  REMNAWAVE_DIR=${REMNAWAVE_DIR}
  REMNASHOP_DIR=${REMNASHOP_DIR}
  CABINET_DIR=${CABINET_DIR}
EOF
}

case "${1:-menu}" in
  menu) show_menu ;;
  backup) create_backup ;;
  list) list_backups ;;
  verify) verify_backup "${2:-}" ;;
  restore) restore_backup "${2:-}" ;;
  install) install_script ;;
  help|-h|--help) show_help ;;
  *) show_help; exit 1 ;;
esac

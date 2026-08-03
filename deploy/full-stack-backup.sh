#!/usr/bin/env bash
set -euo pipefail

VERSION="1.4.0"
INSTALL_PATH="${FULL_BACKUP_INSTALL_PATH:-/usr/local/bin/remna-backup}"
BACKUP_DIR="${FULL_BACKUP_DIR:-/opt/remnawave-backups}"
S3_CONFIG_FILE="${FULL_BACKUP_S3_CONFIG:-/etc/remna-backup-s3.conf}"
SCHEDULE_CONFIG_FILE="${FULL_BACKUP_SCHEDULE_CONFIG:-/etc/remna-backup-schedule.conf}"
SCHEDULE_SERVICE_NAME="remna-backup.service"
SCHEDULE_TIMER_NAME="remna-backup.timer"
SCHEDULE_SERVICE_FILE="${FULL_BACKUP_SYSTEMD_DIR:-/etc/systemd/system}/${SCHEDULE_SERVICE_NAME}"
SCHEDULE_TIMER_FILE="${FULL_BACKUP_SYSTEMD_DIR:-/etc/systemd/system}/${SCHEDULE_TIMER_NAME}"
REMNAWAVE_DIR="${REMNAWAVE_DIR:-/opt/remnawave}"
REMNAWAVE_SUBSCRIPTION_DIR="${REMNAWAVE_SUBSCRIPTION_DIR:-${REMNAWAVE_DIR}/subscription}"
REMNASHOP_DIR="${REMNASHOP_DIR:-/opt/remnashop}"
CABINET_DIR="${CABINET_DIR:-/opt/remnawave-cabinet}"
CABINET_ENV_FILE="${CABINET_ENV_FILE:-${CABINET_DIR}/.env}"
REMNAWAVE_DB_CONTAINER="${REMNAWAVE_DB_CONTAINER:-remnawave-db}"
REMNASHOP_DB_CONTAINER="${REMNASHOP_DB_CONTAINER:-remnashop-db}"
CABINET_DB_CONTAINER="${CABINET_DB_CONTAINER:-remnawave-cabinet-db}"
REMNAWAVE_DB_SERVICE="${REMNAWAVE_DB_SERVICE:-remnawave-db}"
REMNASHOP_DB_SERVICE="${REMNASHOP_DB_SERVICE:-remnashop-db}"
CABINET_DB_SERVICE="${CABINET_DB_SERVICE:-db}"
LOCK_FILE="${FULL_BACKUP_LOCK_FILE:-/var/lock/remna-full-backup.lock}"
MAX_AGE_HOURS="${FULL_BACKUP_MAX_AGE_HOURS:-48}"
CLEANUP_PATHS=("")

S3_ENDPOINT=""
S3_REGION="us-east-1"
S3_BUCKET=""
S3_PREFIX="remnawave"
S3_ACCESS_KEY=""
S3_SECRET_KEY=""
S3_AUTO_UPLOAD="false"

SCHEDULE_KIND="DAILY"
SCHEDULE_TIME="03:00"
SCHEDULE_WEEKDAY="Sun"
SCHEDULE_KEEP_DAYS="14"
SCHEDULE_TELEGRAM_NOTIFY="true"

if [[ -f "${S3_CONFIG_FILE}" ]]; then
  # The file is created root-only by this script and contains shell-escaped values.
  # shellcheck disable=SC1090
  source "${S3_CONFIG_FILE}"
fi

if [[ -f "${SCHEDULE_CONFIG_FILE}" ]]; then
  # The file is created root-only by this script and contains validated values.
  # shellcheck disable=SC1090
  source "${SCHEDULE_CONFIG_FILE}"
fi

KEEP_DAYS="${FULL_BACKUP_KEEP_DAYS:-${SCHEDULE_KEEP_DAYS:-14}}"

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
  for command in tar gzip sha256sum awk sed grep find python3; do
    command -v "${command}" >/dev/null 2>&1 || fail "Не найдена команда: ${command}"
  done
}

require_tty() {
  [[ -r /dev/tty ]] || fail "Для этого действия нужен интерактивный терминал."
}

is_truthy() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|y|Y) return 0 ;;
    *) return 1 ;;
  esac
}

cabinet_env_value() {
  local key="$1"
  [[ -f "${CABINET_ENV_FILE}" ]] || return 0
  awk -F= -v key="${key}" '
    $1 == key {
      sub(/^[^=]*=/, "")
      gsub(/^"|"$/, "")
      gsub(/^\047|\047$/, "")
      print
      exit
    }
  ' "${CABINET_ENV_FILE}" 2>/dev/null || true
}

telegram_backup_configured() {
  [[ -n "$(cabinet_env_value TELEGRAM_BOT_TOKEN)" \
    && -n "$(cabinet_env_value TELEGRAM_NOTIFY_CHAT_ID)" ]]
}

next_backup_run() {
  local next=""
  if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then
    next="$(systemctl show "${SCHEDULE_TIMER_NAME}" \
      --property=NextElapseUSecRealtime --value 2>/dev/null || true)"
  fi
  printf '%s\n' "${next:-по расписанию}"
}

send_telegram_backup_notification() {
  local message="$1"
  is_truthy "${SCHEDULE_TELEGRAM_NOTIFY}" || return 0

  local bot_token chat_id
  bot_token="$(cabinet_env_value TELEGRAM_BOT_TOKEN)"
  chat_id="$(cabinet_env_value TELEGRAM_NOTIFY_CHAT_ID)"
  if [[ -z "${bot_token}" || -z "${chat_id}" ]]; then
    warn "Telegram-уведомление пропущено: заполните TELEGRAM_BOT_TOKEN и TELEGRAM_NOTIFY_CHAT_ID в ${CABINET_ENV_FILE}."
    return 1
  fi
  if ! command -v curl >/dev/null 2>&1; then
    warn "Telegram-уведомление пропущено: не найден curl."
    return 1
  fi

  local response_file http_code description
  response_file="$(mktemp /tmp/remna-backup-telegram.XXXXXX)"
  CLEANUP_PATHS+=("${response_file}")
  if ! http_code="$(curl -sS --max-time 10 \
    -X POST "https://api.telegram.org/bot${bot_token}/sendMessage" \
    --data-urlencode "chat_id=${chat_id}" \
    --data-urlencode "text=${message}" \
    --data "disable_web_page_preview=true" \
    --output "${response_file}" \
    --write-out '%{http_code}')"; then
    warn "Telegram недоступен: ошибка сети или таймаут."
    return 1
  fi

  if [[ "${http_code}" == "200" ]] && grep -q '"ok"[[:space:]]*:[[:space:]]*true' "${response_file}"; then
    ok "Уведомление о бэкапе отправлено в Telegram."
  else
    description="$(python3 -c '
import json
import sys
try:
    payload = json.load(open(sys.argv[1], encoding="utf-8"))
    print(payload.get("description", ""))
except Exception:
    pass
' "${response_file}" 2>/dev/null || true)"
    warn "Telegram отклонил уведомление: ${description:-HTTP ${http_code}}"
    return 1
  fi
  return 0
}

backup_s3_result() {
  if s3_configured && is_truthy "${S3_AUTO_UPLOAD}"; then
    printf 'архив загружен\n'
  elif s3_configured; then
    printf 'автоотправка выключена\n'
  else
    printf 'не настроен\n'
  fi
}

notify_backup_success() {
  local archive="$1"
  local duration="$2"
  local size checksum
  size="$(du -h "${archive}" 2>/dev/null | awk '{print $1}')"
  checksum="$(awk '{print $1}' "${archive}.sha256" 2>/dev/null || true)"
  send_telegram_backup_notification "Бэкап создан

Сервер: $(hostname)
Архив: $(basename "${archive}")
Размер: ${size:-неизвестно}
SHA-256: ${checksum:-неизвестно}
S3: $(backup_s3_result)
Выполнено за: ${duration} сек.
Следующий запуск: $(next_backup_run)
Время: $(date -u '+%d.%m.%Y %H:%M UTC')" || true
}

notify_backup_failure() {
  local status="$1"
  local duration="$2"
  local log_file="$3"
  local archive="${4:-}"
  local details archive_status
  details="$(tail -n 12 "${log_file}" 2>/dev/null | cut -c 1-240 || true)"
  archive_status="не создан"
  [[ -n "${archive}" ]] && archive_status="$(basename "${archive}") сохранён локально"
  send_telegram_backup_notification "Бэкап завершился с ошибкой

Сервер: $(hostname)
Код завершения: ${status}
Локальный архив: ${archive_status}
Прошло: ${duration} сек.
Время: $(date -u '+%d.%m.%Y %H:%M UTC')

Последние сообщения:
${details:-Диагностика отсутствует}

Логи: cabinetctl backups -> Автоматический бэкап -> Показать логи" || true
}

test_telegram_backup_notification() {
  require_root
  is_truthy "${SCHEDULE_TELEGRAM_NOTIFY}" \
    || fail "Telegram-уведомления выключены в настройках автоматического бэкапа."
  telegram_backup_configured \
    || fail "Заполните TELEGRAM_BOT_TOKEN и TELEGRAM_NOTIFY_CHAT_ID в ${CABINET_ENV_FILE}."
  send_telegram_backup_notification "Проверка уведомлений о бэкапах

Сервер: $(hostname)
Статус: подключение работает
Время: $(date -u '+%d.%m.%Y %H:%M UTC')" \
    || fail "Telegram отклонил тестовое уведомление. Проверьте chat ID и доступ бота к чату."
}

run_backup_with_notifications() {
  require_root
  local started log_file script_path status duration archive previous_archive
  started="$(date +%s)"
  previous_archive="$(latest_local_backup || true)"
  log_file="$(mktemp /tmp/remna-backup-run.XXXXXX)"
  CLEANUP_PATHS+=("${log_file}")
  script_path="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"

  set +e
  bash "${script_path}" backup-create 2>&1 | tee "${log_file}"
  status="${PIPESTATUS[0]}"
  set -e
  duration="$(( $(date +%s) - started ))"

  if [[ "${status}" == "0" ]]; then
    archive="$(latest_local_backup || true)"
    if [[ -n "${archive}" ]]; then
      notify_backup_success "${archive}" "${duration}"
    else
      notify_backup_failure "1" "${duration}" "${log_file}"
      fail "Бэкап завершился без итогового архива."
    fi
    return 0
  fi

  archive="$(latest_local_backup || true)"
  [[ "${archive}" == "${previous_archive}" ]] && archive=""
  notify_backup_failure "${status}" "${duration}" "${log_file}" "${archive}"
  return "${status}"
}

ensure_aws_cli() {
  if command -v aws >/dev/null 2>&1; then
    return
  fi
  info "Устанавливаем AWS CLI для работы с S3..."
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update >/dev/null
    DEBIAN_FRONTEND=noninteractive apt-get install -y awscli >/dev/null 2>&1 || true
  fi
  if command -v aws >/dev/null 2>&1; then
    return
  fi

  command -v curl >/dev/null 2>&1 || fail "Для установки AWS CLI требуется curl."
  command -v unzip >/dev/null 2>&1 || {
    command -v apt-get >/dev/null 2>&1 || fail "Для установки AWS CLI требуется unzip."
    DEBIAN_FRONTEND=noninteractive apt-get install -y unzip >/dev/null
  }
  local architecture package temporary
  architecture="$(uname -m)"
  case "${architecture}" in
    x86_64|amd64) package="awscli-exe-linux-x86_64.zip" ;;
    aarch64|arm64) package="awscli-exe-linux-aarch64.zip" ;;
    *) fail "AWS CLI не поддерживает архитектуру ${architecture} в автоматическом установщике." ;;
  esac
  temporary="$(mktemp -d /tmp/awscli.XXXXXX)"
  CLEANUP_PATHS+=("${temporary}")
  curl -fsSL "https://awscli.amazonaws.com/${package}" -o "${temporary}/awscliv2.zip"
  unzip -q "${temporary}/awscliv2.zip" -d "${temporary}"
  "${temporary}/aws/install" --update >/dev/null
  command -v aws >/dev/null 2>&1 || fail "Не удалось установить AWS CLI."
}

s3_configured() {
  [[ -n "${S3_BUCKET}" && -n "${S3_ACCESS_KEY}" && -n "${S3_SECRET_KEY}" ]]
}

s3_uri() {
  local suffix="${1:-}"
  local prefix="${S3_PREFIX#/}"
  prefix="${prefix%/}"
  if [[ -n "${prefix}" ]]; then
    printf 's3://%s/%s%s\n' "${S3_BUCKET}" "${prefix}" "${suffix}"
  else
    printf 's3://%s%s\n' "${S3_BUCKET}" "${suffix}"
  fi
}

aws_s3() {
  ensure_aws_cli
  s3_configured || fail "S3 ещё не настроен."
  local -a command=(aws)
  if [[ -n "${S3_ENDPOINT}" ]]; then
    command+=(--endpoint-url "${S3_ENDPOINT}")
  fi
  AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY}" \
  AWS_SECRET_ACCESS_KEY="${S3_SECRET_KEY}" \
  AWS_DEFAULT_REGION="${S3_REGION}" \
    "${command[@]}" "$@"
}

write_s3_config() {
  require_root
  mkdir -p "$(dirname "${S3_CONFIG_FILE}")"
  umask 077
  {
    printf 'S3_ENDPOINT=%q\n' "${S3_ENDPOINT}"
    printf 'S3_REGION=%q\n' "${S3_REGION}"
    printf 'S3_BUCKET=%q\n' "${S3_BUCKET}"
    printf 'S3_PREFIX=%q\n' "${S3_PREFIX}"
    printf 'S3_ACCESS_KEY=%q\n' "${S3_ACCESS_KEY}"
    printf 'S3_SECRET_KEY=%q\n' "${S3_SECRET_KEY}"
    printf 'S3_AUTO_UPLOAD=%q\n' "${S3_AUTO_UPLOAD}"
  } >"${S3_CONFIG_FILE}"
  chmod 600 "${S3_CONFIG_FILE}"
}

configure_s3() {
  require_tty
  local value
  printf 'S3 endpoint (пусто для AWS): ' >/dev/tty
  IFS= read -r value </dev/tty
  S3_ENDPOINT="${value:-${S3_ENDPOINT}}"
  printf 'Регион [%s]: ' "${S3_REGION}" >/dev/tty
  IFS= read -r value </dev/tty
  S3_REGION="${value:-${S3_REGION}}"
  printf 'Bucket [%s]: ' "${S3_BUCKET}" >/dev/tty
  IFS= read -r value </dev/tty
  S3_BUCKET="${value:-${S3_BUCKET}}"
  printf 'Папка в bucket [%s]: ' "${S3_PREFIX}" >/dev/tty
  IFS= read -r value </dev/tty
  S3_PREFIX="${value:-${S3_PREFIX}}"
  printf 'Access key%s: ' "$([[ -n "${S3_ACCESS_KEY}" ]] && printf ' (Enter — оставить текущий)')" >/dev/tty
  IFS= read -r value </dev/tty
  S3_ACCESS_KEY="${value:-${S3_ACCESS_KEY}}"
  printf 'Secret key%s: ' "$([[ -n "${S3_SECRET_KEY}" ]] && printf ' (Enter — оставить текущий)')" >/dev/tty
  IFS= read -r -s value </dev/tty
  printf '\n' >/dev/tty
  S3_SECRET_KEY="${value:-${S3_SECRET_KEY}}"
  printf 'Автоматически загружать новые бэкапы? [y/N]: ' >/dev/tty
  IFS= read -r value </dev/tty
  if [[ "${value}" =~ ^[yYдД]$ ]]; then S3_AUTO_UPLOAD="true"; else S3_AUTO_UPLOAD="false"; fi
  s3_configured || fail "Bucket, access key и secret key обязательны."
  write_s3_config
  aws_s3 s3 ls "$(s3_uri)/" >/dev/null
  ok "S3 настроен и доступ проверен."
}

upload_backup_to_s3() {
  local archive="$1"
  s3_configured || fail "Сначала настройте S3."
  local destination
  destination="$(s3_uri "/$(basename "${archive}")")"
  info "Загружаем $(basename "${archive}") в S3..."
  aws_s3 s3 cp "${archive}" "${destination}" --only-show-errors
  if [[ -f "${archive}.sha256" ]]; then
    aws_s3 s3 cp "${archive}.sha256" "${destination}.sha256" --only-show-errors
  fi
  ok "Бэкап сохранён в ${destination}"
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
REMNAWAVE_SUBSCRIPTION_DIR=${REMNAWAVE_SUBSCRIPTION_DIR}
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
  if s3_configured && is_truthy "${S3_AUTO_UPLOAD}"; then
    upload_backup_to_s3 "${final}"
  fi
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

restore_remnashop_integration_access() {
  local env_file="${CABINET_DIR}/.env"
  local database_url db_user db_name role password role_exists password_literal db_name_identifier
  local function_exists
  local -a credentials=()

  [[ -f "${env_file}" ]] || {
    warn "Кабинет: .env не найден, доступ к Remnashop нужно будет восстановить вручную."
    return
  }
  database_url="$(awk -F= '$1 == "REMNASHOP_DATABASE_URL" { sub(/^[^=]*=/, ""); gsub(/^\"|\"$/, ""); print; exit }' "${env_file}")"
  [[ -n "${database_url}" ]] || return

  mapfile -t credentials < <(python3 - "${database_url}" <<'PY'
from urllib.parse import unquote, urlparse
import re
import sys

try:
    parsed = urlparse(sys.argv[1])
    role = unquote(parsed.username or "")
    password = unquote(parsed.password or "")
except Exception:
    role = password = ""
print(role if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", role) else "")
print(password)
PY
)
  role="${credentials[0]:-}"
  password="${credentials[1]:-}"
  if [[ -z "${role}" || -z "${password}" ]]; then
    warn "Кабинет: не удалось прочитать роль Remnashop из REMNASHOP_DATABASE_URL."
    return
  fi

  db_user="$(container_env "${REMNASHOP_DB_CONTAINER}" POSTGRES_USER)"
  db_name="$(container_env "${REMNASHOP_DB_CONTAINER}" POSTGRES_DB)"
  [[ -n "${db_user}" ]] || db_user="postgres"
  [[ -n "${db_name}" ]] || db_name="${db_user}"
  role_exists="$(docker exec "${REMNASHOP_DB_CONTAINER}" psql -U "${db_user}" -d "${db_name}" -tAc "SELECT 1 FROM pg_roles WHERE rolname = '${role}';" 2>/dev/null | tr -d '[:space:]')"
  password_literal="$(python3 - "${password}" <<'PY'
import sys

print("'" + sys.argv[1].replace("'", "''") + "'")
PY
)"
  if [[ "${role_exists}" == "1" ]]; then
    docker exec "${REMNASHOP_DB_CONTAINER}" psql -v ON_ERROR_STOP=1 -U "${db_user}" -d "${db_name}" \
      -c "ALTER ROLE \"${role}\" WITH LOGIN PASSWORD ${password_literal};" >/dev/null
  else
    docker exec "${REMNASHOP_DB_CONTAINER}" psql -v ON_ERROR_STOP=1 -U "${db_user}" -d "${db_name}" \
      -c "CREATE ROLE \"${role}\" WITH LOGIN PASSWORD ${password_literal};" >/dev/null
  fi
  db_name_identifier="$(python3 - "${db_name}" <<'PY'
import sys

print('"' + sys.argv[1].replace('"', '""') + '"')
PY
)"
  docker exec "${REMNASHOP_DB_CONTAINER}" psql -v ON_ERROR_STOP=1 -U "${db_user}" -d "${db_name}" \
    -c "GRANT CONNECT ON DATABASE ${db_name_identifier} TO \"${role}\";" \
    -c "GRANT USAGE ON SCHEMA public TO \"${role}\";" \
    -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO \"${role}\";" \
    -c "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO \"${role}\";" \
    -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO \"${role}\";" \
    -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO \"${role}\";" >/dev/null
  function_exists="$(docker exec "${REMNASHOP_DB_CONTAINER}" psql -U "${db_user}" -d "${db_name}" -tAc "SELECT to_regprocedure('public.cabinet_link_email_to_telegram(bigint,text,boolean)') IS NOT NULL;" 2>/dev/null | tr -d '[:space:]')"
  if [[ "${function_exists}" == "t" ]]; then
    docker exec "${REMNASHOP_DB_CONTAINER}" psql -v ON_ERROR_STOP=1 -U "${db_user}" -d "${db_name}" \
      -c "GRANT EXECUTE ON FUNCTION public.cabinet_link_email_to_telegram(bigint, text, boolean) TO \"${role}\";" >/dev/null
  fi
  ok "Доступ кабинета к Remnashop восстановлен."
}

start_optional_nginx() {
  local nginx_dir="${REMNAWAVE_DIR}/nginx"
  if [[ -d "${nginx_dir}" ]] && find_compose_file "${nginx_dir}" >/dev/null; then
    info "Запускаем nginx Remnawave..."
    compose "${nginx_dir}" up -d
  fi
}

start_optional_remnawave_subscription() {
  if [[ -d "${REMNAWAVE_SUBSCRIPTION_DIR}" ]] \
    && find_compose_file "${REMNAWAVE_SUBSCRIPTION_DIR}" >/dev/null; then
    info "Запускаем страницу подписки Remnawave..."
    compose "${REMNAWAVE_SUBSCRIPTION_DIR}" up -d
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
  if [[ -d "${REMNAWAVE_SUBSCRIPTION_DIR}" ]]; then
    stop_component "${REMNAWAVE_SUBSCRIPTION_DIR}"
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
  start_optional_remnawave_subscription

  restore_database "Remnashop" "${REMNASHOP_DIR}" "${REMNASHOP_DB_SERVICE}" "${REMNASHOP_DB_CONTAINER}" "${staging}/databases/remnashop.dump"
  restore_remnashop_integration_access
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
  local archive
  while IFS= read -r archive; do
    [[ -n "${archive}" ]] || continue
    printf '%-36s %8s  %s\n' "$(basename "${archive}")" "$(du -h "${archive}" | awk '{print $1}')" "${archive}"
  done < <(local_backup_paths)
  return 0
}

local_backup_paths() {
  find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'remna-full-backup-*.tar.gz' \
    -print 2>/dev/null | sort -r
  return 0
}

latest_local_backup() {
  local_backup_paths | head -n 1
}

backup_age_hours() {
  local archive="$1"
  local modified now
  modified="$(stat -c '%Y' "${archive}" 2>/dev/null || printf '0')"
  now="$(date +%s)"
  printf '%s\n' $(((now - modified) / 3600))
}

require_systemd() {
  command -v systemctl >/dev/null 2>&1 || fail "На сервере не найден systemd. Автоматическое расписание недоступно."
  [[ -d /run/systemd/system ]] || fail "systemd не запущен. Автоматическое расписание недоступно."
}

server_timezone() {
  local timezone=""
  if command -v timedatectl >/dev/null 2>&1; then
    timezone="$(timedatectl show --property=Timezone --value 2>/dev/null || true)"
  fi
  printf '%s\n' "${timezone:-$(date +%Z)}"
}

valid_schedule_time() {
  [[ "${1:-}" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]]
}

valid_keep_days() {
  [[ "${1:-}" =~ ^[0-9]{1,4}$ ]] || return 1
  local days=$((10#${1}))
  ((days >= 1 && days <= 3650))
}

schedule_calendar() {
  valid_schedule_time "${SCHEDULE_TIME}" || fail "В расписании указано неверное время: ${SCHEDULE_TIME}"
  case "${SCHEDULE_KIND}" in
    DAILY) printf '*-*-* %s:00\n' "${SCHEDULE_TIME}" ;;
    WEEKDAYS) printf 'Mon..Fri *-*-* %s:00\n' "${SCHEDULE_TIME}" ;;
    WEEKLY)
      case "${SCHEDULE_WEEKDAY}" in
        Mon|Tue|Wed|Thu|Fri|Sat|Sun) ;;
        *) fail "В расписании указан неверный день недели: ${SCHEDULE_WEEKDAY}" ;;
      esac
      printf '%s *-*-* %s:00\n' "${SCHEDULE_WEEKDAY}" "${SCHEDULE_TIME}"
      ;;
    *) fail "Неизвестный режим расписания: ${SCHEDULE_KIND}" ;;
  esac
}

schedule_description() {
  local day
  case "${SCHEDULE_WEEKDAY}" in
    Mon) day="понедельник" ;;
    Tue) day="вторник" ;;
    Wed) day="среда" ;;
    Thu) day="четверг" ;;
    Fri) day="пятница" ;;
    Sat) day="суббота" ;;
    Sun) day="воскресенье" ;;
    *) day="${SCHEDULE_WEEKDAY}" ;;
  esac
  case "${SCHEDULE_KIND}" in
    DAILY) printf 'ежедневно в %s\n' "${SCHEDULE_TIME}" ;;
    WEEKDAYS) printf 'по рабочим дням в %s\n' "${SCHEDULE_TIME}" ;;
    WEEKLY) printf 'еженедельно, %s в %s\n' "${day}" "${SCHEDULE_TIME}" ;;
    *) printf 'неизвестное расписание\n' ;;
  esac
}

write_schedule_config() {
  require_root
  valid_schedule_time "${SCHEDULE_TIME}" || fail "Время должно быть в формате ЧЧ:ММ."
  valid_keep_days "${SCHEDULE_KEEP_DAYS}" || fail "Срок хранения должен быть от 1 до 3650 дней."
  schedule_calendar >/dev/null
  mkdir -p "$(dirname "${SCHEDULE_CONFIG_FILE}")"
  umask 077
  {
    printf 'SCHEDULE_KIND=%q\n' "${SCHEDULE_KIND}"
    printf 'SCHEDULE_TIME=%q\n' "${SCHEDULE_TIME}"
    printf 'SCHEDULE_WEEKDAY=%q\n' "${SCHEDULE_WEEKDAY}"
    printf 'SCHEDULE_KEEP_DAYS=%q\n' "${SCHEDULE_KEEP_DAYS}"
    printf 'SCHEDULE_TELEGRAM_NOTIFY=%q\n' "${SCHEDULE_TELEGRAM_NOTIFY}"
  } >"${SCHEDULE_CONFIG_FILE}"
  chmod 600 "${SCHEDULE_CONFIG_FILE}"
  KEEP_DAYS="${FULL_BACKUP_KEEP_DAYS:-${SCHEDULE_KEEP_DAYS}}"
}

install_schedule_units() {
  require_root
  require_systemd
  [[ "${INSTALL_PATH}" =~ ^/[A-Za-z0-9_./-]+$ ]] || fail "Небезопасный путь команды бэкапа: ${INSTALL_PATH}"
  [[ -x "${INSTALL_PATH}" ]] || install_script

  local calendar service_tmp timer_tmp
  calendar="$(schedule_calendar)"
  if command -v systemd-analyze >/dev/null 2>&1; then
    systemd-analyze calendar "${calendar}" >/dev/null \
      || fail "systemd не принял расписание: ${calendar}"
  fi
  service_tmp="$(mktemp /tmp/remna-backup-service.XXXXXX)"
  timer_tmp="$(mktemp /tmp/remna-backup-timer.XXXXXX)"
  CLEANUP_PATHS+=("${service_tmp}" "${timer_tmp}")

  cat >"${service_tmp}" <<EOF
[Unit]
Description=Remnawave full stack backup
Wants=docker.service
After=docker.service
ConditionPathIsExecutable=${INSTALL_PATH}

[Service]
Type=oneshot
ExecStart=${INSTALL_PATH} backup
TimeoutStartSec=infinity
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=7
UMask=0077
EOF

  cat >"${timer_tmp}" <<EOF
[Unit]
Description=Schedule Remnawave full stack backup

[Timer]
OnCalendar=${calendar}
Persistent=true
AccuracySec=1min
Unit=${SCHEDULE_SERVICE_NAME}

[Install]
WantedBy=timers.target
EOF

  install -m 644 "${service_tmp}" "${SCHEDULE_SERVICE_FILE}"
  install -m 644 "${timer_tmp}" "${SCHEDULE_TIMER_FILE}"
  systemctl daemon-reload
  systemctl enable "${SCHEDULE_TIMER_NAME}" >/dev/null
  systemctl restart "${SCHEDULE_TIMER_NAME}"
}

set_schedule_upload() {
  local enabled="$1"
  if [[ "${enabled}" == "true" ]]; then
    if ! s3_configured; then
      local configure
      printf 'S3 не настроен. Настроить сейчас? [Y/n]: ' >/dev/tty
      IFS= read -r configure </dev/tty
      if [[ "${configure}" =~ ^[nNнН]$ ]]; then
        fail "Без настройки S3 автоматическая отправка невозможна."
      fi
      configure_s3
    fi
    S3_AUTO_UPLOAD="true"
    write_s3_config
  elif [[ -f "${S3_CONFIG_FILE}" ]]; then
    S3_AUTO_UPLOAD="false"
    write_s3_config
  fi
}

configure_schedule() {
  require_root
  require_tty
  require_systemd

  local choice value upload_default upload_value telegram_default telegram_value
  printf '\nРасписание создаётся по часовому поясу сервера: %s\n' "$(server_timezone)" >/dev/tty
  printf '%s\n' \
    "  1. Каждый день" \
    "  2. По рабочим дням" \
    "  3. Один раз в неделю" >/dev/tty
  printf 'Периодичность [%s]: ' "$(case "${SCHEDULE_KIND}" in DAILY) printf 1;; WEEKDAYS) printf 2;; WEEKLY) printf 3;; esac)" >/dev/tty
  IFS= read -r choice </dev/tty
  case "${choice:-}" in
    "") ;;
    1) SCHEDULE_KIND="DAILY" ;;
    2) SCHEDULE_KIND="WEEKDAYS" ;;
    3) SCHEDULE_KIND="WEEKLY" ;;
    *) fail "Неизвестная периодичность." ;;
  esac

  if [[ "${SCHEDULE_KIND}" == "WEEKLY" ]]; then
    printf '%s\n' \
      "  1. Понедельник" "  2. Вторник" "  3. Среда" "  4. Четверг" \
      "  5. Пятница" "  6. Суббота" "  7. Воскресенье" >/dev/tty
    printf 'День недели [%s]: ' "${SCHEDULE_WEEKDAY}" >/dev/tty
    IFS= read -r value </dev/tty
    case "${value:-}" in
      "") ;;
      1) SCHEDULE_WEEKDAY="Mon" ;;
      2) SCHEDULE_WEEKDAY="Tue" ;;
      3) SCHEDULE_WEEKDAY="Wed" ;;
      4) SCHEDULE_WEEKDAY="Thu" ;;
      5) SCHEDULE_WEEKDAY="Fri" ;;
      6) SCHEDULE_WEEKDAY="Sat" ;;
      7) SCHEDULE_WEEKDAY="Sun" ;;
      *) fail "Неизвестный день недели." ;;
    esac
  fi

  printf 'Время запуска ЧЧ:ММ [%s]: ' "${SCHEDULE_TIME}" >/dev/tty
  IFS= read -r value </dev/tty
  SCHEDULE_TIME="${value:-${SCHEDULE_TIME}}"
  valid_schedule_time "${SCHEDULE_TIME}" || fail "Введите время от 00:00 до 23:59."

  printf 'Хранить локальные архивы, дней [%s]: ' "${SCHEDULE_KEEP_DAYS}" >/dev/tty
  IFS= read -r value </dev/tty
  SCHEDULE_KEEP_DAYS="${value:-${SCHEDULE_KEEP_DAYS}}"
  valid_keep_days "${SCHEDULE_KEEP_DAYS}" || fail "Введите число от 1 до 3650."

  upload_default="y/N"
  is_truthy "${S3_AUTO_UPLOAD}" && upload_default="Y/n"
  printf 'Сразу отправлять новый архив в S3? [%s]: ' "${upload_default}" >/dev/tty
  IFS= read -r upload_value </dev/tty
  if [[ -z "${upload_value}" ]]; then
    if is_truthy "${S3_AUTO_UPLOAD}"; then upload_value="true"; else upload_value="false"; fi
  elif [[ "${upload_value}" =~ ^[yYдД]$ ]]; then
    upload_value="true"
  elif [[ "${upload_value}" =~ ^[nNнН]$ ]]; then
    upload_value="false"
  else
    fail "Ответьте y или n."
  fi

  telegram_default="Y/n"
  is_truthy "${SCHEDULE_TELEGRAM_NOTIFY}" || telegram_default="y/N"
  printf 'Отправлять результат бэкапа в Telegram? [%s]: ' "${telegram_default}" >/dev/tty
  IFS= read -r telegram_value </dev/tty
  if [[ -z "${telegram_value}" ]]; then
    if is_truthy "${SCHEDULE_TELEGRAM_NOTIFY}"; then telegram_value="true"; else telegram_value="false"; fi
  elif [[ "${telegram_value}" =~ ^[yYдД]$ ]]; then
    telegram_value="true"
  elif [[ "${telegram_value}" =~ ^[nNнН]$ ]]; then
    telegram_value="false"
  else
    fail "Ответьте y или n."
  fi
  SCHEDULE_TELEGRAM_NOTIFY="${telegram_value}"

  set_schedule_upload "${upload_value}"
  write_schedule_config
  install_schedule_units
  ok "Автоматический бэкап включён: $(schedule_description)."
  printf '  Часовой пояс:   %s\n' "$(server_timezone)"
  printf '  S3 отправка:    %s\n' "$(is_truthy "${S3_AUTO_UPLOAD}" && printf 'включена' || printf 'выключена')"
  printf '  Telegram:       %s\n' "$(is_truthy "${SCHEDULE_TELEGRAM_NOTIFY}" && printf 'включён' || printf 'выключен')"
  printf '  Хранение:       %s дней локально\n' "${SCHEDULE_KEEP_DAYS}"
}

enable_schedule() {
  require_root
  require_systemd
  if [[ ! -f "${SCHEDULE_CONFIG_FILE}" ]]; then
    configure_schedule
    return
  fi
  install_schedule_units
  ok "Автоматический бэкап включён: $(schedule_description)."
}

disable_schedule() {
  require_root
  require_systemd
  if systemctl is-enabled --quiet "${SCHEDULE_TIMER_NAME}" 2>/dev/null \
    || systemctl is-active --quiet "${SCHEDULE_TIMER_NAME}" 2>/dev/null; then
    systemctl disable --now "${SCHEDULE_TIMER_NAME}" >/dev/null
    ok "Автоматический бэкап выключен. Настройки сохранены."
  else
    warn "Автоматический бэкап уже выключен."
  fi
}

schedule_status() {
  printf '\n%s\n' "${BOLD}${CYAN}Автоматический бэкап${RESET}"
  if [[ -f "${SCHEDULE_CONFIG_FILE}" ]]; then
    printf '  Расписание:     %s\n' "$(schedule_description)"
    printf '  Часовой пояс:   %s\n' "$(server_timezone)"
    printf '  Хранение:       %s дней локально\n' "${SCHEDULE_KEEP_DAYS}"
    printf '  S3 отправка:    %s\n' "$(is_truthy "${S3_AUTO_UPLOAD}" && printf 'включена' || printf 'выключена')"
    if is_truthy "${SCHEDULE_TELEGRAM_NOTIFY}"; then
      printf '  Telegram:       %s\n' "$(telegram_backup_configured && printf 'настроен' || printf 'нет токена или chat ID')"
    else
      printf '  Telegram:       выключен\n'
    fi
  else
    printf '  Настройки:      не заданы\n'
  fi
  if ! command -v systemctl >/dev/null 2>&1 || [[ ! -d /run/systemd/system ]]; then
    warn "systemd недоступен"
    return 0
  fi
  if systemctl is-enabled --quiet "${SCHEDULE_TIMER_NAME}" 2>/dev/null; then
    ok "Таймер включён"
    systemctl list-timers "${SCHEDULE_TIMER_NAME}" --no-pager 2>/dev/null | sed -n '1,3p' || true
  else
    warn "Таймер выключен"
  fi

  local result timestamp
  result="$(systemctl show "${SCHEDULE_SERVICE_NAME}" --property=Result --value 2>/dev/null || true)"
  timestamp="$(systemctl show "${SCHEDULE_SERVICE_NAME}" --property=ExecMainExitTimestamp --value 2>/dev/null || true)"
  if [[ -n "${timestamp}" ]]; then
    printf '  Последний запуск: %s, результат: %s\n' "${timestamp}" "${result:-неизвестно}"
  fi
}

run_scheduled_backup_now() {
  require_root
  require_systemd
  [[ -f "${SCHEDULE_SERVICE_FILE}" ]] || fail "Сначала настройте автоматический бэкап."
  info "Запускаем бэкап через systemd..."
  systemctl start "${SCHEDULE_SERVICE_NAME}"
  local result
  result="$(systemctl show "${SCHEDULE_SERVICE_NAME}" --property=Result --value)"
  [[ "${result}" == "success" ]] || fail "Бэкап завершился со статусом ${result}. Откройте логи расписания."
  ok "Тестовый запуск завершён успешно."
}

schedule_logs() {
  require_systemd
  journalctl -u "${SCHEDULE_SERVICE_NAME}" -n 120 --no-pager
}

schedule_menu() {
  require_tty
  local choice
  printf '%s\n' \
    "  1. Настроить или изменить и включить" \
    "  2. Включить с сохранёнными настройками" \
    "  3. Выключить" \
    "  4. Показать статус" \
    "  5. Запустить сейчас для проверки" \
    "  6. Показать логи" \
    "  7. Проверить Telegram-уведомление" \
    "  0. Назад" >/dev/tty
  printf 'Выберите действие: ' >/dev/tty
  IFS= read -r choice </dev/tty
  case "${choice}" in
    1) configure_schedule ;;
    2) enable_schedule ;;
    3) disable_schedule ;;
    4) schedule_status ;;
    5) run_scheduled_backup_now ;;
    6) schedule_logs ;;
    7) test_telegram_backup_notification ;;
    0) return ;;
    *) warn "Неизвестный пункт." ;;
  esac
}

backup_status() {
  require_root
  require_commands
  printf '%s\n' "${BOLD}${CYAN}Бэкапы${RESET}"
  mkdir -p "${BACKUP_DIR}"

  local latest count
  count="$(local_backup_paths | wc -l | tr -d ' ')"
  latest="$(latest_local_backup)"
  printf '  Каталог:        %s\n' "${BACKUP_DIR}"
  printf '  Локальных:      %s\n' "${count}"
  if [[ -n "${latest}" ]]; then
    local age
    age="$(backup_age_hours "${latest}")"
    printf '  Последний:      %s (%s, %s ч назад)\n' \
      "$(basename "${latest}")" "$(du -h "${latest}" | awk '{print $1}')" "${age}"
    if ((age <= MAX_AGE_HOURS)); then
      ok "Локальный бэкап свежий"
    else
      warn "Последний локальный бэкап старше ${MAX_AGE_HOURS} часов"
    fi
  else
    warn "Локальных бэкапов пока нет"
  fi

  printf '\n%s\n' "${BOLD}${CYAN}S3${RESET}"
  if s3_configured; then
    printf '  Bucket:         %s\n' "${S3_BUCKET}"
    printf '  Prefix:         %s\n' "${S3_PREFIX:-/}"
    printf '  Auto upload:    %s\n' "${S3_AUTO_UPLOAD}"
    if ! command -v aws >/dev/null 2>&1; then
      warn "AWS CLI не установлен, S3-доступ не проверен"
    elif remote_backup_keys >/tmp/remna-s3-health.$$ 2>/tmp/remna-s3-health.err.$$; then
      local remote_count
      remote_count="$(grep -cv '^$' /tmp/remna-s3-health.$$ 2>/dev/null || true)"
      ok "S3 доступен, архивов: ${remote_count}"
    else
      warn "S3 настроен, но доступ не прошёл"
      sed -n '1,3p' /tmp/remna-s3-health.err.$$ 2>/dev/null || true
    fi
    rm -f /tmp/remna-s3-health.$$ /tmp/remna-s3-health.err.$$
  else
    warn "S3 не настроен"
  fi

  schedule_status
}

choose_local_backup() {
  require_tty
  local -a archives=()
  local archive index choice
  while IFS= read -r archive; do
    [[ -n "${archive}" ]] && archives+=("${archive}")
  done < <(local_backup_paths)
  ((${#archives[@]} > 0)) || fail "Локальных бэкапов пока нет."
  printf '\nЛокальные бэкапы:\n' >/dev/tty
  for index in "${!archives[@]}"; do
    printf '  %d. %-28s %8s\n' "$((index + 1))" "$(basename "${archives[index]}")" "$(du -h "${archives[index]}" | awk '{print $1}')" >/dev/tty
  done
  printf 'Выберите архив: ' >/dev/tty
  IFS= read -r choice </dev/tty
  [[ "${choice}" =~ ^[0-9]+$ ]] || fail "Неверный номер архива."
  ((choice >= 1 && choice <= ${#archives[@]})) || fail "Архив с таким номером не найден."
  printf '%s\n' "${archives[choice - 1]}"
}

remote_backup_keys() {
  local prefix="${S3_PREFIX#/}"
  prefix="${prefix%/}"
  local -a arguments=(
    s3api list-objects-v2
    --bucket "${S3_BUCKET}"
    --query 'Contents[?ends_with(Key, `.tar.gz`)].Key'
    --output text
  )
  if [[ -n "${prefix}" ]]; then
    arguments+=(--prefix "${prefix}/")
  fi
  aws_s3 "${arguments[@]}" | tr '\t' '\n' | sort -r
}

choose_remote_backup() {
  require_tty
  local -a keys=()
  local key index choice destination
  while IFS= read -r key; do
    [[ -n "${key}" && "${key}" != "None" ]] && keys+=("${key}")
  done < <(remote_backup_keys)
  ((${#keys[@]} > 0)) || fail "В S3 нет полных бэкапов."
  printf '\nБэкапы в S3:\n' >/dev/tty
  for index in "${!keys[@]}"; do
    printf '  %d. %s\n' "$((index + 1))" "$(basename "${keys[index]}")" >/dev/tty
  done
  printf 'Выберите архив: ' >/dev/tty
  IFS= read -r choice </dev/tty
  [[ "${choice}" =~ ^[0-9]+$ ]] || fail "Неверный номер архива."
  ((choice >= 1 && choice <= ${#keys[@]})) || fail "Архив с таким номером не найден."
  key="${keys[choice - 1]}"
  mkdir -p "${BACKUP_DIR}"
  destination="${BACKUP_DIR}/$(basename "${key}")"
  info "Скачиваем архив из S3..." >/dev/tty
  aws_s3 s3 cp "s3://${S3_BUCKET}/${key}" "${destination}" --only-show-errors
  aws_s3 s3 cp "s3://${S3_BUCKET}/${key}.sha256" "${destination}.sha256" --only-show-errors 2>/dev/null || true
  chmod 600 "${destination}" "${destination}.sha256" 2>/dev/null || true
  printf '%s\n' "${destination}"
}

confirm_and_restore() {
  local archive="$1"
  local confirmation
  verify_backup "${archive}"
  printf '\nВосстановление перезапишет Remnawave, Remnashop и кабинет.\nВведите RESTORE: ' >/dev/tty
  IFS= read -r confirmation </dev/tty
  if [[ "${confirmation}" != "RESTORE" ]]; then
    warn "Восстановление отменено."
    return
  fi
  RESTORE_CONFIRM=RESTORE_REMNAWAVE_REMNASHOP_CABINET restore_backup "${archive}"
}

restore_menu() {
  require_tty
  local choice archive
  printf '%s\n' \
    "  1. Восстановить локальный бэкап" \
    "  2. Скачать и восстановить из S3" \
    "  0. Назад" >/dev/tty
  printf 'Выберите источник: ' >/dev/tty
  IFS= read -r choice </dev/tty
  case "${choice}" in
    1) archive="$(choose_local_backup)"; confirm_and_restore "${archive}" ;;
    2) archive="$(choose_remote_backup)"; confirm_and_restore "${archive}" ;;
    0) return ;;
    *) warn "Неизвестный пункт." ;;
  esac
}

s3_menu() {
  require_tty
  local choice archive
  printf '%s\n' \
    "  1. Настроить S3" \
    "  2. Загрузить локальный бэкап" \
    "  3. Показать файлы в S3" \
    "  0. Назад" >/dev/tty
  printf 'Выберите действие: ' >/dev/tty
  IFS= read -r choice </dev/tty
  case "${choice}" in
    1) configure_s3 ;;
    2) archive="$(choose_local_backup)"; upload_backup_to_s3 "${archive}" ;;
    3) remote_backup_keys ;;
    0) return ;;
    *) warn "Неизвестный пункт." ;;
  esac
}

show_menu() {
  if [[ ! -r /dev/tty ]]; then
    show_help
    exit 1
  fi
  while true; do
    clear 2>/dev/null || true
    printf '%s\n\n' "${BOLD}${CYAN}Бэкапы и восстановление${RESET}"
    printf '%s\n' \
      "  1. Создать бэкап" \
      "  2. Восстановить" \
      "  3. S3" \
      "  4. Автоматический бэкап" \
      "  5. Статус" \
      "  0. Выход"
    printf '\nЛокальных архивов: %s · S3: %s · Авто: %s\n' \
      "$(local_backup_paths | wc -l | tr -d ' ')" \
      "$(s3_configured && printf 'настроен' || printf 'не настроен')" \
      "$(systemctl is-enabled --quiet "${SCHEDULE_TIMER_NAME}" 2>/dev/null && printf 'включено' || printf 'выключено')" >/dev/tty
    printf 'Выберите действие: ' >/dev/tty
    local choice
    IFS= read -r choice </dev/tty
    case "${choice}" in
      1) create_backup ;;
      2) restore_menu ;;
      3) s3_menu ;;
      4) schedule_menu ;;
      5) backup_status ;;
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
  remna-backup backup                полный бэкап и Telegram-уведомление
  remna-backup status                свежесть локального бэкапа и S3
  remna-backup schedule              настройка автоматического бэкапа
  remna-backup schedule-status       состояние и следующий запуск
  remna-backup schedule-enable       включить сохранённое расписание
  remna-backup schedule-disable      выключить расписание
  remna-backup schedule-run          запустить расписание сейчас
  remna-backup schedule-logs         последние логи автоматизации
  remna-backup schedule-notify-test  проверить уведомление в Telegram
  remna-backup list                  список архивов
  remna-backup s3-config             настроить S3
  remna-backup s3-upload ARCHIVE     загрузить архив в S3
  remna-backup s3-list               список архивов в S3
  remna-backup verify ARCHIVE        проверка архива
  RESTORE_CONFIRM=RESTORE_REMNAWAVE_REMNASHOP_CABINET \\
    remna-backup restore ARCHIVE     полное восстановление
  remna-backup install               установить команду в ${INSTALL_PATH}

Переменные:
  FULL_BACKUP_DIR=${BACKUP_DIR}
  FULL_BACKUP_KEEP_DAYS=${KEEP_DAYS}
  FULL_BACKUP_S3_CONFIG=${S3_CONFIG_FILE}
  FULL_BACKUP_SCHEDULE_CONFIG=${SCHEDULE_CONFIG_FILE}
  REMNAWAVE_DIR=${REMNAWAVE_DIR}
  REMNAWAVE_SUBSCRIPTION_DIR=${REMNAWAVE_SUBSCRIPTION_DIR}
  REMNASHOP_DIR=${REMNASHOP_DIR}
  CABINET_DIR=${CABINET_DIR}
EOF
}

case "${1:-menu}" in
  menu) show_menu ;;
  backup) run_backup_with_notifications ;;
  backup-create) create_backup ;;
  status) backup_status ;;
  schedule) schedule_menu ;;
  schedule-status) schedule_status ;;
  schedule-enable) enable_schedule ;;
  schedule-disable) disable_schedule ;;
  schedule-run) run_scheduled_backup_now ;;
  schedule-logs) schedule_logs ;;
  schedule-notify-test) test_telegram_backup_notification ;;
  list) list_backups ;;
  verify) verify_backup "${2:-}" ;;
  restore) restore_backup "${2:-}" ;;
  s3-config) configure_s3 ;;
  s3-upload) upload_backup_to_s3 "${2:-}" ;;
  s3-list) remote_backup_keys ;;
  install) install_script ;;
  help|-h|--help) show_help ;;
  *) show_help; exit 1 ;;
esac

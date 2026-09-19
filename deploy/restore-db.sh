#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_ENV_FILE="${ROOT_DIR}/.env"
if [[ ! -f "${DEFAULT_ENV_FILE}" ]]; then
  DEFAULT_ENV_FILE="${ROOT_DIR}/.env.production"
fi
DEFAULT_COMPOSE_FILE="${ROOT_DIR}/docker-compose.yml"
if [[ ! -f "${DEFAULT_COMPOSE_FILE}" ]]; then
  DEFAULT_COMPOSE_FILE="${ROOT_DIR}/deploy/docker-compose.server.yml"
fi
ENV_FILE="${ENV_FILE:-${DEFAULT_ENV_FILE}}"
COMPOSE_FILE="${COMPOSE_FILE:-${DEFAULT_COMPOSE_FILE}}"
BACKUP_FILE="${1:-}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Env file not found. Set ENV_FILE or run from the deployment directory."
  exit 1
fi

if [[ -z "${BACKUP_FILE}" ]]; then
  echo "Usage: RESTORE_CONFIRM=I_UNDERSTAND_DATA_WILL_BE_OVERWRITTEN $0 /path/to/cabinet.dump"
  exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

if [[ "${RESTORE_CONFIRM:-}" != "I_UNDERSTAND_DATA_WILL_BE_OVERWRITTEN" ]]; then
  echo "Refusing to restore without explicit confirmation."
  echo "Run:"
  echo "  RESTORE_CONFIRM=I_UNDERSTAND_DATA_WILL_BE_OVERWRITTEN $0 ${BACKUP_FILE}"
  exit 1
fi

echo "Stopping app and workers before restore..."
compose() {
  CABINET_ENV_FILE="${ENV_FILE}" docker compose --profile "*" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

DB_WRITERS=(
  migrate
  seed
  app
  app-candidate
  worker
  broadcast-worker
  watch-worker
  node-provisioning-worker
  retention-cleanup
)
RUNNING_SERVICES=()
while IFS= read -r service; do
  [[ -n "${service}" ]] && RUNNING_SERVICES+=("${service}")
done < <(compose ps --services --status running)
RUNNING_WRITERS=()
for writer in "${DB_WRITERS[@]}"; do
  for service in "${RUNNING_SERVICES[@]}"; do
    if [[ "${writer}" == "${service}" ]]; then
      RUNNING_WRITERS+=("${writer}")
      break
    fi
  done
done

if [[ ! " ${RUNNING_SERVICES[*]} " =~ " db " ]]; then
  echo "Database service is not running; restore cannot continue."
  exit 1
fi

STATE_FILE="${RESTORE_STATE_FILE:-${ROOT_DIR}/.restore-db-running-services}"
printf '%s\n' "${RUNNING_WRITERS[@]}" > "${STATE_FILE}"
echo "Database writers active before restore: ${RUNNING_WRITERS[*]:-none}"

if (( ${#RUNNING_WRITERS[@]} > 0 )); then
  compose stop "${RUNNING_WRITERS[@]}" >/dev/null
fi

STILL_RUNNING=()
while IFS= read -r service; do
  [[ -n "${service}" ]] && STILL_RUNNING+=("${service}")
done < <(compose ps --services --status running)
for writer in "${RUNNING_WRITERS[@]}"; do
  for service in "${STILL_RUNNING[@]}"; do
    if [[ "${writer}" == "${service}" ]]; then
      echo "Refusing to restore: service ${writer} is still running."
      echo "Saved pre-restore service list: ${STATE_FILE}"
      exit 1
    fi
  done
done

echo "Restoring database from: ${BACKUP_FILE}"
cat "${BACKUP_FILE}" | compose exec -T db \
  sh -lc 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges'

echo "Starting services that were active before restore..."
if (( ${#RUNNING_WRITERS[@]} > 0 )); then
  compose up -d --no-deps "${RUNNING_WRITERS[@]}" >/dev/null
fi
rm -f "${STATE_FILE}"

echo "Restore complete. Run smoke-check next:"
echo "  ./deploy/smoke-check.sh"

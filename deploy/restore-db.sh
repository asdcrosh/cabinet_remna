#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.production}"
COMPOSE_FILE="${ROOT_DIR}/deploy/docker-compose.server.yml"
BACKUP_FILE="${1:-}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo ".env.production not found. Set ENV_FILE or run from the project server checkout."
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

echo "Stopping app and worker before restore..."
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" stop app worker >/dev/null || true

echo "Restoring database from: ${BACKUP_FILE}"
cat "${BACKUP_FILE}" | docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T db \
  sh -lc 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges'

echo "Starting app and worker..."
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d app worker >/dev/null

echo "Restore complete. Run smoke-check next:"
echo "  ./deploy/smoke-check.sh"

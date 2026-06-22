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
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Env file not found. Set ENV_FILE or run from the deployment directory."
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="${BACKUP_DIR}/cabinet-${timestamp}.dump"
latest_file="${BACKUP_DIR}/cabinet-latest.dump"

echo "Creating database backup: ${backup_file}"
CABINET_ENV_FILE="${ENV_FILE}" docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T db \
  sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges' \
  > "${backup_file}"

ln -sfn "$(basename "${backup_file}")" "${latest_file}"

echo "Backup complete:"
ls -lh "${backup_file}"
echo "Latest symlink: ${latest_file}"

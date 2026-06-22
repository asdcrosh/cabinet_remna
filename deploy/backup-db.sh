#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.production}"
COMPOSE_FILE="${ROOT_DIR}/deploy/docker-compose.server.yml"
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo ".env.production not found. Set ENV_FILE or run from the project server checkout."
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="${BACKUP_DIR}/cabinet-${timestamp}.dump"
latest_file="${BACKUP_DIR}/cabinet-latest.dump"

echo "Creating database backup: ${backup_file}"
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T db \
  sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges' \
  > "${backup_file}"

ln -sfn "$(basename "${backup_file}")" "${latest_file}"

echo "Backup complete:"
ls -lh "${backup_file}"
echo "Latest symlink: ${latest_file}"

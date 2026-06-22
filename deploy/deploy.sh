#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/deploy/docker-compose.server.yml"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.production}"
COMPOSE=(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}")

cd "${ROOT_DIR}"

if [[ ! -f "${ENV_FILE}" ]]; then
  cp deploy/env.production.example "${ENV_FILE}"
  echo "Created ${ENV_FILE} from template."
  echo "Fill it first, then run: ENV_FILE=${ENV_FILE} ./deploy/deploy.sh"
  exit 1
fi

if grep -Eq 'CHANGE_ME|ВСТАВЬ_СЮДА|test_|example\.com' "${ENV_FILE}"; then
  echo "${ENV_FILE} still contains placeholder, example.com, or test_ values."
  echo "Fill real production secrets before deploy."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is not installed."
  exit 1
fi

env_value() {
  local key="$1"
  grep -E "^${key}=" "${ENV_FILE}" | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true
}

if ! grep -Eq '^COMPOSE_PROFILES=' "${ENV_FILE}"; then
  if [[ "$(env_value CABINET_ENABLE_CADDY)" == "false" ]]; then
    export COMPOSE_PROFILES=""
  else
    export COMPOSE_PROFILES="caddy"
  fi
fi

EXTERNAL_NETWORK="$(env_value CABINET_EXTERNAL_NETWORK)"
EXTERNAL_NETWORK="${EXTERNAL_NETWORK:-remnawave-network}"
if ! docker network inspect "${EXTERNAL_NETWORK}" >/dev/null 2>&1; then
  echo "Creating external Docker network: ${EXTERNAL_NETWORK}"
  docker network create "${EXTERNAL_NETWORK}" >/dev/null
fi

echo "Pulling images..."
CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" pull

echo "Starting services..."
CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" up -d --remove-orphans

echo "Deploy complete."
echo "Useful commands:"
echo "  ENV_FILE=${ENV_FILE} ./deploy/deploy.sh"
echo "  docker compose --env-file ${ENV_FILE} -f deploy/docker-compose.server.yml ps"
echo "  docker compose --env-file ${ENV_FILE} -f deploy/docker-compose.server.yml logs -f app"
echo "  docker compose --env-file ${ENV_FILE} -f deploy/docker-compose.server.yml logs -f worker"

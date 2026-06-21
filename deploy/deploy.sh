#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/deploy/docker-compose.server.yml"
ENV_FILE="${ROOT_DIR}/.env.production"

cd "${ROOT_DIR}"

if [[ ! -f "${ENV_FILE}" ]]; then
  cp deploy/env.production.alekseevvp.example .env.production
  echo "Created .env.production from template."
  echo "Fill .env.production first, then run: ./deploy/deploy.sh"
  exit 1
fi

if grep -Eq 'CHANGE_ME|test_' "${ENV_FILE}"; then
  echo ".env.production still contains CHANGE_ME or test_ values."
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

echo "Checking production environment..."
NODE_ENV=production npm run check:env

echo "Building images..."
CABINET_ENV_FILE="${ENV_FILE}" docker compose -f "${COMPOSE_FILE}" build

echo "Starting database..."
CABINET_ENV_FILE="${ENV_FILE}" docker compose -f "${COMPOSE_FILE}" up -d db

echo "Running migrations..."
CABINET_ENV_FILE="${ENV_FILE}" docker compose -f "${COMPOSE_FILE}" run --rm migrate

echo "Starting app and HTTPS proxy..."
CABINET_ENV_FILE="${ENV_FILE}" docker compose -f "${COMPOSE_FILE}" up -d app caddy

echo "Deploy complete."
echo "Useful commands:"
echo "  docker compose -f deploy/docker-compose.server.yml logs -f app"
echo "  docker compose -f deploy/docker-compose.server.yml ps"

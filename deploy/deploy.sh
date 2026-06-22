#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/deploy/docker-compose.server.yml"
ENV_FILE="${ROOT_DIR}/.env.production"
COMPOSE=(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}")

cd "${ROOT_DIR}"

if [[ ! -f "${ENV_FILE}" ]]; then
  cp deploy/env.production.example .env.production
  echo "Created .env.production from template."
  echo "Fill .env.production first, then run: ./deploy/deploy.sh"
  exit 1
fi

if grep -Eq 'CHANGE_ME|ВСТАВЬ_СЮДА|test_|example\.com' "${ENV_FILE}"; then
  echo ".env.production still contains placeholder, example.com, or test_ values."
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
if command -v npm >/dev/null 2>&1; then
  NODE_ENV=production npm run check:env
else
  echo "npm is not installed on host, skipping host env check."
  echo "Docker build and app startup will validate runtime configuration."
fi

echo "Building images..."
CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" build

echo "Starting database..."
CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" up -d db

echo "Running migrations..."
CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" run --rm migrate

echo "Seeding default plans if database is empty..."
CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" run --rm migrate npm run db:seed

ENABLE_CADDY="$(grep -E '^CABINET_ENABLE_CADDY=' "${ENV_FILE}" | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
if [[ "${ENABLE_CADDY:-true}" == "false" ]]; then
  echo "Starting app and payment worker without bundled Caddy..."
  CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" up -d app worker
else
  echo "Starting app, payment worker and HTTPS proxy..."
  CABINET_ENV_FILE="${ENV_FILE}" "${COMPOSE[@]}" up -d app worker caddy
fi

echo "Deploy complete."
echo "Useful commands:"
echo "  docker compose -f deploy/docker-compose.server.yml logs -f app"
echo "  docker compose -f deploy/docker-compose.server.yml logs -f worker"
echo "  docker compose -f deploy/docker-compose.server.yml logs -f caddy"
echo "  docker compose -f deploy/docker-compose.server.yml ps"

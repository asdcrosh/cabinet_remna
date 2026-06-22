#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.production}"
COMPOSE_FILE="${ROOT_DIR}/deploy/docker-compose.server.yml"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

APP_URL="${APP_URL:-}"
CABINET_APP_BIND="${CABINET_APP_BIND:-127.0.0.1}"
CABINET_APP_PORT="${CABINET_APP_PORT:-3000}"

if [[ -z "${HEALTHCHECK_TOKEN:-}" ]]; then
  echo "HEALTHCHECK_TOKEN is required"
  exit 1
fi

if [[ -z "${APP_URL}" ]]; then
  echo "APP_URL is required, for example: https://your-cabinet-domain.example"
  exit 1
fi

echo "Checking Docker services..."
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" ps

echo "Checking local app on ${CABINET_APP_BIND}:${CABINET_APP_PORT}..."
curl -fsSI "http://${CABINET_APP_BIND}:${CABINET_APP_PORT}/login" >/dev/null

echo "Checking health..."
curl -fsS -H "x-healthcheck-token: ${HEALTHCHECK_TOKEN}" "${APP_URL%/}/api/health" >/dev/null

echo "Checking public pages..."
curl -fsSIL "${APP_URL%/}" >/dev/null
curl -fsS "${APP_URL%/}/login" >/dev/null
curl -fsS "${APP_URL%/}/register" >/dev/null
curl -fsS "${APP_URL%/}/dashboard/plans" >/dev/null

echo "Checking favicon..."
curl -fsSI "${APP_URL%/}/icon.svg" >/dev/null

echo "OK: ${APP_URL} is responding"

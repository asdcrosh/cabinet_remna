#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-}"

if [[ -z "${HEALTHCHECK_TOKEN:-}" ]]; then
  echo "HEALTHCHECK_TOKEN is required"
  exit 1
fi

if [[ -z "${APP_URL}" ]]; then
  echo "APP_URL is required, for example: https://your-cabinet-domain.example"
  exit 1
fi

echo "Checking health..."
curl -fsS -H "x-healthcheck-token: ${HEALTHCHECK_TOKEN}" "${APP_URL}/api/health" >/dev/null

echo "Checking public pages..."
curl -fsS "${APP_URL}/login" >/dev/null
curl -fsS "${APP_URL}/register" >/dev/null

echo "OK: ${APP_URL} is responding"

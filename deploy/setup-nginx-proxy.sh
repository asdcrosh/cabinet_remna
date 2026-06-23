#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/remnawave-cabinet}"
ENV_FILE="${ENV_FILE:-${INSTALL_DIR}/.env}"
NGINX_DIR="${NGINX_DIR:-/opt/remnawave/nginx}"
NGINX_CONF="${NGINX_CONF:-${NGINX_DIR}/nginx.conf}"
NGINX_COMPOSE_FILE="${NGINX_COMPOSE_FILE:-${NGINX_DIR}/docker-compose.yml}"
NGINX_CONTAINER="${NGINX_CONTAINER:-remnawave-nginx}"
NGINX_SERVICE="${NGINX_SERVICE:-remnawave-nginx}"
CABINET_UPSTREAM="${CABINET_UPSTREAM:-remnawave-cabinet-app:3000}"
CERT_FULLCHAIN_HOST="${CERT_FULLCHAIN_HOST:-${NGINX_DIR}/cabinet_fullchain.pem}"
CERT_PRIVKEY_HOST="${CERT_PRIVKEY_HOST:-${NGINX_DIR}/cabinet_privkey.key}"
CERT_FULLCHAIN_CONTAINER="${CERT_FULLCHAIN_CONTAINER:-/etc/nginx/ssl/cabinet_fullchain.pem}"
CERT_PRIVKEY_CONTAINER="${CERT_PRIVKEY_CONTAINER:-/etc/nginx/ssl/cabinet_privkey.key}"
MARKER_BEGIN="# BEGIN REMNAWAVE CABINET"
MARKER_END="# END REMNAWAVE CABINET"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root or with sudo:"
  echo "  curl -fsSL https://raw.githubusercontent.com/asdcrosh/cabinet_remna/main/deploy/setup-nginx-proxy.sh | sudo bash"
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "${ENV_FILE} not found. Install cabinet first."
  exit 1
fi

if [[ ! -f "${NGINX_CONF}" ]]; then
  echo "${NGINX_CONF} not found. Set NGINX_CONF=/path/to/nginx.conf if your Remnawave nginx uses another file."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required."
  exit 1
fi

env_value() {
  local key="$1"
  ENV_FILE_PATH="${ENV_FILE}" python3 - "$key" <<'PY'
from pathlib import Path
import os
import sys

key = sys.argv[1]
path = Path(os.environ["ENV_FILE_PATH"])
for line in path.read_text().splitlines():
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or "=" not in stripped:
        continue
    current_key, value = stripped.split("=", 1)
    if current_key.strip() != key:
        continue
    value = value.strip()
    if (value.startswith('"') and value.endswith('"')) or (
        value.startswith("'") and value.endswith("'")
    ):
        value = value[1:-1]
    print(value)
    break
PY
}

domain_from_url() {
  python3 - "$1" <<'PY'
from urllib.parse import urlparse
import sys

raw = sys.argv[1].strip()
if "://" not in raw:
    raw = "https://" + raw
print(urlparse(raw).hostname or "")
PY
}

CABINET_DOMAIN="${CABINET_DOMAIN:-$(env_value CABINET_DOMAIN)}"
if [[ -z "${CABINET_DOMAIN}" ]]; then
  APP_URL="$(env_value APP_URL)"
  CABINET_DOMAIN="$(domain_from_url "${APP_URL}")"
fi

if [[ -z "${CABINET_DOMAIN}" || "${CABINET_DOMAIN}" == *"ВСТАВЬ_СЮДА"* || "${CABINET_DOMAIN}" == *"example.com"* ]]; then
  echo "CABINET_DOMAIN is empty or still contains a placeholder."
  exit 1
fi

CABINET_EXTERNAL_NETWORK="${CABINET_EXTERNAL_NETWORK:-$(env_value CABINET_EXTERNAL_NETWORK)}"
CABINET_EXTERNAL_NETWORK="${CABINET_EXTERNAL_NETWORK:-remnawave-network}"

echo "Configuring nginx proxy for ${CABINET_DOMAIN}"

if command -v apt-get >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl socat
fi

install_acme() {
  if [[ -x "${HOME}/.acme.sh/acme.sh" ]]; then
    return
  fi

  echo "Installing acme.sh..."
  curl -fsSL https://get.acme.sh | sh
}

ensure_certificate() {
  if [[ -f "${CERT_FULLCHAIN_HOST}" && -f "${CERT_PRIVKEY_HOST}" && "${FORCE_CERT:-false}" != "true" ]]; then
    echo "Certificate files already exist, skipping issue."
    return
  fi

  install_acme
  "${HOME}/.acme.sh/acme.sh" --set-default-ca --server letsencrypt >/dev/null

  local was_running="false"
  if docker inspect "${NGINX_CONTAINER}" >/dev/null 2>&1; then
    was_running="$(docker inspect -f '{{.State.Running}}' "${NGINX_CONTAINER}" 2>/dev/null || echo false)"
  fi

  echo "Issuing certificate for ${CABINET_DOMAIN}. Nginx will be stopped temporarily."
  if [[ "${was_running}" == "true" ]]; then
    docker stop "${NGINX_CONTAINER}" >/dev/null
  fi

  set +e
  "${HOME}/.acme.sh/acme.sh" --issue -d "${CABINET_DOMAIN}" --standalone --httpport 80 --keylength ec-256
  local issue_status=$?
  set -e

  if [[ "${was_running}" == "true" ]]; then
    docker start "${NGINX_CONTAINER}" >/dev/null || true
  fi

  if [[ "${issue_status}" -ne 0 ]]; then
    echo "Certificate issue failed. Check DNS A record and that port 80 is reachable from the internet."
    exit "${issue_status}"
  fi

  "${HOME}/.acme.sh/acme.sh" --install-cert -d "${CABINET_DOMAIN}" --ecc \
    --key-file "${CERT_PRIVKEY_HOST}" \
    --fullchain-file "${CERT_FULLCHAIN_HOST}"
}

backup_file() {
  local file="$1"
  local backup="${file}.bak.$(date +%Y%m%d%H%M%S)"
  cp "${file}" "${backup}"
  echo "${backup}"
}

patch_nginx_compose_volumes() {
  if [[ ! -f "${NGINX_COMPOSE_FILE}" ]]; then
    echo "${NGINX_COMPOSE_FILE} not found, skipping compose volume patch."
    return
  fi

  echo "Ensuring cabinet certificate mounts in ${NGINX_COMPOSE_FILE}"
  NGINX_COMPOSE_FILE_PATH="${NGINX_COMPOSE_FILE}" NGINX_SERVICE_NAME="${NGINX_SERVICE}" python3 <<'PY'
from pathlib import Path
import os
import sys

path = Path(os.environ["NGINX_COMPOSE_FILE_PATH"])
service_name = os.environ["NGINX_SERVICE_NAME"]
lines = [
    line for line in path.read_text().splitlines()
    if "cabinet_fullchain.pem" not in line and "cabinet_privkey.key" not in line
]
service_index = None
for index, line in enumerate(lines):
    if line.strip() == f"{service_name}:":
        service_index = index
        break
if service_index is None:
    print(f"Service {service_name} not found in nginx compose file.", file=sys.stderr)
    sys.exit(1)

volumes_index = None
for index in range(service_index + 1, len(lines)):
    line = lines[index]
    if line and not line.startswith(" ") and not line.startswith("\t"):
        break
    if line.strip() == "volumes:":
        volumes_index = index
        break
if volumes_index is None:
    print(f"volumes section not found for {service_name}.", file=sys.stderr)
    sys.exit(1)

volumes_indent = lines[volumes_index][:len(lines[volumes_index]) - len(lines[volumes_index].lstrip())]
item_indent = volumes_indent + "  "
insert_at = volumes_index + 1
while insert_at < len(lines):
    line = lines[insert_at]
    stripped = line.strip()
    if not stripped:
        insert_at += 1
        continue
    current_indent = line[:len(line) - len(line.lstrip())]
    if stripped.startswith("- ") and len(current_indent) > len(volumes_indent):
        item_indent = current_indent
        insert_at += 1
        continue
    break

items = [
    f"{item_indent}- ./cabinet_fullchain.pem:/etc/nginx/ssl/cabinet_fullchain.pem:ro",
    f"{item_indent}- ./cabinet_privkey.key:/etc/nginx/ssl/cabinet_privkey.key:ro",
]
for item in reversed(items):
    lines.insert(insert_at, item)
path.write_text("\n".join(lines) + "\n")
PY
}

render_cabinet_block() {
  cat <<EOF
${MARKER_BEGIN}
server {
    server_name ${CABINET_DOMAIN};

    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_certificate "${CERT_FULLCHAIN_CONTAINER}";
    ssl_certificate_key "${CERT_PRIVKEY_CONTAINER}";
    ssl_trusted_certificate "${CERT_FULLCHAIN_CONTAINER}";

    client_max_body_size 10m;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    resolver 127.0.0.11 1.1.1.1 8.8.8.8 valid=30s ipv6=off;

    location / {
        set \$cabinet_upstream ${CABINET_UPSTREAM};
        proxy_pass http://\$cabinet_upstream;
        proxy_http_version 1.1;

        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
${MARKER_END}
EOF
}

patch_nginx_conf() {
  local block
  block="$(render_cabinet_block)"
  NGINX_CONF_PATH="${NGINX_CONF}" CABINET_BLOCK="${block}" MARKER_BEGIN_VALUE="${MARKER_BEGIN}" MARKER_END_VALUE="${MARKER_END}" python3 <<'PY'
from pathlib import Path
import os
import re

path = Path(os.environ["NGINX_CONF_PATH"])
text = path.read_text()
begin = os.environ["MARKER_BEGIN_VALUE"]
end = os.environ["MARKER_END_VALUE"]
block = os.environ["CABINET_BLOCK"].rstrip() + "\n"

pattern = re.compile(rf"\n?{re.escape(begin)}.*?{re.escape(end)}\n?", re.S)
if begin in text and end in text:
    text = pattern.sub("\n" + block + "\n", text)
else:
    text = text.rstrip() + "\n\n" + block

path.write_text(text)
PY
}

recreate_nginx() {
  if [[ -f "${NGINX_COMPOSE_FILE}" ]] && docker compose -f "${NGINX_COMPOSE_FILE}" config --services 2>/dev/null | grep -qx "${NGINX_SERVICE}"; then
    docker compose -f "${NGINX_COMPOSE_FILE}" up -d --force-recreate "${NGINX_SERVICE}"
  else
    docker restart "${NGINX_CONTAINER}" >/dev/null
  fi
}

can_compose_nginx() {
  [[ -f "${NGINX_COMPOSE_FILE}" ]] && docker compose -f "${NGINX_COMPOSE_FILE}" config --services 2>/dev/null | grep -qx "${NGINX_SERVICE}"
}

validate_nginx_config_before_recreate() {
  if can_compose_nginx; then
    docker compose -f "${NGINX_COMPOSE_FILE}" run --rm -T --no-deps --entrypoint nginx "${NGINX_SERVICE}" -t
    return
  fi

  if docker inspect "${NGINX_CONTAINER}" >/dev/null 2>&1; then
    docker run --rm \
      --volumes-from "${NGINX_CONTAINER}" \
      nginx:1.28 nginx -t
    return
  fi

  echo "Cannot validate nginx config: compose service and container were not found."
  return 1
}

wait_for_nginx_container() {
  local attempts="${1:-60}"
  local running=""
  local restarting=""
  local status=""

  for _ in $(seq 1 "${attempts}"); do
    status="$(docker inspect -f '{{.State.Status}}' "${NGINX_CONTAINER}" 2>/dev/null || echo missing)"
    running="$(docker inspect -f '{{.State.Running}}' "${NGINX_CONTAINER}" 2>/dev/null || echo false)"
    restarting="$(docker inspect -f '{{.State.Restarting}}' "${NGINX_CONTAINER}" 2>/dev/null || echo false)"
    if [[ "${status}" == "running" && "${running}" == "true" && "${restarting}" != "true" ]]; then
      return 0
    fi
    sleep 2
  done

  echo "Nginx container ${NGINX_CONTAINER} did not become running in time."
  return 1
}

test_nginx() {
  local attempts="${1:-20}"
  local output=""

  for _ in $(seq 1 "${attempts}"); do
    if output="$(docker exec "${NGINX_CONTAINER}" nginx -t 2>&1)"; then
      printf "%s\n" "${output}"
      return 0
    fi
    printf "%s\n" "${output}"
    sleep 2
  done

  return 1
}

ensure_certificate

CONF_BACKUP="$(backup_file "${NGINX_CONF}")"
COMPOSE_BACKUP=""
if [[ -f "${NGINX_COMPOSE_FILE}" ]]; then
  COMPOSE_BACKUP="$(backup_file "${NGINX_COMPOSE_FILE}")"
fi

rollback() {
  echo "Rolling back nginx changes..."
  cp "${CONF_BACKUP}" "${NGINX_CONF}" || true
  if [[ -n "${COMPOSE_BACKUP}" ]]; then
    cp "${COMPOSE_BACKUP}" "${NGINX_COMPOSE_FILE}" || true
  fi
  recreate_nginx >/dev/null 2>&1 || docker restart "${NGINX_CONTAINER}" >/dev/null 2>&1 || true
}

trap 'rollback' ERR

patch_nginx_compose_volumes
patch_nginx_conf
validate_nginx_config_before_recreate
recreate_nginx
wait_for_nginx_container

docker network inspect "${CABINET_EXTERNAL_NETWORK}" >/dev/null
docker network connect "${CABINET_EXTERNAL_NETWORK}" "${NGINX_CONTAINER}" >/dev/null 2>&1 || true

test_nginx
docker restart "${NGINX_CONTAINER}" >/dev/null
wait_for_nginx_container

trap - ERR

echo "Checking https://${CABINET_DOMAIN}..."
curl -fsSIL "https://${CABINET_DOMAIN}" >/dev/null

echo "Nginx proxy configured successfully."
echo "Backups:"
echo "  ${CONF_BACKUP}"
if [[ -n "${COMPOSE_BACKUP}" ]]; then
  echo "  ${COMPOSE_BACKUP}"
fi

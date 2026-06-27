#!/usr/bin/env bash
set -euo pipefail

BRANCH="${BRANCH:-main}"
RAW_BASE_URL="${RAW_BASE_URL:-https://raw.githubusercontent.com/asdcrosh/cabinet_remna/${BRANCH}}"
CABINETCTL_URL="${CABINETCTL_URL:-${RAW_BASE_URL}/deploy/cabinetctl.sh}"
BACKUP_SCRIPT_URL="${BACKUP_SCRIPT_URL:-${RAW_BASE_URL}/deploy/full-stack-backup.sh}"
CABINETCTL_PATH="${CABINETCTL_PATH:-/usr/local/bin/cabinetctl}"
BACKUP_SCRIPT_PATH="${BACKUP_SCRIPT_PATH:-/usr/local/bin/remna-backup}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Запустите установку через sudo:"
  echo "  curl -fsSL ${RAW_BASE_URL}/deploy/install-console.sh | sudo bash"
  exit 1
fi

missing_packages=()
command -v curl >/dev/null 2>&1 || missing_packages+=(curl ca-certificates)
command -v flock >/dev/null 2>&1 || missing_packages+=(util-linux)

if [[ ${#missing_packages[@]} -gt 0 ]]; then
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y "${missing_packages[@]}"
  else
    echo "Не хватает системных пакетов: ${missing_packages[*]}"
    exit 1
  fi
fi

command -v curl >/dev/null 2>&1 || { echo "Не удалось установить curl."; exit 1; }
command -v flock >/dev/null 2>&1 || { echo "Не удалось установить flock."; exit 1; }

install_remote_script() {
  local url="$1"
  local destination="$2"
  local temporary="${destination}.tmp"
  curl -fsSL "${url}" -o "${temporary}"
  bash -n "${temporary}"
  install -m 755 "${temporary}" "${destination}"
  rm -f "${temporary}"
}

echo "Устанавливаем Cabinet Control..."
install_remote_script "${CABINETCTL_URL}" "${CABINETCTL_PATH}"
install_remote_script "${BACKUP_SCRIPT_URL}" "${BACKUP_SCRIPT_PATH}"
rm -f /usr/local/bin/remnactl

echo
echo "Готово. Запустите:"
echo "  cabinetctl"

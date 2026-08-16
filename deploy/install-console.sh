#!/usr/bin/env bash
set -euo pipefail

BRANCH="${BRANCH:-main}"
RAW_BASE_URL="${RAW_BASE_URL:-https://raw.githubusercontent.com/asdcrosh/cabinet_remna/${BRANCH}}"
GITHUB_API_URL="${GITHUB_API_URL:-https://api.github.com/repos/asdcrosh/cabinet_remna/commits/${BRANCH}}"
OFFICIAL_RAW_REPOSITORY="https://raw.githubusercontent.com/asdcrosh/cabinet_remna"
OFFICIAL_CONTENTS_API="https://api.github.com/repos/asdcrosh/cabinet_remna/contents"
CABINETCTL_URL="${CABINETCTL_URL:-${RAW_BASE_URL}/deploy/cabinetctl.sh}"
BACKUP_SCRIPT_URL="${BACKUP_SCRIPT_URL:-${RAW_BASE_URL}/deploy/full-stack-backup.sh}"
CABINETCTL_PATH="${CABINETCTL_PATH:-/usr/local/bin/cabinetctl}"
BACKUP_SCRIPT_PATH="${BACKUP_SCRIPT_PATH:-/usr/local/bin/remna-backup}"
RESOLVED_RELEASE_SHA=""

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Запустите установку через sudo:"
  echo "  sudo bash /path/to/downloaded-install-console.sh"
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

resolve_release_sha() {
  local response
  if [[ "${RESOLVED_RELEASE_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
    return 0
  fi
  response="$(curl -fsSL --proto '=https' --tlsv1.2 \
    -H 'Accept: application/vnd.github+json' "${GITHUB_API_URL}" 2>/dev/null || true)"
  RESOLVED_RELEASE_SHA="$(printf '%s\n' "${response}" \
    | sed -n 's/.*"sha"[[:space:]]*:[[:space:]]*"\([0-9a-f]\{40\}\)".*/\1/p' \
    | head -n 1)"
  [[ "${RESOLVED_RELEASE_SHA}" =~ ^[0-9a-f]{40}$ ]] || {
    echo "Не удалось определить immutable commit для установки."
    return 1
  }
}

remote_blob_sha() {
  local relative_path="$1"
  local response
  response="$(curl -fsSL --proto '=https' --tlsv1.2 \
    -H 'Accept: application/vnd.github+json' \
    --get --data-urlencode "ref=${RESOLVED_RELEASE_SHA}" \
    "${OFFICIAL_CONTENTS_API}/${relative_path}" 2>/dev/null || true)"
  printf '%s\n' "${response}" \
    | sed -n 's/.*"sha"[[:space:]]*:[[:space:]]*"\([0-9a-f]\{40\}\)".*/\1/p' \
    | head -n 1
}

git_blob_sha() {
  local file="$1"
  local size
  size="$(wc -c <"${file}" | tr -d '[:space:]')"
  { printf 'blob %s\0' "${size}"; cat "${file}"; } | sha1sum | awk '{print $1}'
}

install_remote_script() {
  local url="$1"
  local destination="$2"
  local temporary="${destination}.tmp"
  local official_prefix="${OFFICIAL_RAW_REPOSITORY}/${BRANCH}/"
  local source_url="${url}"
  local relative_path=""
  local expected_blob_sha=""

  if [[ "${url}" == "${official_prefix}"* ]]; then
    resolve_release_sha
    relative_path="${url#${official_prefix}}"
    source_url="${OFFICIAL_RAW_REPOSITORY}/${RESOLVED_RELEASE_SHA}/${relative_path}"
    expected_blob_sha="$(remote_blob_sha "${relative_path}")"
    [[ "${expected_blob_sha}" =~ ^[0-9a-f]{40}$ ]] || {
      echo "Не удалось получить checksum ${relative_path}."
      return 1
    }
  fi

  curl -fsSL --proto '=https' --tlsv1.2 "${source_url}" -o "${temporary}"
  if [[ -n "${expected_blob_sha}" && "$(git_blob_sha "${temporary}")" != "${expected_blob_sha}" ]]; then
    rm -f "${temporary}"
    echo "Checksum ${relative_path} не совпал с Git tree. Установка остановлена."
    return 1
  fi
  bash -n "${temporary}"
  install -m 755 "${temporary}" "${destination}"
  rm -f "${temporary}"
}

echo "Устанавливаем cabinetctl..."
install_remote_script "${CABINETCTL_URL}" "${CABINETCTL_PATH}"
install_remote_script "${BACKUP_SCRIPT_URL}" "${BACKUP_SCRIPT_PATH}"
rm -f /usr/local/bin/remnactl

echo
echo "Готово. Запустите:"
echo "  cabinetctl"

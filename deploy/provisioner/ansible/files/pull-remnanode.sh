#!/usr/bin/env bash
set -euo pipefail

image="${1:?An explicit Remnanode image is required}"
fallback=''
# Only the vendor's tagged images have a known equivalent in the other registry.
# Private images and digest pins must retain the operator's exact selection.
if [[ "$image" != *@* ]]; then
  case "$image" in
    remnawave/node:*|docker.io/remnawave/node:*|index.docker.io/remnawave/node:*|registry-1.docker.io/remnawave/node:*)
      fallback="ghcr.io/remnawave/node:${image##*:}" ;;
    ghcr.io/remnawave/node:*) fallback="remnawave/node:${image##*:}" ;;
  esac
fi

pull_image() {
  local reference="$1" attempt
  for attempt in 1 2 3; do
    echo "Pulling ${reference} (attempt ${attempt}/3)" >&2
    if timeout --signal=TERM --kill-after=10s 180 docker pull --quiet -- "$reference"; then
      return 0
    fi
    if [[ "$attempt" -lt 3 ]]; then sleep "$((attempt * 5))"; fi
  done
  return 1
}

if pull_image "$image"; then exit 0; fi
if [[ -n "$fallback" ]]; then
  echo "Primary registry failed; trying the official alternate registry: ${fallback}" >&2
  if pull_image "$fallback"; then
    docker image tag "$fallback" "$image"
    exit 0
  fi
fi
echo "Unable to download the Remnanode image. Check registry access, rate limits and disk space." >&2
exit 1

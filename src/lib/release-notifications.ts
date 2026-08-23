import { readFile } from 'node:fs/promises'
import { createAdminNotification } from './admin-notifications'

const SHA_PATTERN = /^[0-9a-f]{40}$/i
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/
const DEFAULT_REPOSITORY = 'asdcrosh/cabinet_remna'
const DEFAULT_BRANCH = 'main'
const DEFAULT_CONSOLE_VERSION_FILE = '/app/cabinetctl-version'

export async function checkReleaseNotifications() {
  const repository = env('CABINET_RELEASE_REPOSITORY') || DEFAULT_REPOSITORY
  const branch = env('CABINET_RELEASE_BRANCH') || DEFAULT_BRANCH
  const [cabinet, consoleVersion] = await Promise.allSettled([
    checkCabinetRelease(repository, branch),
    checkConsoleRelease(repository, branch),
  ])

  return {
    cabinet: cabinet.status === 'fulfilled' ? cabinet.value : 'failed',
    console: consoleVersion.status === 'fulfilled' ? consoleVersion.value : 'failed',
  }
}

async function checkCabinetRelease(repository: string, branch: string) {
  const installedRevision = normalizedSha(env('APP_BUILD_REVISION'))
  if (!installedRevision) return 'skipped'

  const remoteRevision = await latestBranchRevision(repository, branch)
  if (!remoteRevision || remoteRevision === installedRevision) return 'current'
  if (!await ghcrImageExists(repository, remoteRevision)) return 'building'

  const shortRevision = remoteRevision.slice(0, 7)
  const notification = await createAdminNotification({
    type: 'release',
    severity: 'INFO',
    dedupeKey: `admin:release:cabinet:${remoteRevision}`,
    title: 'Доступна новая версия кабинета',
    body: `Docker-образ ${shortRevision} готов. Обновите кабинет через cabinetctl.`,
    entityType: 'release',
    entityId: remoteRevision,
    telegram: {
      text: [
        '<b>Доступна новая версия кабинета</b>',
        '',
        `Docker-образ <code>${shortRevision}</code> готов.`,
        'Запустите обновление кабинета через cabinetctl.',
      ].join('\n'),
    },
  })
  return notification ? 'created' : 'duplicate'
}

async function checkConsoleRelease(repository: string, branch: string) {
  const installedVersion = await readInstalledConsoleVersion()
  if (!installedVersion) return 'skipped'

  const remoteVersion = await latestConsoleVersion(repository, branch)
  if (!remoteVersion || !isNewerVersion(remoteVersion, installedVersion)) return 'current'

  const notification = await createAdminNotification({
    type: 'release',
    severity: 'INFO',
    dedupeKey: `admin:release:cabinetctl:${remoteVersion}`,
    title: `Доступна новая версия cabinetctl ${remoteVersion}`,
    body: `Выпущена cabinetctl v${remoteVersion}. Обновите консоль через пункт 9.`,
    entityType: 'release',
    entityId: `cabinetctl:${remoteVersion}`,
    telegram: {
      text: [
        `<b>Доступна новая версия cabinetctl v${remoteVersion}</b>`,
        '',
        'Обновите управляющую консоль через пункт 9 в cabinetctl.',
      ].join('\n'),
    },
  })
  return notification ? 'created' : 'duplicate'
}

async function latestBranchRevision(repository: string, branch: string) {
  const response = await releaseFetch(`https://github.com/${repository}/commits/${branch}.atom`)
  if (!response.ok) return null
  const match = (await response.text()).match(/Grit::Commit\/([0-9a-f]{40})/i)
  return normalizedSha(match?.[1] || '')
}

async function ghcrImageExists(repository: string, revision: string) {
  const params = new URLSearchParams({
    service: 'ghcr.io',
    scope: `repository:${repository}:pull`,
  })
  const tokenResponse = await releaseFetch(`https://ghcr.io/token?${params}`)
  if (!tokenResponse.ok) return false
  const token = (await tokenResponse.json() as { token?: string }).token
  if (!token) return false

  const manifest = await releaseFetch(`https://ghcr.io/v2/${repository}/manifests/sha-${revision}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: [
        'application/vnd.oci.image.index.v1+json',
        'application/vnd.docker.distribution.manifest.list.v2+json',
        'application/vnd.oci.image.manifest.v1+json',
        'application/vnd.docker.distribution.manifest.v2+json',
      ].join(', '),
    },
  })
  return manifest.ok
}

async function latestConsoleVersion(repository: string, branch: string) {
  const response = await releaseFetch(`https://raw.githubusercontent.com/${repository}/${branch}/deploy/cabinetctl.sh`)
  if (!response.ok) return null
  const match = (await response.text()).match(/^VERSION="(\d+\.\d+\.\d+)"$/m)
  return match?.[1] && VERSION_PATTERN.test(match[1]) ? match[1] : null
}

async function readInstalledConsoleVersion() {
  try {
    const version = (await readFile(
      env('CABINETCTL_BUNDLED_VERSION_FILE') || DEFAULT_CONSOLE_VERSION_FILE,
      'utf8'
    )).trim()
    return VERSION_PATTERN.test(version) ? version : null
  } catch {
    return null
  }
}

function isNewerVersion(candidate: string, current: string) {
  const candidateParts = candidate.split('.').map(Number)
  const currentParts = current.split('.').map(Number)
  for (let index = 0; index < 3; index += 1) {
    if (candidateParts[index] !== currentParts[index]) {
      return candidateParts[index]! > currentParts[index]!
    }
  }
  return false
}

function normalizedSha(value: string) {
  return SHA_PATTERN.test(value) ? value.toLowerCase() : null
}

function env(name: string) {
  return process.env[name]?.trim() || ''
}

function releaseFetch(url: string, init?: RequestInit) {
  return fetch(url, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
    headers: {
      'User-Agent': 'remnawave-cabinet-release-monitor',
      ...init?.headers,
    },
  })
}

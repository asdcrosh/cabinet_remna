import { readFile, readdir } from 'fs/promises'
import { join } from 'path'
import { prisma } from '@/lib/prisma'

export type DeploymentResultStatus = 'deploying' | 'success' | 'failed' | 'rolled_back'

export interface BuildInfo {
  revision: string | null
  createdAt: string | null
  image: string | null
}

export interface DeploymentState {
  status: DeploymentResultStatus
  startedAt?: string
  finishedAt?: string
  previousRevision?: string
  targetRevision?: string
  deployedRevision?: string
  rollbackRevision?: string
  message?: string
  migrations?: 'pending' | 'ok' | 'error'
  health?: {
    local?: 'pending' | 'ok' | 'error'
    public?: 'pending' | 'ok' | 'error' | 'skipped'
  }
}

export interface MigrationState {
  status: 'ok' | 'error' | 'unknown'
  expected: number
  applied: number
  latestExpected: string | null
  latestApplied: string | null
  failed: string[]
  missing: string[]
  details?: string
}

export interface DeploymentHealthSnapshot {
  build: BuildInfo
  remoteRevision: string | null
  remoteError?: string
  deployment: DeploymentState | null
  migration: MigrationState
}

const SHA_PATTERN = /^[0-9a-f]{40}$/i
const REMOTE_CACHE_MS = 10 * 60 * 1000
let remoteCache: { expiresAt: number; revision: string | null; error?: string } | null = null

function value(name: string) {
  return process.env[name]?.trim() || ''
}

function validRevision(raw: string) {
  return SHA_PATTERN.test(raw) ? raw.toLowerCase() : null
}

export function getBuildInfo(): BuildInfo {
  return {
    revision: validRevision(value('APP_BUILD_REVISION')),
    createdAt: value('APP_BUILD_CREATED_AT') || null,
    image: value('APP_IMAGE_REFERENCE') || null,
  }
}

export async function readDeploymentState(): Promise<DeploymentState | null> {
  const stateFile = value('DEPLOY_STATE_FILE') || '/run/cabinet-state/deployment.json'
  try {
    const parsed = JSON.parse(await readFile(stateFile, 'utf8')) as Partial<DeploymentState>
    if (!['deploying', 'success', 'failed', 'rolled_back'].includes(parsed.status || '')) return null
    return parsed as DeploymentState
  } catch {
    return null
  }
}

async function getRemoteRevision() {
  if (remoteCache && remoteCache.expiresAt > Date.now()) return remoteCache

  const repository = value('CABINET_RELEASE_REPOSITORY') || 'asdcrosh/cabinet_remna'
  const branch = value('CABINET_RELEASE_BRANCH') || 'main'
  try {
    const params = new URLSearchParams({ branch, status: 'success', per_page: '1' })
    const response = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/docker-image.yml/runs?${params}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'remnawave-cabinet-health' },
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) throw new Error(`GitHub вернул HTTP ${response.status}`)
    const data = await response.json() as { workflow_runs?: Array<{ head_sha?: string }> }
    const revision = validRevision(data.workflow_runs?.[0]?.head_sha || '')
    if (!revision) throw new Error('Успешная сборка latest пока не найдена')
    remoteCache = { revision, expiresAt: Date.now() + REMOTE_CACHE_MS }
  } catch (error) {
    remoteCache = {
      revision: null,
      error: error instanceof Error ? error.message : 'Не удалось проверить GitHub',
      expiresAt: Date.now() + REMOTE_CACHE_MS,
    }
  }
  return remoteCache
}

interface PrismaMigrationRow {
  migration_name: string
  finished_at: Date | null
  rolled_back_at: Date | null
}

export async function getMigrationState(): Promise<MigrationState> {
  try {
    const [entries, rows] = await Promise.all([
      readdir(join(process.cwd(), 'prisma', 'migrations'), { withFileTypes: true }),
      prisma.$queryRaw<PrismaMigrationRow[]>`
        SELECT migration_name, finished_at, rolled_back_at
        FROM "_prisma_migrations"
        ORDER BY started_at ASC
      `,
    ])
    const expected = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
    const applied = rows.filter((row) => row.finished_at && !row.rolled_back_at).map((row) => row.migration_name)
    const failed = rows.filter((row) => !row.finished_at && !row.rolled_back_at).map((row) => row.migration_name)
    const appliedSet = new Set(applied)
    const missing = expected.filter((migration) => !appliedSet.has(migration))

    return {
      status: failed.length > 0 || missing.length > 0 ? 'error' : 'ok',
      expected: expected.length,
      applied: applied.length,
      latestExpected: expected.at(-1) || null,
      latestApplied: applied.at(-1) || null,
      failed,
      missing,
    }
  } catch (error) {
    return {
      status: 'unknown',
      expected: 0,
      applied: 0,
      latestExpected: null,
      latestApplied: null,
      failed: [],
      missing: [],
      details: error instanceof Error ? error.message : 'Не удалось проверить миграции',
    }
  }
}

export async function getDeploymentHealthSnapshot(): Promise<DeploymentHealthSnapshot> {
  const [remote, deployment, migration] = await Promise.all([
    getRemoteRevision(),
    readDeploymentState(),
    getMigrationState(),
  ])
  return {
    build: getBuildInfo(),
    remoteRevision: remote.revision,
    remoteError: remote.error,
    deployment,
    migration,
  }
}

export function resetDeploymentHealthCacheForTests() {
  remoteCache = null
}

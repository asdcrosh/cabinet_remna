import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  readdir: vi.fn(),
  queryRaw: vi.fn(),
}))

vi.mock('fs/promises', () => ({
  readFile: mocks.readFile,
  readdir: mocks.readdir,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { $queryRaw: mocks.queryRaw },
}))

import {
  getBuildInfo,
  getDeploymentHealthSnapshot,
  getMigrationState,
  readDeploymentState,
  resetDeploymentHealthCacheForTests,
} from './deployment-health'

beforeEach(() => {
  mocks.readFile.mockReset()
  mocks.readdir.mockReset()
  mocks.queryRaw.mockReset()
  delete process.env.APP_BUILD_REVISION
  delete process.env.APP_BUILD_CREATED_AT
  delete process.env.APP_IMAGE_REFERENCE
  delete process.env.DEPLOY_STATE_FILE
  resetDeploymentHealthCacheForTests()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('deployment health', () => {
  it('returns build metadata embedded into the image', () => {
    process.env.APP_BUILD_REVISION = 'a'.repeat(40)
    process.env.APP_BUILD_CREATED_AT = '2026-08-09T12:00:00Z'
    process.env.APP_IMAGE_REFERENCE = 'ghcr.io/asdcrosh/cabinet_remna:latest'

    expect(getBuildInfo()).toEqual({
      revision: 'a'.repeat(40),
      createdAt: '2026-08-09T12:00:00Z',
      image: 'ghcr.io/asdcrosh/cabinet_remna:latest',
    })
  })

  it('detects missing and failed Prisma migrations', async () => {
    mocks.readdir.mockResolvedValue([
      { name: '001_initial', isDirectory: () => true },
      { name: '002_payments', isDirectory: () => true },
      { name: 'migration_lock.toml', isDirectory: () => false },
    ])
    mocks.queryRaw.mockResolvedValue([
      { migration_name: '001_initial', finished_at: new Date(), rolled_back_at: null },
      { migration_name: 'broken', finished_at: null, rolled_back_at: null },
    ])

    const state = await getMigrationState()

    expect(state.status).toBe('error')
    expect(state.missing).toEqual(['002_payments'])
    expect(state.failed).toEqual(['broken'])
  })

  it('reads the atomic deployment result written by update-server', async () => {
    mocks.readFile.mockResolvedValue(JSON.stringify({
      status: 'rolled_back',
      rollbackRevision: 'b'.repeat(40),
      message: 'Health-check failed',
    }))

    await expect(readDeploymentState()).resolves.toMatchObject({
      status: 'rolled_back',
      rollbackRevision: 'b'.repeat(40),
    })
  })

  it('uses the latest successful Docker workflow as the available image revision', async () => {
    const revision = 'c'.repeat(40)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ workflow_runs: [{ head_sha: revision }] }),
    }))
    mocks.readFile.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }))
    mocks.readdir.mockResolvedValue([])
    mocks.queryRaw.mockResolvedValue([])

    const snapshot = await getDeploymentHealthSnapshot()

    expect(snapshot.remoteRevision).toBe(revision)
  })
})

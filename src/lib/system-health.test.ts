import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  paymentCount: vi.fn(),
  provisioningJobCount: vi.fn(),
  paymentEventCount: vi.fn(),
  broadcastCount: vi.fn(),
  syncCount: vi.fn(),
  watchIncidentCount: vi.fn(),
  watchNodeCount: vi.fn(),
  watchRuntime: vi.fn(),
  getWorkerHeartbeat: vi.fn(),
}))

vi.mock('fs/promises', () => ({
  readdir: vi.fn().mockResolvedValue(['remna-full-backup-test.tar.gz']),
  stat: vi.fn().mockResolvedValue({ mtime: new Date(), size: 10 * 1024 * 1024 }),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    payment: { count: mocks.paymentCount },
    provisioningJob: { count: mocks.provisioningJobCount },
    paymentEvent: { count: mocks.paymentEventCount },
    broadcastDelivery: { count: mocks.broadcastCount },
    syncEvent: { count: mocks.syncCount },
    watchIncident: { count: mocks.watchIncidentCount },
    watchNodeState: { count: mocks.watchNodeCount },
    watchRuntimeState: { findUnique: mocks.watchRuntime },
  },
}))
vi.mock('@/lib/remnawave', () => ({ remnawave: { getInternalSquads: vi.fn().mockResolvedValue([]) } }))
vi.mock('@/lib/job-health', () => ({
  getProvisioningQueueHealth: vi.fn().mockResolvedValue({ ok: true, pending: 0, failed: 0, staleRunning: 0 }),
}))
vi.mock('@/lib/payment-settings', () => ({
  getResolvedPaymentProviderSettings: vi.fn().mockResolvedValue({
    yookassa: { enabled: false },
    payAnyWay: { enabled: false },
    platega: { enabled: false },
  }),
}))
vi.mock('@/lib/platega', () => ({ checkPlategaConnection: vi.fn() }))
vi.mock('@/lib/remnashop-sync', () => ({
  getRemnashopIntegrationStatus: vi.fn().mockResolvedValue({ state: 'READY', message: 'Подключено' }),
}))
vi.mock('@/lib/watch-config', () => ({
  getWatchConfig: () => ({ enabled: true, intervalSeconds: 60 }),
}))
vi.mock('@/lib/worker-health', () => ({ getWorkerHeartbeat: mocks.getWorkerHeartbeat }))
vi.mock('@/lib/deployment-health', () => ({
  getDeploymentHealthSnapshot: vi.fn().mockResolvedValue({
    build: {
      revision: '1111111111111111111111111111111111111111',
      createdAt: '2026-08-09T12:00:00Z',
      image: 'ghcr.io/asdcrosh/cabinet_remna:latest',
    },
    remoteRevision: '1111111111111111111111111111111111111111',
    deployment: {
      status: 'success',
      deployedRevision: '1111111111111111111111111111111111111111',
      health: { local: 'ok', public: 'ok' },
    },
    migration: {
      status: 'ok',
      expected: 12,
      applied: 12,
      latestExpected: 'latest',
      latestApplied: 'latest',
      failed: [],
      missing: [],
    },
  }),
}))

import { getSystemHealth } from './system-health'

beforeEach(() => {
  mocks.queryRaw.mockReset().mockResolvedValue([{ ok: 1 }])
  mocks.paymentCount.mockReset().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
    if (where.status === 'SUCCEEDED' && 'subscriptionProvisionedAt' in where) return 0
    if (where.status === 'SUCCEEDED') return 4
    if (where.status === 'PENDING' && where.createdAt && 'lt' in (where.createdAt as object)) return 0
    if (where.status === 'PENDING') return 1
    return 0
  })
  mocks.provisioningJobCount.mockReset().mockResolvedValue(0)
  mocks.paymentEventCount.mockReset().mockResolvedValue(0)
  mocks.broadcastCount.mockReset().mockResolvedValue(0)
  mocks.syncCount.mockReset().mockResolvedValue(0)
  mocks.watchIncidentCount.mockReset().mockResolvedValue(0)
  mocks.watchNodeCount.mockReset().mockImplementation(({ where }: { where?: { status?: string } } = {}) => {
    if (where?.status) return 0
    return 5
  })
  mocks.watchRuntime.mockReset().mockResolvedValue({ lastRunAt: new Date(), status: 'HEALTHY' })
  mocks.getWorkerHeartbeat.mockReset().mockResolvedValue({
    resetAt: new Date(Date.now() + 180_000),
    updatedAt: new Date(),
  })
  for (const key of [
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_NOTIFY_CHAT_ID',
    'EMAIL_VERIFICATION_WEBHOOK_URL',
    'EMAIL_VERIFICATION_WEBHOOK_SECRET',
    'REMNAWAVE_BASE_URL',
    'REMNAWAVE_TOKEN',
  ]) delete process.env[key]
  process.env.REMNAWAVE_BASE_URL = 'https://panel.example.com'
  process.env.REMNAWAVE_TOKEN = 'token'
})

afterEach(() => {
  delete process.env.REMNAWAVE_BASE_URL
  delete process.env.REMNAWAVE_TOKEN
})

describe('getSystemHealth', () => {
  it('returns every operational category on one report', async () => {
    const report = await getSystemHealth()
    const categories = new Set(report.checks.map((item) => item.category))

    expect(categories).toEqual(new Set([
      'deployment',
      'core',
      'payments',
      'sync',
      'workers',
      'communications',
      'watch',
      'backups',
    ]))
    expect(report.checks.find((item) => item.id === 'payment-overview')?.metrics).toEqual([
      { label: 'Успешно', value: '4', tone: 'positive' },
      { label: 'Ожидают', value: '1', tone: 'warning' },
      { label: 'Отменено', value: '0' },
      { label: 'Возвраты', value: '0' },
      { label: 'Довыдача', value: '0', tone: 'neutral' },
      { label: 'Ошибки цепочки', value: '0', tone: 'neutral' },
    ])
  })

  it('marks a stopped worker as a critical error', async () => {
    mocks.getWorkerHeartbeat.mockResolvedValue({
      resetAt: new Date(Date.now() - 1_000),
      updatedAt: new Date(Date.now() - 300_000),
    })

    const report = await getSystemHealth()

    expect(report.checks.find((item) => item.id === 'payment-worker')?.status).toBe('error')
    expect(report.ok).toBe(false)
  })
})

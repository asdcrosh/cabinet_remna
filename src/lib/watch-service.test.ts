import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  deleteIncidents: vi.fn(),
  deleteNodes: vi.fn(),
  deleteProbes: vi.fn(),
  getNodes: vi.fn(),
  getHosts: vi.fn(),
  runtimeFind: vi.fn(),
  runtimeUpsert: vi.fn(),
  runtimeUpdate: vi.fn(),
  sendAlerts: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    $transaction: (operations: Array<Promise<unknown>>) => Promise.all(operations),
    watchIncident: {
      deleteMany: mocks.deleteIncidents,
      findFirst: vi.fn(),
    },
    watchNodeState: { deleteMany: mocks.deleteNodes },
    watchProbe: { deleteMany: mocks.deleteProbes },
    watchRuntimeState: {
      findUnique: mocks.runtimeFind,
      upsert: mocks.runtimeUpsert,
      update: mocks.runtimeUpdate,
    },
  },
}))
vi.mock('./remnawave', () => ({
  remnawave: { getNodes: mocks.getNodes, getHosts: mocks.getHosts },
}))
vi.mock('./watch-config', () => ({
  getWatchConfig: () => ({
    enabled: true,
    intervalSeconds: 60,
    timeoutMs: 1_000,
    probeAttempts: 1,
    failureThreshold: 2,
    recoveryThreshold: 2,
    retentionDays: 7,
    telegramChatId: null,
  }),
}))
vi.mock('./watch-alerts', () => ({ sendWatchAlerts: mocks.sendAlerts }))
vi.mock('./watch-probes', () => ({ checkRemnawaveNode: vi.fn() }))
vi.mock('./distributed-lock', () => ({
  withDistributedLock: async (_key: string, callback: () => Promise<unknown>) => ({
    acquired: true,
    value: await callback(),
  }),
}))
vi.mock('./logger', () => ({ logError: vi.fn(), logInfo: vi.fn(), logWarn: vi.fn() }))

import { runWatchCycle, syncWatchNodeInventory } from './watch-service'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.deleteIncidents.mockResolvedValue({ count: 0 })
  mocks.deleteNodes.mockResolvedValue({ count: 0 })
  mocks.deleteProbes.mockResolvedValue({ count: 0 })
  mocks.getHosts.mockResolvedValue({ response: [] })
  mocks.runtimeFind.mockResolvedValue(null)
  mocks.runtimeUpsert.mockResolvedValue({})
  mocks.runtimeUpdate.mockResolvedValue({})
  mocks.sendAlerts.mockResolvedValue(undefined)
})

describe('syncWatchNodeInventory', () => {
  it('removes node state and incidents absent from the current Remnawave inventory', async () => {
    mocks.deleteNodes.mockResolvedValue({ count: 2 })
    mocks.deleteIncidents.mockResolvedValue({ count: 3 })

    await expect(syncWatchNodeInventory(['node-current', 'node-current'])).resolves.toBe(2)

    expect(mocks.deleteNodes).toHaveBeenCalledWith({
      where: { nodeUuid: { notIn: ['node-current'] } },
    })
    expect(mocks.deleteIncidents).toHaveBeenCalledWith({
      where: {
        OR: [
          { nodeUuid: { notIn: ['node-current'] } },
          { nodeUuid: null, nodeName: { not: null } },
        ],
      },
    })
  })

  it('clears all node-specific Watch data when Remnawave has no nodes', async () => {
    await syncWatchNodeInventory([])

    expect(mocks.deleteNodes).toHaveBeenCalledWith()
    expect(mocks.deleteIncidents).toHaveBeenCalledWith({
      where: {
        OR: [
          { nodeUuid: { not: null } },
          { nodeUuid: null, nodeName: { not: null } },
        ],
      },
    })
  })
})

describe('runWatchCycle inventory safety', () => {
  it('does not delete local nodes when the panel returns a malformed inventory', async () => {
    mocks.getNodes.mockResolvedValue({ response: null })

    await expect(runWatchCycle('manual')).rejects.toThrow('некорректный список нод')

    expect(mocks.deleteNodes).not.toHaveBeenCalled()
    expect(mocks.deleteIncidents).not.toHaveBeenCalled()
  })

  it('cleans stale data after a successful empty inventory response', async () => {
    mocks.getNodes.mockResolvedValue({ response: [] })

    await expect(runWatchCycle('manual')).resolves.toMatchObject({
      acquired: true,
      result: { nodes: 0, removedNodes: 0, networkStatus: 'UNKNOWN' },
    })

    expect(mocks.deleteNodes).toHaveBeenCalledOnce()
    expect(mocks.deleteProbes).toHaveBeenCalledOnce()
  })
})

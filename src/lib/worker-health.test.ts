import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  findUnique: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    rateLimitBucket: {
      upsert: mocks.upsert,
      findUnique: mocks.findUnique,
    },
  },
}))

import {
  BROADCAST_WORKER_HEARTBEAT_KEY,
  WATCH_WORKER_HEARTBEAT_KEY,
  getWorkerHeartbeat,
  recordWorkerHeartbeat,
} from './worker-health'

beforeEach(() => {
  mocks.upsert.mockReset().mockResolvedValue(null)
  mocks.findUnique.mockReset().mockResolvedValue(null)
})

describe('worker health', () => {
  it('records an expiring heartbeat for every worker type', async () => {
    const before = Date.now()
    await recordWorkerHeartbeat('watch', 240)

    expect(mocks.upsert).toHaveBeenCalledOnce()
    const input = mocks.upsert.mock.calls[0]?.[0]
    expect(input.where.key).toBe(WATCH_WORKER_HEARTBEAT_KEY)
    expect(input.create.resetAt.getTime()).toBeGreaterThanOrEqual(before + 239_000)
  })

  it('reads the heartbeat by its stable database key', async () => {
    await getWorkerHeartbeat('broadcast')

    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { key: BROADCAST_WORKER_HEARTBEAT_KEY },
      select: { resetAt: true, updatedAt: true },
    })
  })
})

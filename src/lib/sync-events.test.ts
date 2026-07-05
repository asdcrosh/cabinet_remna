import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    syncEvent: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}))

vi.mock('./prisma', () => ({ prisma: mocks.prisma }))

import { markSyncFailed, markSyncSkipped, markSyncSucceeded } from './sync-events'

const input = {
  direction: 'CABINET_TO_REMNASHOP' as const,
  entityType: 'payment',
  entityId: 'pay-1',
  operation: 'upsert',
}

describe('sync events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.syncEvent.findUnique.mockResolvedValue(null)
    mocks.prisma.syncEvent.upsert.mockResolvedValue({})
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-04T10:00:00.000Z'))
  })

  it('records successful sync', async () => {
    await markSyncSucceeded(input)

    expect(mocks.prisma.syncEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          direction_entityType_entityId_operation: input,
        },
        create: expect.objectContaining({
          ...input,
          status: 'SUCCEEDED',
          lastError: null,
        }),
        update: expect.objectContaining({
          status: 'SUCCEEDED',
          lastError: null,
          nextRetryAt: null,
        }),
      })
    )
  })

  it('records skipped sync reason', async () => {
    await markSyncSkipped(input, 'not configured')

    expect(mocks.prisma.syncEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: 'SKIPPED',
          lastError: 'not configured',
        }),
      })
    )
  })

  it('records failed sync with retry time', async () => {
    await markSyncFailed(input, new Error('boom'))

    expect(mocks.prisma.syncEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: 'FAILED',
          attempts: 1,
          lastError: 'boom',
          nextRetryAt: new Date('2026-07-04T10:02:00.000Z'),
        }),
        update: expect.objectContaining({
          status: 'FAILED',
          attempts: 1,
          lastError: 'boom',
          nextRetryAt: new Date('2026-07-04T10:02:00.000Z'),
        }),
      })
    )
  })

  it('backs off from the stored attempts count', async () => {
    mocks.prisma.syncEvent.findUnique.mockResolvedValue({ attempts: 5 })

    await markSyncFailed(input, new Error('boom'))

    expect(mocks.prisma.syncEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          attempts: 6,
          nextRetryAt: new Date('2026-07-04T11:04:00.000Z'),
        }),
      })
    )
  })
})

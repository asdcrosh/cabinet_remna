import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const prisma = {
    broadcastDelivery: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    broadcastCampaign: {
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  }
  return {
    prisma,
    notifyUser: vi.fn(),
    logError: vi.fn(),
    logInfo: vi.fn(),
  }
})

vi.mock('./prisma', () => ({ prisma: mocks.prisma }))
vi.mock('./notifications', () => ({ notifyUser: mocks.notifyUser }))
vi.mock('./logger', () => ({ logError: mocks.logError, logInfo: mocks.logInfo }))

import { processBroadcastDeliveryBatch } from './broadcast-delivery'

describe('processBroadcastDeliveryBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.broadcastDelivery.findMany.mockResolvedValue([])
    mocks.prisma.broadcastDelivery.updateMany.mockResolvedValue({ count: 1 })
    mocks.prisma.broadcastDelivery.update.mockResolvedValue({})
    mocks.prisma.broadcastCampaign.update.mockResolvedValue({})
    mocks.prisma.$transaction.mockImplementation(async (items: Array<Promise<unknown>>) => Promise.all(items))
    mocks.notifyUser.mockResolvedValue({ telegram: 'sent', email: 'skipped' })
  })

  it('claims pending deliveries and marks successful notifications as sent', async () => {
    const delivery = makeDelivery()
    mocks.prisma.broadcastDelivery.findMany.mockResolvedValue([delivery])

    const result = await processBroadcastDeliveryBatch({ batchSize: 1, maxAttempts: 3 })

    expect(result).toEqual({ processed: 1, succeeded: 1, failed: 0 })
    expect(mocks.prisma.broadcastDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: delivery.id, status: 'PENDING', attempts: 0 },
        data: expect.objectContaining({ status: 'PROCESSING', attempts: { increment: 1 } }),
      })
    )
    expect(mocks.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        type: 'BROADCAST',
        dedupeKey: 'broadcast-1:user-1',
        title: 'Hello',
      })
    )
    expect(mocks.prisma.broadcastDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: delivery.id },
        data: expect.objectContaining({ status: 'SUCCEEDED', lastError: null, lockedAt: null }),
      })
    )
    expect(mocks.prisma.broadcastCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: delivery.campaignId },
        data: expect.objectContaining({ telegramSent: { increment: 1 } }),
      })
    )
  })

  it('requeues failed deliveries until max attempts', async () => {
    const delivery = makeDelivery()
    mocks.prisma.broadcastDelivery.findMany.mockResolvedValue([delivery])
    mocks.notifyUser.mockRejectedValue(new Error('telegram failed'))

    const result = await processBroadcastDeliveryBatch({ batchSize: 1, maxAttempts: 3 })

    expect(result).toEqual({ processed: 1, succeeded: 0, failed: 1 })
    expect(mocks.prisma.broadcastDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: delivery.id },
        data: expect.objectContaining({
          status: 'PENDING',
          lastError: 'telegram failed',
          lockedAt: null,
        }),
      })
    )
    expect(mocks.logError).toHaveBeenCalledWith(
      'broadcast.delivery_failed',
      expect.any(Error),
      { deliveryId: delivery.id, campaignId: delivery.campaignId }
    )
  })
})

function makeDelivery() {
  return {
    id: 'delivery-1',
    campaignId: 'campaign-1',
    userId: 'user-1',
    status: 'PENDING',
    attempts: 0,
    payload: {
      userId: 'user-1',
      dedupeKey: 'broadcast-1:user-1',
      title: 'Hello',
      body: 'Body',
      inApp: true,
      telegramText: 'Hello',
    },
    lastError: null,
    lockedAt: null,
    sentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

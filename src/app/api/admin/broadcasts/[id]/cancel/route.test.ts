import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  campaignFindUnique: vi.fn(),
  deliveryUpdateMany: vi.fn(),
  deliveryCount: vi.fn(),
  writeAuditLog: vi.fn(),
}))

vi.mock('@/lib/auth/guard', () => ({
  requireAdmin: mocks.requireAdmin,
  withAuth: (handler: (...args: never[]) => unknown) => handler,
}))
vi.mock('@/lib/feature-flags', () => ({ isFeatureEnabled: vi.fn(async () => true) }))
vi.mock('@/lib/audit-log', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    broadcastCampaign: { findUnique: mocks.campaignFindUnique },
    $transaction: (callback: (tx: unknown) => unknown) => callback({
      broadcastDelivery: {
        updateMany: mocks.deliveryUpdateMany,
        count: mocks.deliveryCount,
      },
    }),
  },
}))

import { POST } from './route'

describe('cancel broadcast queue route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ uid: 'admin-1', role: 'ADMIN' })
    mocks.campaignFindUnique.mockResolvedValue({ id: 'campaign-1', title: 'Важная новость' })
    mocks.deliveryUpdateMany.mockResolvedValue({ count: 17 })
    mocks.deliveryCount.mockResolvedValue(2)
  })

  it('cancels pending and failed deliveries but leaves in-flight work visible', async () => {
    const request = new Request('https://cabinet.example/api/admin/broadcasts/campaign-1/cancel', { method: 'POST' })
    const response = await POST(request, { params: Promise.resolve({ id: 'campaign-1' }) })

    expect(response.status).toBe(200)
    expect(mocks.deliveryUpdateMany).toHaveBeenCalledWith({
      where: { campaignId: 'campaign-1', status: { in: ['PENDING', 'FAILED'] } },
      data: { status: 'CANCELED', lockedAt: null },
    })
    await expect(response.json()).resolves.toEqual({ ok: true, canceled: 17, inFlight: 2 })
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'admin-1',
      action: 'ADMIN_BROADCAST_CANCELED',
      metadata: expect.objectContaining({ campaignId: 'campaign-1', canceled: 17, inFlight: 2 }),
    }))
  })

  it('returns 404 for an unknown campaign without changing the queue', async () => {
    mocks.campaignFindUnique.mockResolvedValue(null)
    const response = await POST(
      new Request('https://cabinet.example/api/admin/broadcasts/missing/cancel', { method: 'POST' }),
      { params: Promise.resolve({ id: 'missing' }) }
    )

    expect(response.status).toBe(404)
    expect(mocks.deliveryUpdateMany).not.toHaveBeenCalled()
  })
})

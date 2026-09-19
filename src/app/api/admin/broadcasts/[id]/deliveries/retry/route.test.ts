import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  campaignFindUnique: vi.fn(),
  deliveryUpdateMany: vi.fn(),
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
    broadcastDelivery: { updateMany: mocks.deliveryUpdateMany },
  },
}))

import { POST } from './route'

describe('retry failed broadcast deliveries route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ uid: 'admin-1', role: 'ADMIN' })
    mocks.campaignFindUnique.mockResolvedValue({ id: 'campaign-1', title: 'Новость' })
    mocks.deliveryUpdateMany.mockResolvedValue({ count: 4 })
  })

  it('requeues only definitive failures and resets their attempt budget', async () => {
    const request = new Request('https://cabinet.example/api/admin/broadcasts/campaign-1/deliveries/retry', { method: 'POST' })
    const response = await POST(request, { params: Promise.resolve({ id: 'campaign-1' }) })

    expect(response.status).toBe(200)
    expect(mocks.deliveryUpdateMany).toHaveBeenCalledWith({
      where: { campaignId: 'campaign-1', status: 'FAILED' },
      data: { status: 'PENDING', attempts: 0, lastError: null, lockedAt: null },
    })
    await expect(response.json()).resolves.toEqual({ ok: true, retried: 4 })
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ADMIN_BROADCAST_RETRIED',
      metadata: expect.objectContaining({ campaignId: 'campaign-1', retried: 4 }),
    }))
  })
})

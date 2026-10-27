import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), findMany: vi.fn() }))
vi.mock('@/lib/auth/guard', () => ({ withAuth: (handler: unknown) => handler, requireAdmin: mocks.requireAdmin }))
vi.mock('@/lib/prisma', () => ({ prisma: { payment: { findMany: mocks.findMany } } }))

import { GET } from './route'

describe('GET /api/admin/payments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ uid: 'admin-1' })
  })

  it('returns payments with whitelist reward balances and future nested BigInt fields', async () => {
    mocks.findMany.mockResolvedValue([{
      id: 'payment-1', checkoutKey: 'private-checkout-key', createdAt: new Date('2026-10-27T20:00:00Z'),
      amountKopecks: 19900, status: 'SUCCEEDED',
      plan: { id: 'plan-1', futureCounter: 9007199254740993n },
      subscription: {
        id: 'subscription-1', trafficLimitBytes: null, trafficUsedBytes: 0n, lifetimeUsedBytes: 0n,
        whitelistAddonRemainingSeconds: null, whitelistAddonRewardSeconds: 259200n,
        whitelistAddonInternalSquads: ['internal-squad'], planManagedByCabinet: true,
      },
    }])
    const response = await GET(new Request('http://localhost/api/admin/payments'))
    const body = await response.json()

    expect(mocks.requireAdmin).toHaveBeenCalledOnce()
    expect(response.status).toBe(200)
    expect(body.payments[0].subscription.whitelistAddonRewardSeconds).toBe('259200')
    expect(body.payments[0].plan.futureCounter).toBe('9007199254740993')
    expect(body.payments[0].amountKopecks).toBe(19900)
    expect(body.payments[0].createdAt).toBe('2026-10-27T20:00:00.000Z')
    expect(body.payments[0]).not.toHaveProperty('checkoutKey')
    expect(body.payments[0].subscription).not.toHaveProperty('whitelistAddonInternalSquads')
    expect(body.payments[0].subscription).not.toHaveProperty('planManagedByCabinet')
    expect(body.pagination).toEqual({ pageSize: 100, nextCursor: null })
  })

  it('does not query payments before administrator authorization succeeds', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('Forbidden'))
    await expect(GET(new Request('http://localhost/api/admin/payments'))).rejects.toThrow('Forbidden')
    expect(mocks.findMany).not.toHaveBeenCalled()
  })
})

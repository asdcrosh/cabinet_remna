import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  syncRemnashopCatalog: vi.fn(),
  syncRemnashopPaymentsToCabinet: vi.fn(),
  syncRemnashopUserBySourceId: vi.fn(),
  markSyncFailed: vi.fn(),
  markSyncSucceeded: vi.fn(),
}))

vi.mock('@/lib/remnashop-sync', () => ({
  syncRemnashopCatalog: mocks.syncRemnashopCatalog,
  syncRemnashopPaymentsToCabinet: mocks.syncRemnashopPaymentsToCabinet,
}))
vi.mock('@/lib/remnashop-users', () => ({
  syncRemnashopUserBySourceId: mocks.syncRemnashopUserBySourceId,
}))
vi.mock('@/lib/sync-events', () => ({
  markSyncFailed: mocks.markSyncFailed,
  markSyncSucceeded: mocks.markSyncSucceeded,
}))

import { POST } from './route'

const originalSecret = process.env.REMNASHOP_WEBHOOK_SECRET

function request(body: Record<string, unknown>, secret = 'test-remnashop-webhook-secret-32-characters') {
  return new Request('https://cabinet.example/api/integrations/remnashop/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('Remnashop events endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.REMNASHOP_WEBHOOK_SECRET = 'test-remnashop-webhook-secret-32-characters'
    mocks.syncRemnashopPaymentsToCabinet.mockResolvedValue({
      total: 1,
      created: 0,
      updated: 1,
      skipped: 0,
      blocked: 0,
      failed: 0,
    })
    mocks.syncRemnashopUserBySourceId.mockResolvedValue({
      found: true,
      remnashopUserId: 42,
      userAction: 'updated',
      subscriptionAction: 'synced',
    })
  })

  afterEach(() => {
    if (originalSecret == null) delete process.env.REMNASHOP_WEBHOOK_SECRET
    else process.env.REMNASHOP_WEBHOOK_SECRET = originalSecret
  })

  it('rejects an invalid secret', async () => {
    const response = await POST(request({ event: 'payment.updated', paymentId: 'pay-1' }, 'wrong'))

    expect(response.status).toBe(401)
    expect(mocks.syncRemnashopPaymentsToCabinet).not.toHaveBeenCalled()
  })

  it('updates one payment immediately', async () => {
    const response = await POST(request({ event: 'payment.refunded', paymentId: 'pay-1' }))

    expect(response.status).toBe(200)
    expect(mocks.syncRemnashopPaymentsToCabinet).toHaveBeenCalledWith({ paymentId: 'pay-1' })
  })

  it('updates one user immediately', async () => {
    const response = await POST(request({ event: 'user.updated', userId: 42 }))

    expect(response.status).toBe(200)
    expect(mocks.syncRemnashopUserBySourceId).toHaveBeenCalledWith(42, {
      forceRemnawaveSubscriptions: true,
    })
  })
})

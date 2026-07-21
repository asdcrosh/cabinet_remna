import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  syncPaymentProvisioning: vi.fn(),
  getPendingPaymentTtlMs: vi.fn(),
  writeAuditLog: vi.fn(),
}))

vi.mock('@/lib/auth/guard', () => ({
  requireAdmin: mocks.requireAdmin,
  withAuth: (handler: (...args: any[]) => Promise<Response>) => handler,
}))
vi.mock('@/lib/payment-sync', () => ({
  syncPaymentProvisioning: mocks.syncPaymentProvisioning,
  getPendingPaymentTtlMs: mocks.getPendingPaymentTtlMs,
}))
vi.mock('@/lib/audit-log', () => ({ writeAuditLog: mocks.writeAuditLog }))

import { POST } from './route'

function syncRequest(body: Record<string, unknown>) {
  return new Request('https://cabinet.example/api/admin/payment-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('admin payment sync route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ uid: 'admin-1' })
    mocks.getPendingPaymentTtlMs.mockReturnValue(600_000)
  })

  it('checks pending payments automatically without filling the audit log', async () => {
    mocks.syncPaymentProvisioning.mockResolvedValue({
      ok: true,
      status: 'pending',
      provisioned: false,
    })

    const response = await POST(syncRequest({ paymentId: 'payment-1', automatic: true }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      paymentStatus: 'PENDING',
      provisioned: false,
    })
    expect(mocks.syncPaymentProvisioning).toHaveBeenCalledWith({
      paymentId: 'payment-1',
      cancelPendingOlderThanMs: 600_000,
    })
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('records an automatic check when it provisions the subscription', async () => {
    mocks.syncPaymentProvisioning.mockResolvedValue({
      ok: true,
      status: 'succeeded',
      provisioned: true,
      subscriptionId: 'subscription-1',
    })

    const request = syncRequest({ paymentId: 'payment-1', automatic: true })
    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'admin-1',
      targetId: 'payment-1',
      action: 'PAYMENT_SYNCED',
      message: 'Платёж проверен автоматически',
      metadata: expect.objectContaining({ automatic: true, provisioned: true }),
      request,
    }))
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const prisma = {
    payment: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    promoCodeRedemption: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  }
  return {
    prisma,
    remnashopQuery: vi.fn(),
    markSyncFailed: vi.fn(),
    markSyncSkipped: vi.fn(),
    markSyncSucceeded: vi.fn(),
    terminateUserSubscription: vi.fn(),
  }
})

vi.mock('./prisma', () => ({ prisma: mocks.prisma }))
vi.mock('./remnashop-db', () => ({ remnashopQuery: mocks.remnashopQuery }))
vi.mock('./remnashop-users', () => ({ syncRemnashopUsersToCabinet: vi.fn() }))
vi.mock('./sync-events', () => ({
  markSyncFailed: mocks.markSyncFailed,
  markSyncSkipped: mocks.markSyncSkipped,
  markSyncSucceeded: mocks.markSyncSucceeded,
}))
vi.mock('./subscription-termination', () => ({
  terminateUserSubscription: mocks.terminateUserSubscription,
}))

import { makeSourcePlanKey, syncRemnashopPaymentsToCabinet } from './remnashop-sync'

describe('Remnashop catalog keys', () => {
  it('keeps a zero-day source duration linked to its normalized one-day Cabinet plan', () => {
    expect(makeSourcePlanKey(4, 0)).toBe(makeSourcePlanKey(4, 1))
  })
})

describe('Remnashop payment import', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma))
    mocks.prisma.payment.findFirst.mockResolvedValue({
      id: 'cabinet-payment-1',
      userId: 'user-1',
      status: 'SUCCEEDED',
      providerStatus: 'COMPLETED',
      paidAt: new Date('2026-07-20T10:00:00.000Z'),
      subscriptionId: 'subscription-1',
      subscriptionProvisionedAt: new Date('2026-07-20T10:00:00.000Z'),
      yookassaId: 'remnashop-payment-1',
    })
    mocks.prisma.payment.update.mockResolvedValue({})
    mocks.prisma.promoCodeRedemption.updateMany.mockResolvedValue({ count: 1 })
    mocks.terminateUserSubscription.mockResolvedValue({ hadSubscription: true })
    mocks.remnashopQuery.mockResolvedValue({
      rows: [{
        id: 10,
        payment_id: 'remnashop-payment-1',
        status: 'REFUNDED',
        gateway_type: 'YOOKASSA',
        gateway_display_name: 'YooKassa',
        payment_method: null,
        purchase_type: 'PLAN',
        currency: 'RUB',
        pricing: {},
        plan_snapshot: {},
        created_at: new Date('2026-07-20T10:00:00.000Z'),
        updated_at: new Date('2026-07-21T10:00:00.000Z'),
        user_id: 42,
        user_remna_id: 'remna-uuid',
      }],
    })
  })

  it('propagates a refund to an existing Cabinet payment', async () => {
    const result = await syncRemnashopPaymentsToCabinet({
      paymentId: 'remnashop-payment-1',
    })

    expect(result).toEqual({
      total: 1,
      created: 0,
      updated: 1,
      skipped: 0,
      blocked: 0,
      failed: 0,
    })
    expect(mocks.prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'cabinet-payment-1' },
      data: expect.objectContaining({
        status: 'REFUNDED',
        providerStatus: 'REFUNDED',
      }),
    })
    expect(mocks.prisma.promoCodeRedemption.updateMany).toHaveBeenCalledWith({
      where: { paymentId: 'cabinet-payment-1' },
      data: { status: 'CANCELED' },
    })
    expect(mocks.markSyncSucceeded).toHaveBeenCalled()
    expect(mocks.terminateUserSubscription).toHaveBeenCalledWith({
      userId: 'user-1',
      source: 'REMNASHOP_REFUND',
      paymentId: 'cabinet-payment-1',
      skipRemnashopSync: true,
    })
  })

  it('marks a native Remnashop success as already provisioned in Cabinet', async () => {
    mocks.prisma.payment.findFirst.mockResolvedValue({
      id: 'cabinet-payment-1',
      userId: 'user-1',
      status: 'CANCELED',
      providerStatus: 'CANCELED',
      paidAt: null,
      subscriptionId: 'subscription-1',
      subscriptionProvisionedAt: null,
      yookassaId: null,
    })
    mocks.remnashopQuery.mockResolvedValue({
      rows: [{
        id: 10,
        payment_id: 'remnashop-payment-1',
        status: 'COMPLETED',
        gateway_type: 'YOOKASSA',
        gateway_display_name: 'YooKassa',
        payment_method: null,
        purchase_type: 'RENEW',
        currency: 'RUB',
        pricing: {},
        plan_snapshot: {},
        created_at: new Date('2026-07-20T10:00:00.000Z'),
        updated_at: new Date('2026-07-21T10:00:00.000Z'),
        user_id: 42,
        user_remna_id: 'remna-uuid',
      }],
    })

    await expect(syncRemnashopPaymentsToCabinet({
      paymentId: 'remnashop-payment-1',
    })).resolves.toMatchObject({ updated: 1, failed: 0 })

    expect(mocks.prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'cabinet-payment-1' },
      data: expect.objectContaining({
        status: 'SUCCEEDED',
        providerStatus: 'COMPLETED',
        yookassaId: 'remnashop-payment-1',
        subscriptionProvisionedAt: new Date('2026-07-21T10:00:00.000Z'),
      }),
    })
  })
})

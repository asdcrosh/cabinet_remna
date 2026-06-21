import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const plan = {
    id: 'plan-1',
    name: 'Базовый',
    durationDays: 30,
    trafficLimitGb: 200,
    deviceLimit: 5,
  }
  const user = { id: 'user-1', email: 'user@example.com' }
  const payment = {
    id: 'pay-1',
    yookassaId: 'yoo-1',
    status: 'PENDING',
    paidAt: null,
    subscriptionProvisionedAt: null,
    user,
    plan,
  }

  return {
    payment,
    prisma: {
      payment: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      promoCodeRedemption: {
        updateMany: vi.fn(),
      },
    },
    getPayment: vi.fn(),
    provisionPaymentSubscription: vi.fn(),
    assertYookassaWebhookSource: vi.fn(),
  }
})

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/yookassa', () => ({ getPayment: mocks.getPayment }))
vi.mock('@/lib/provisioning', () => ({
  provisionPaymentSubscription: mocks.provisionPaymentSubscription,
}))
vi.mock('@/lib/yookassa-webhook', () => ({
  assertYookassaWebhookSource: mocks.assertYookassaWebhookSource,
}))

import { POST } from './route'

function webhookRequest(status: 'succeeded' | 'canceled' | 'waiting_for_capture' = 'succeeded') {
  return new Request('http://localhost:3000/api/webhook/yookassa', {
    method: 'POST',
    body: JSON.stringify({
      type: 'notification',
      event: `payment.${status}`,
      object: {
        id: 'yoo-1',
        status,
      },
    }),
  })
}

describe('YooKassa webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.assertYookassaWebhookSource.mockReturnValue({ ok: true })
    mocks.prisma.payment.update.mockResolvedValue({})
    mocks.prisma.promoCodeRedemption.updateMany.mockResolvedValue({ count: 0 })
  })

  it('marks payment succeeded and provisions subscription', async () => {
    mocks.prisma.payment.findUnique.mockResolvedValue(mocks.payment)
    mocks.getPayment.mockResolvedValue({ status: 'succeeded' })
    mocks.provisionPaymentSubscription.mockResolvedValue({ subscription: { id: 'sub-1' } })

    const res = await POST(webhookRequest('succeeded'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(mocks.prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pay-1' },
        data: expect.objectContaining({ status: 'SUCCEEDED', yookassaStatus: 'succeeded' }),
      })
    )
    expect(mocks.provisionPaymentSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        email: 'user@example.com',
        paymentId: 'pay-1',
        plan: expect.objectContaining({ id: 'plan-1' }),
      })
    )
  })

  it('does not provision again when payment is already provisioned', async () => {
    mocks.prisma.payment.findUnique.mockResolvedValue({
      ...mocks.payment,
      status: 'SUCCEEDED',
      subscriptionProvisionedAt: new Date(),
    })

    const res = await POST(webhookRequest('succeeded'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, idempotent: true })
    expect(mocks.provisionPaymentSubscription).not.toHaveBeenCalled()
    expect(mocks.prisma.promoCodeRedemption.updateMany).toHaveBeenCalledWith({
      where: { paymentId: 'pay-1', status: 'PENDING' },
      data: { status: 'SUCCEEDED' },
    })
  })

  it('marks payment canceled and cancels pending promo redemption', async () => {
    mocks.prisma.payment.findUnique.mockResolvedValue(mocks.payment)
    mocks.getPayment.mockResolvedValue({ status: 'canceled' })

    const res = await POST(webhookRequest('canceled'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(mocks.prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'pay-1' },
      data: { status: 'CANCELED', yookassaStatus: 'canceled' },
    })
    expect(mocks.prisma.promoCodeRedemption.updateMany).toHaveBeenCalledWith({
      where: { paymentId: 'pay-1', status: 'PENDING' },
      data: { status: 'CANCELED' },
    })
  })
})

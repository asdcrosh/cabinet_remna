import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  rateLimit: vi.fn(),
  reconcileStalePendingPaymentsForUser: vi.fn(),
  getPlanAudienceContext: vi.fn(),
  isPlanAvailableForUser: vi.fn(),
  createPayment: vi.fn(),
  createPlategaPayment: vi.fn(),
  isPaymentProviderAvailable: vi.fn(),
  validatePromoCodeForPlan: vi.fn(),
  logError: vi.fn(),
  txPaymentCreate: vi.fn(),
  txPromoCreate: vi.fn(),
  prisma: {
    plan: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    payment: { update: vi.fn() },
    promoCodeRedemption: { updateMany: vi.fn() },
    subscription: { count: vi.fn() },
    trialPlanRedemption: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/auth/guard', () => ({
  requireAuth: mocks.requireAuth,
  withAuth: (handler: (req: Request) => Promise<Response>) => handler,
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rateLimit }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/payment-sync', () => ({
  reconcileStalePendingPaymentsForUser: mocks.reconcileStalePendingPaymentsForUser,
}))
vi.mock('@/lib/plan-access', () => ({
  getPlanAudienceContext: mocks.getPlanAudienceContext,
  isPlanAvailableForUser: mocks.isPlanAvailableForUser,
}))
vi.mock('@/lib/yookassa', () => ({ createPayment: mocks.createPayment }))
vi.mock('@/lib/platega', () => ({ createPlategaPayment: mocks.createPlategaPayment }))
vi.mock('@/lib/payment-providers', () => ({ isPaymentProviderAvailable: mocks.isPaymentProviderAvailable }))
vi.mock('@/lib/promo-codes', () => ({
  PromoCodeError: class PromoCodeError extends Error {
    constructor(
      message: string,
      public status = 400,
      public code = 'PROMO_CODE_ERROR'
    ) {
      super(message)
    }
  },
  validatePromoCodeForPlan: mocks.validatePromoCodeForPlan,
}))
vi.mock('@/lib/logger', () => ({ logError: mocks.logError }))

import { POST } from './route'

const plan = {
  id: 'plan-1',
  name: 'Стандарт',
  priceKopecks: 30000,
  durationDays: 30,
  trafficLimitGb: null,
  deviceLimit: 5,
  activeInternalSquads: [],
  availability: 'ALL',
  isActive: true,
  isPromo: false,
}

const user = {
  id: 'user-1',
  email: 'user@example.com',
  telegramId: null,
  remnashopSyncedAt: null,
  remnashopUserId: null,
  remnawaveUuid: null,
}

const localPayment = {
  id: 'payment-1',
  userId: user.id,
  planId: plan.id,
  amountKopecks: plan.priceKopecks,
}

function paymentRequest(body: unknown = { planId: plan.id }) {
  return new Request('http://localhost:3000/api/payment/create', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('payment create route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.APP_URL = 'https://cabinet.example'
    mocks.requireAuth.mockResolvedValue({ uid: user.id, email: user.email, role: 'USER' })
    mocks.rateLimit.mockResolvedValue({ ok: true })
    mocks.prisma.plan.findUnique.mockResolvedValue(plan)
    mocks.prisma.user.findUnique.mockResolvedValue(user)
    mocks.reconcileStalePendingPaymentsForUser.mockResolvedValue(undefined)
    mocks.getPlanAudienceContext.mockResolvedValue({})
    mocks.isPlanAvailableForUser.mockReturnValue(true)
    mocks.isPaymentProviderAvailable.mockReturnValue(true)
    mocks.txPaymentCreate.mockResolvedValue(localPayment)
    mocks.txPromoCreate.mockResolvedValue({})
    mocks.prisma.$transaction.mockImplementation(async (input) => {
      if (Array.isArray(input)) return Promise.all(input)
      return input({
        payment: { create: mocks.txPaymentCreate },
        promoCodeRedemption: { create: mocks.txPromoCreate },
      })
    })
    mocks.createPayment.mockResolvedValue({
      id: 'yoo-1',
      status: 'pending',
      confirmation: { confirmation_url: 'https://pay.example/confirm' },
    })
    mocks.createPlategaPayment.mockResolvedValue({
      transactionId: 'platega-1',
      status: 'PENDING',
      url: 'https://pay.platega.io/?id=platega-1',
      expiresIn: '00:15:00',
    })
    mocks.prisma.payment.update.mockResolvedValue({})
    mocks.prisma.promoCodeRedemption.updateMany.mockResolvedValue({ count: 0 })
  })

  it('creates a local payment, sends it to YooKassa and stores confirmation data', async () => {
    const response = await POST(paymentRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.txPaymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: user.id,
        planId: plan.id,
        amountKopecks: plan.priceKopecks,
        provider: 'YOOKASSA',
        providerStatus: 'pending',
        status: 'PENDING',
      }),
    })
    expect(mocks.createPayment).toHaveBeenCalledWith(expect.objectContaining({
      amount: 300,
      returnUrl: 'https://cabinet.example/dashboard/billing?paid=1&payment=payment-1',
      idempotenceKey: 'payment-1',
      metadata: expect.objectContaining({
        userId: user.id,
        planId: plan.id,
        localPaymentId: 'payment-1',
      }),
    }))
    expect(mocks.prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: {
        yookassaId: 'yoo-1',
        yookassaStatus: 'pending',
        externalPaymentId: 'yoo-1',
        providerStatus: 'pending',
        confirmationUrl: 'https://pay.example/confirm',
      },
    })
    expect(body).toEqual({
      confirmationUrl: 'https://pay.example/confirm',
      paymentId: 'yoo-1',
      localPaymentId: 'payment-1',
      provider: 'YOOKASSA',
    })
  })

  it('rejects a free non-promo plan before creating payment records', async () => {
    mocks.prisma.plan.findUnique.mockResolvedValue({ ...plan, priceKopecks: 0, isPromo: false })

    const response = await POST(paymentRequest())
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toContain('Бесплатный тариф')
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(mocks.createPayment).not.toHaveBeenCalled()
  })

  it('cancels the local payment and promo redemption when YooKassa rejects creation', async () => {
    mocks.createPayment.mockRejectedValue(new Error('bad credentials'))

    const response = await POST(paymentRequest())
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body.error).toContain('ЮKassa')
    expect(mocks.prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: {
        status: 'CANCELED',
        providerStatus: 'failed',
        provisioningError: 'bad credentials',
      },
    })
    expect(mocks.prisma.promoCodeRedemption.updateMany).toHaveBeenCalledWith({
      where: { paymentId: 'payment-1' },
      data: { status: 'CANCELED' },
    })
  })

  it('creates an internal PayAnyWay form redirect without calling YooKassa', async () => {
    const response = await POST(paymentRequest({ planId: plan.id, provider: 'PAYANYWAY' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.txPaymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ provider: 'PAYANYWAY', providerStatus: 'pending' }),
    })
    expect(mocks.createPayment).not.toHaveBeenCalled()
    expect(mocks.prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: {
        confirmationUrl: 'https://cabinet.example/api/payment/payanyway/redirect?payment=payment-1',
      },
    })
    expect(body).toEqual({
      confirmationUrl: 'https://cabinet.example/api/payment/payanyway/redirect?payment=payment-1',
      paymentId: 'payment-1',
      localPaymentId: 'payment-1',
      provider: 'PAYANYWAY',
    })
  })

  it('creates a Platega checkout and stores the external transaction', async () => {
    const response = await POST(paymentRequest({ planId: plan.id, provider: 'PLATEGA' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.txPaymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ provider: 'PLATEGA', providerStatus: 'pending' }),
    })
    expect(mocks.createPayment).not.toHaveBeenCalled()
    expect(mocks.createPlategaPayment).toHaveBeenCalledWith({
      amountKopecks: 30000,
      description: expect.any(String),
      returnUrl: 'https://cabinet.example/dashboard/billing?paid=1&payment=payment-1',
      failedUrl: 'https://cabinet.example/dashboard/billing?paid=1&payment=payment-1',
      payload: 'payment-1',
      metadata: { userId: 'user-1', userName: 'user@example.com' },
    })
    expect(mocks.prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: {
        externalPaymentId: 'platega-1',
        providerStatus: 'PENDING',
        confirmationUrl: 'https://pay.platega.io/?id=platega-1',
      },
    })
    expect(body).toEqual({
      confirmationUrl: 'https://pay.platega.io/?id=platega-1',
      paymentId: 'platega-1',
      localPaymentId: 'payment-1',
      provider: 'PLATEGA',
    })
  })
})

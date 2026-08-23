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
  logWarn: vi.fn(),
  txPaymentCreate: vi.fn(),
  txPromoCreate: vi.fn(),
  prisma: {
    plan: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    payment: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    promoCodeRedemption: { updateMany: vi.fn() },
    subscription: { count: vi.fn(), findFirst: vi.fn() },
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
vi.mock('@/lib/logger', () => ({ logError: mocks.logError, logWarn: mocks.logWarn }))

import { POST } from './route'
import { AUTO_RENEWAL_CONSENT_VERSION } from '@/lib/auto-renewal-consent'

const plan = {
  id: 'plan-1',
  name: 'Стандарт',
  priceKopecks: 30000,
  durationDays: 30,
  trafficLimitGb: null,
  deviceLimit: 5,
  maxDeviceLimit: 20,
  extraDevicePriceKopecks: 10000,
  activeInternalSquads: [],
  whitelistAddonEnabled: true,
  whitelistAddonPriceKopecks: 20000,
  whitelistAddonInternalSquads: ['07eb7d61-533d-4ef5-9fa0-977f0db4c227'],
  availability: 'ALL',
  isActive: true,
  isPromo: false,
}

const user = {
  id: 'user-1',
  email: 'user@example.com',
  emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
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
  deviceLimit: plan.deviceLimit,
}

const idempotencyKey = '6dad4f34-1b9e-4863-9ce1-5db7a29e12f7'

function paymentRequest(body: Record<string, unknown> = {}) {
  return new Request('http://localhost:3000/api/payment/create', {
    method: 'POST',
    body: JSON.stringify({
      planId: plan.id,
      deviceLimit: plan.deviceLimit,
      idempotencyKey,
      ...body,
    }),
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
    mocks.prisma.payment.findUnique.mockResolvedValue(null)
    mocks.prisma.payment.findFirst.mockResolvedValue(null)
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

  it('creates a separate payment for the whitelist add-on', async () => {
    mocks.prisma.subscription.findFirst.mockResolvedValue({
      id: 'subscription-1',
      userId: user.id,
      planId: plan.id,
      status: 'ACTIVE',
      expireAt: new Date('2026-09-01T00:00:00.000Z'),
      deviceLimit: 5,
      whitelistAddonActive: false,
    })
    mocks.txPaymentCreate.mockResolvedValue({
      ...localPayment,
      subscriptionId: 'subscription-1',
      purchaseType: 'WHITELIST_ADDON',
      amountKopecks: 20000,
    })

    const response = await POST(paymentRequest({
      purchaseType: 'WHITELIST_ADDON',
      deviceLimit: undefined,
    }))

    expect(response.status).toBe(200)
    expect(mocks.txPaymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        planId: plan.id,
        subscriptionId: 'subscription-1',
        purchaseType: 'WHITELIST_ADDON',
        amountKopecks: 20000,
        addonSnapshot: expect.objectContaining({
          type: 'WHITELIST_ADDON',
          subscriptionId: 'subscription-1',
          internalSquads: plan.whitelistAddonInternalSquads,
        }),
      }),
    })
    expect(mocks.createPayment).toHaveBeenCalledWith(expect.objectContaining({
      amount: 200,
      description: 'Расширенный доступ',
      metadata: expect.objectContaining({ purchaseType: 'WHITELIST_ADDON' }),
    }))
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
        checkoutKey: idempotencyKey,
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

  it('adds the whitelist add-on to a subscription checkout', async () => {
    mocks.txPaymentCreate.mockResolvedValue({
      ...localPayment,
      amountKopecks: 50000,
    })

    const response = await POST(paymentRequest({ whitelistAddon: true }))

    expect(response.status).toBe(200)
    expect(mocks.txPaymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        purchaseType: 'SUBSCRIPTION',
        amountKopecks: 50000,
        originalAmountKopecks: 50000,
        addonSnapshot: expect.objectContaining({
          type: 'WHITELIST_ADDON_BUNDLE',
          priceKopecks: 20000,
          internalSquads: plan.whitelistAddonInternalSquads,
        }),
      }),
    })
    expect(mocks.createPayment).toHaveBeenCalledWith(expect.objectContaining({
      amount: 500,
      description: expect.stringContaining('Расширенный доступ'),
      metadata: expect.objectContaining({ whitelistAddon: 'true' }),
    }))
  })

  it('records explicit auto-renewal consent and asks YooKassa to save the card', async () => {
    const response = await POST(paymentRequest({
      autoRenewalConsent: true,
      autoRenewalConsentVersion: AUTO_RENEWAL_CONSENT_VERSION,
    }))

    expect(response.status).toBe(200)
    expect(mocks.txPaymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        autoRenewalConsentAcceptedAt: expect.any(Date),
        autoRenewalConsentVersion: AUTO_RENEWAL_CONSENT_VERSION,
      }),
    })
    expect(mocks.createPayment).toHaveBeenCalledWith(expect.objectContaining({
      savePaymentMethod: true,
      paymentMethodType: 'bank_card',
      metadata: expect.objectContaining({
        autoRenewalConsentVersion: AUTO_RENEWAL_CONSENT_VERSION,
      }),
    }))
  })

  it('does not accept auto-renewal consent for providers without recurring payments', async () => {
    const response = await POST(paymentRequest({
      provider: 'PLATEGA',
      autoRenewalConsent: true,
      autoRenewalConsentVersion: AUTO_RENEWAL_CONSENT_VERSION,
    }))
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.error).toContain('ЮKassa')
    expect(mocks.prisma.plan.findUnique).not.toHaveBeenCalled()
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('does not create payments before email verification', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      ...user,
      emailVerifiedAt: null,
      telegramId: 123n,
    })

    const response = await POST(paymentRequest())
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toEqual({
      error: 'Подтвердите email перед оплатой',
      code: 'EMAIL_VERIFICATION_REQUIRED',
      actionHref: '/telegram-email',
    })
    expect(mocks.reconcileStalePendingPaymentsForUser).not.toHaveBeenCalled()
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('returns the existing checkout when the same request is retried', async () => {
    mocks.prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-existing',
      userId: user.id,
      planId: plan.id,
      amountKopecks: plan.priceKopecks,
      provider: 'YOOKASSA',
      externalPaymentId: 'yoo-existing',
      yookassaId: 'yoo-existing',
      confirmationUrl: 'https://pay.example/existing',
      promoCodeSnapshot: null,
      deviceLimit: plan.deviceLimit,
      status: 'PENDING',
      purchaseType: 'SUBSCRIPTION',
    })

    const response = await POST(paymentRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      confirmationUrl: 'https://pay.example/existing',
      paymentId: 'yoo-existing',
      localPaymentId: 'payment-existing',
      provider: 'YOOKASSA',
      idempotent: true,
    })
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(mocks.createPayment).not.toHaveBeenCalled()
  })

  it('rejects reuse of a checkout key with different parameters', async () => {
    mocks.prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-existing',
      userId: user.id,
      planId: 'another-plan',
      provider: 'YOOKASSA',
      promoCodeSnapshot: null,
      deviceLimit: plan.deviceLimit,
      status: 'PENDING',
      confirmationUrl: 'https://pay.example/existing',
    })

    const response = await POST(paymentRequest())
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.code).toBe('PAYMENT_IDEMPOTENCY_CONFLICT')
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
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

  it('requires an idempotency key before creating payment records', async () => {
    const response = await POST(new Request('http://localhost:3000/api/payment/create', {
      method: 'POST',
      body: JSON.stringify({ planId: plan.id }),
    }))

    expect(response.status).toBe(400)
    expect(mocks.prisma.plan.findUnique).not.toHaveBeenCalled()
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('cancels the local payment and promo redemption when YooKassa rejects creation', async () => {
    mocks.createPayment.mockRejectedValue(new Error('bad credentials'))

    const response = await POST(paymentRequest())
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body.error).toContain('ЮKassa')
    expect(body.code).toBe('PAYMENT_PROVIDER_CREATE_FAILED')
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

  it('calculates extra devices on the server and freezes the selected limit', async () => {
    mocks.txPaymentCreate.mockResolvedValue({
      ...localPayment,
      amountKopecks: 60000,
      originalAmountKopecks: 60000,
      deviceLimit: 8,
    })

    const response = await POST(paymentRequest({ deviceLimit: 8 }))

    expect(response.status).toBe(200)
    expect(mocks.txPaymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        deviceLimit: 8,
        originalAmountKopecks: 60000,
        amountKopecks: 60000,
        planSnapshot: expect.objectContaining({
          baseDeviceLimit: 5,
          selectedDeviceLimit: 8,
          extraDeviceCount: 3,
          extraDeviceAmountKopecks: 30000,
        }),
      }),
    })
    expect(mocks.createPayment).toHaveBeenCalledWith(expect.objectContaining({
      amount: 600,
      metadata: expect.objectContaining({ deviceLimit: '8' }),
    }))
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

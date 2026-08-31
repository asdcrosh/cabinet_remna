import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  rateLimit: vi.fn(),
  reconcileStalePendingPaymentsForUser: vi.fn(),
  getPlanAudienceContext: vi.fn(),
  isPlanAvailableForUser: vi.fn(),
  createPayment: vi.fn(),
  createPlategaPayment: vi.fn(),
  getRemnawaveUser: vi.fn(),
  upsertLocalSubscriptionFromRemnawave: vi.fn(),
  isPaymentProviderAvailable: vi.fn(),
  validatePromoCodeForPlan: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
  txPaymentCreate: vi.fn(),
  txPromoCreate: vi.fn(),
  txUserFindUnique: vi.fn(),
  txUserUpdateMany: vi.fn(),
  prisma: {
    plan: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), updateMany: vi.fn() },
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
  getFreshPendingPaymentCutoff: () => new Date('2026-08-22T00:00:00.000Z'),
  reconcileStalePendingPaymentsForUser: mocks.reconcileStalePendingPaymentsForUser,
}))
vi.mock('@/lib/plan-access', () => ({
  getPlanAudienceContext: mocks.getPlanAudienceContext,
  isPlanAvailableForUser: mocks.isPlanAvailableForUser,
}))
vi.mock('@/lib/yookassa', () => ({ createPayment: mocks.createPayment }))
vi.mock('@/lib/platega', () => ({ createPlategaPayment: mocks.createPlategaPayment }))
vi.mock('@/lib/remnawave', () => ({
  hasRemnawaveUserReference: (value: { remnawaveId?: number | null }) => Boolean(value.remnawaveId),
  remnawaveUserReference: (value: { remnawaveId: number }) => ({ id: value.remnawaveId }),
  remnawave: { getUser: mocks.getRemnawaveUser },
}))
vi.mock('@/lib/remnawave-local-sync', () => ({
  upsertLocalSubscriptionFromRemnawave: mocks.upsertLocalSubscriptionFromRemnawave,
}))
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
  unlimitedDuration: false,
  trafficLimitGb: null,
  deviceLimit: 5,
  unlimitedDevices: false,
  maxDeviceLimit: 20,
  deviceAddonEnabled: true,
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
  remnawaveId: 42,
  personalDiscountPercent: 0,
  nextPurchaseDiscountPercent: 0,
}

const localPayment = {
  id: 'payment-1',
  userId: user.id,
  planId: plan.id,
  amountKopecks: plan.priceKopecks,
  deviceLimit: plan.deviceLimit,
}

const idempotencyKey = '6dad4f34-1b9e-4863-9ce1-5db7a29e12f7'
const futureDate = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000)

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
    mocks.prisma.subscription.findFirst.mockResolvedValue(null)
    mocks.reconcileStalePendingPaymentsForUser.mockResolvedValue(undefined)
    mocks.getPlanAudienceContext.mockResolvedValue({})
    mocks.isPlanAvailableForUser.mockReturnValue(true)
    mocks.isPaymentProviderAvailable.mockReturnValue(true)
    mocks.txPaymentCreate.mockResolvedValue(localPayment)
    mocks.txPromoCreate.mockResolvedValue({})
    mocks.txUserFindUnique.mockResolvedValue({
      personalDiscountPercent: 0,
      nextPurchaseDiscountPercent: 0,
    })
    mocks.txUserUpdateMany.mockResolvedValue({ count: 1 })
    mocks.prisma.$transaction.mockImplementation(async (input) => {
      if (Array.isArray(input)) return Promise.all(input)
      return input({
        payment: { create: mocks.txPaymentCreate },
        promoCodeRedemption: { create: mocks.txPromoCreate },
        user: {
          findUnique: mocks.txUserFindUnique,
          updateMany: mocks.txUserUpdateMany,
        },
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
    mocks.getRemnawaveUser.mockResolvedValue({
      response: { expireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() },
    })
    mocks.upsertLocalSubscriptionFromRemnawave.mockResolvedValue({ id: 'subscription-1' })
    mocks.prisma.payment.update.mockResolvedValue({})
    mocks.prisma.promoCodeRedemption.updateMany.mockResolvedValue({ count: 0 })
    mocks.prisma.user.updateMany.mockResolvedValue({ count: 1 })
  })

  it('creates a separate payment for the whitelist add-on', async () => {
    mocks.prisma.subscription.findFirst.mockResolvedValue({
      id: 'subscription-1',
      userId: user.id,
      planId: plan.id,
      status: 'ACTIVE',
      expireAt: futureDate(30),
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

  it('refreshes a stale local subscription from Remnawave before buying the whitelist add-on', async () => {
    const refreshedSubscription = {
      id: 'subscription-1',
      userId: user.id,
      planId: plan.id,
      status: 'ACTIVE',
      expireAt: futureDate(30),
      deviceLimit: 5,
      whitelistAddonActive: false,
    }
    mocks.prisma.subscription.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(refreshedSubscription)
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
    expect(mocks.getRemnawaveUser).toHaveBeenCalledWith({ id: user.remnawaveId })
    expect(mocks.upsertLocalSubscriptionFromRemnawave).toHaveBeenCalledWith({
      localUserId: user.id,
      remnawaveUser: expect.objectContaining({ expireAt: expect.any(String) }),
    })
    expect(mocks.txPaymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        subscriptionId: 'subscription-1',
        purchaseType: 'WHITELIST_ADDON',
      }),
    })
  })

  it('allows renewing an active whitelist add-on', async () => {
    mocks.prisma.subscription.findFirst.mockResolvedValue({
      id: 'subscription-1',
      userId: user.id,
      planId: plan.id,
      status: 'ACTIVE',
      expireAt: futureDate(30),
      deviceLimit: 5,
      whitelistAddonActive: true,
      whitelistAddonExpireAt: futureDate(7),
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
        subscriptionId: 'subscription-1',
        purchaseType: 'WHITELIST_ADDON',
      }),
    })
  })

  it('creates a prorated device limit add-on without extending the subscription', async () => {
    const expireAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
    mocks.getRemnawaveUser.mockResolvedValue({ response: { expireAt: expireAt.toISOString() } })
    mocks.prisma.subscription.findFirst.mockResolvedValue({
      id: 'subscription-1',
      userId: user.id,
      planId: plan.id,
      status: 'ACTIVE',
      expireAt,
      deviceLimit: 5,
      plan: { id: plan.id, name: plan.name },
    })
    mocks.txPaymentCreate.mockResolvedValue({
      ...localPayment,
      subscriptionId: 'subscription-1',
      purchaseType: 'DEVICE_LIMIT_ADDON',
      deviceLimit: 7,
      amountKopecks: 10000,
    })

    const response = await POST(paymentRequest({
      purchaseType: 'DEVICE_LIMIT_ADDON',
      deviceLimit: 7,
    }))

    expect(response.status).toBe(200)
    expect(mocks.txPaymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        subscriptionId: 'subscription-1',
        purchaseType: 'DEVICE_LIMIT_ADDON',
        deviceLimit: 7,
        amountKopecks: 10000,
        addonSnapshot: expect.objectContaining({
          type: 'DEVICE_LIMIT_ADDON',
          subscriptionId: 'subscription-1',
          fromLimit: 5,
          toLimit: 7,
          additionalDevices: 2,
        }),
      }),
    })
    expect(mocks.createPayment).toHaveBeenCalledWith(expect.objectContaining({
      amount: 100,
      description: 'Дополнительные устройства',
      metadata: expect.objectContaining({ purchaseType: 'DEVICE_LIMIT_ADDON', deviceLimit: '7' }),
    }))
  })

  it('rejects a device limit add-on disabled for the tariff', async () => {
    mocks.prisma.plan.findUnique.mockResolvedValue({ ...plan, deviceAddonEnabled: false })

    const response = await POST(paymentRequest({
      purchaseType: 'DEVICE_LIMIT_ADDON',
      deviceLimit: 7,
    }))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toContain('недоступны')
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
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

  it('applies a personal discount only to the base tariff price', async () => {
    mocks.txUserFindUnique.mockResolvedValue({
      personalDiscountPercent: 20,
      nextPurchaseDiscountPercent: 0,
    })
    mocks.txPaymentCreate.mockResolvedValue({
      ...localPayment,
      amountKopecks: 54000,
      originalAmountKopecks: 60000,
      discountPercent: 20,
      discountKopecks: 6000,
      userDiscountType: 'PERSONAL',
      deviceLimit: 8,
    })

    const response = await POST(paymentRequest({ deviceLimit: 8 }))

    expect(response.status).toBe(200)
    expect(mocks.txPaymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amountKopecks: 54000,
        originalAmountKopecks: 60000,
        discountPercent: 20,
        discountKopecks: 6000,
        userDiscountType: 'PERSONAL',
      }),
    })
    expect(mocks.createPayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 540 }))
  })

  it('consumes a discount assigned to the next tariff purchase', async () => {
    mocks.txUserFindUnique.mockResolvedValue({
      personalDiscountPercent: 10,
      nextPurchaseDiscountPercent: 25,
    })
    mocks.txPaymentCreate.mockResolvedValue({
      ...localPayment,
      amountKopecks: 22500,
      originalAmountKopecks: 30000,
      discountPercent: 25,
      discountKopecks: 7500,
      userDiscountType: 'NEXT_PURCHASE',
    })

    const response = await POST(paymentRequest())

    expect(response.status).toBe(200)
    expect(mocks.txUserUpdateMany).toHaveBeenCalledWith({
      where: { id: user.id, nextPurchaseDiscountPercent: 25 },
      data: { nextPurchaseDiscountPercent: 0 },
    })
    expect(mocks.txPaymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amountKopecks: 22500,
        userDiscountType: 'NEXT_PURCHASE',
      }),
    })
  })

  it('records the previous tariff when creating a switch payment', async () => {
    mocks.prisma.subscription.findFirst.mockResolvedValue({
      id: 'subscription-1',
      planId: 'old-plan',
      status: 'ACTIVE',
      expireAt: futureDate(30),
      whitelistAddonActive: false,
      plan: { id: 'old-plan', name: 'Старый' },
    })

    const response = await POST(paymentRequest())

    expect(response.status).toBe(200)
    expect(mocks.txPaymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        planSnapshot: expect.objectContaining({
          name: plan.name,
          switchFromPlan: { id: 'old-plan', name: 'Старый' },
        }),
      }),
    })
  })

  it('does not sell bundled whitelist access again during a tariff switch', async () => {
    mocks.prisma.subscription.findFirst.mockResolvedValue({
      id: 'subscription-1',
      planId: 'old-plan',
      status: 'ACTIVE',
      expireAt: futureDate(30),
      whitelistAddonActive: true,
      whitelistAddonExpireAt: futureDate(7),
      plan: { id: 'old-plan', name: 'Старый' },
    })

    const response = await POST(paymentRequest({ whitelistAddon: true }))
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.code).toBe('WHITELIST_ADDON_ALREADY_ACTIVE')
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('does not sell bundled whitelist access while an existing balance is paused', async () => {
    mocks.prisma.subscription.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'subscription-1',
        planId: 'old-plan',
        status: 'EXPIRED',
        expireAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        whitelistAddonActive: false,
        whitelistAddonRemainingSeconds: 20n * 24n * 60n * 60n,
      })

    const response = await POST(paymentRequest({ whitelistAddon: true }))
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.code).toBe('WHITELIST_ADDON_ALREADY_ACTIVE')
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
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
      metadata: expect.objectContaining({
        autoRenewalConsentVersion: AUTO_RENEWAL_CONSENT_VERSION,
      }),
    }))
    expect(mocks.createPayment.mock.calls[0]?.[0]).not.toHaveProperty('paymentMethodType')
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

  it('returns a fresh matching checkout instead of creating a duplicate payment', async () => {
    mocks.prisma.payment.findFirst.mockResolvedValue({
      id: 'payment-pending',
      userId: user.id,
      planId: plan.id,
      purchaseType: 'SUBSCRIPTION',
      provider: 'YOOKASSA',
      status: 'PENDING',
      deviceLimit: plan.deviceLimit,
      confirmationUrl: 'https://pay.example/continue',
      externalPaymentId: 'yoo-pending',
      yookassaId: 'yoo-pending',
      addonSnapshot: null,
      autoRenewalConsentAcceptedAt: null,
    })

    const response = await POST(paymentRequest({
      idempotencyKey: '527e89d3-9708-4ca5-9cb5-d3c08e1bcc35',
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      confirmationUrl: 'https://pay.example/continue',
      paymentId: 'yoo-pending',
      localPaymentId: 'payment-pending',
      provider: 'YOOKASSA',
      resumed: true,
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

  it('reports unavailable YooKassa autopayments without blaming credentials', async () => {
    mocks.createPayment.mockRejectedValue(Object.assign(new Error('provider rejected request'), {
      status: 403,
      providerCode: 'forbidden',
      providerDescription: 'Insufficient permission',
    }))

    const response = await POST(paymentRequest({
      autoRenewalConsent: true,
      autoRenewalConsentVersion: AUTO_RENEWAL_CONSENT_VERSION,
    }))
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body.code).toBe('YOOKASSA_AUTOPAYMENTS_UNAVAILABLE')
    expect(body.error).toContain('автоплатежи')
    expect(body.error).not.toContain('Shop ID')
  })

  it('reports YooKassa authorization failures separately', async () => {
    mocks.createPayment.mockRejectedValue(Object.assign(new Error('unauthorized'), {
      status: 401,
      providerCode: 'invalid_credentials',
    }))

    const response = await POST(paymentRequest())
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body.code).toBe('YOOKASSA_AUTH_FAILED')
    expect(body.error).toContain('Shop ID')
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

  it('rejects extra devices in a new subscription when the option is disabled', async () => {
    mocks.prisma.plan.findUnique.mockResolvedValue({ ...plan, deviceAddonEnabled: false })

    const response = await POST(paymentRequest({ deviceLimit: 8 }))
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.error).toContain('недоступны')
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('accepts an unlimited tariff without auto-renewal and rejects a custom device limit', async () => {
    mocks.prisma.plan.findUnique.mockResolvedValue({
      ...plan,
      unlimitedDuration: true,
      unlimitedDevices: true,
      deviceAddonEnabled: false,
    })

    const response = await POST(paymentRequest({ deviceLimit: 8 }))
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.error).toContain('безлимит устройств')
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects auto-renewal for an unlimited duration tariff', async () => {
    mocks.prisma.plan.findUnique.mockResolvedValue({ ...plan, unlimitedDuration: true })

    const response = await POST(paymentRequest({
      autoRenewalConsent: true,
      autoRenewalConsentVersion: AUTO_RENEWAL_CONSENT_VERSION,
    }))
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.error).toContain('не требует автопродления')
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
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

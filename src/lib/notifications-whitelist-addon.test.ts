import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  paymentFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  createAdminNotification: vi.fn(),
  recordPaymentEvent: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    payment: { findUnique: mocks.paymentFindUnique },
    user: { findUnique: mocks.userFindUnique },
  },
}))
vi.mock('./admin-notifications', () => ({
  createAdminNotification: mocks.createAdminNotification,
}))
vi.mock('./payment-events', () => ({
  recordPaymentEvent: mocks.recordPaymentEvent,
}))
vi.mock('./app-url', () => ({ getAppUrl: () => 'https://cabinet.example.test' }))
vi.mock('./branding', () => ({ getBrandName: () => 'Cabinet' }))
vi.mock('./email-template', () => ({ renderActionEmail: () => '<p>Email</p>' }))
vi.mock('./remnawave', () => ({ remnawave: {} }))

import { notifyPaymentSucceeded } from './notifications'

describe('whitelist add-on payment notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.test',
      emailVerifiedAt: new Date(),
      name: 'Иван',
      telegramId: 123n,
      notificationPreference: {
        inAppEnabled: false,
        telegramEnabled: false,
        emailEnabled: false,
        broadcastsEnabled: true,
      },
    })
    mocks.paymentFindUnique.mockResolvedValue({
      id: 'payment-1',
      userId: 'user-1',
      purchaseType: 'WHITELIST_ADDON',
      amountKopecks: 20_000,
      provider: 'YOOKASSA',
      externalPaymentId: 'yoo-1',
      addonSnapshot: {
        type: 'WHITELIST_ADDON',
        name: 'Доступ к серверам с белыми списками',
        planId: 'plan-1',
        subscriptionId: 'subscription-1',
        subscriptionExpireAt: '2026-10-01T00:00:00.000Z',
        priceKopecks: 20_000,
        internalSquads: ['whitelist-squad'],
      },
      user: {
        id: 'user-1',
        name: 'Иван',
        email: 'user@example.test',
        telegramUsername: 'ivan',
        remnawaveUsername: 'ivan-rw',
      },
      plan: { name: 'Стандарт', durationDays: 30, trafficLimitGb: null, deviceLimit: 3 },
      subscription: {
        startAt: new Date('2026-08-01T00:00:00.000Z'),
        expireAt: new Date('2026-10-01T00:00:00.000Z'),
        deviceLimit: 3,
        whitelistAddonExpireAt: new Date('2026-09-22T12:00:00.000Z'),
      },
    })
  })

  it('creates an in-cabinet admin notification and Telegram delivery', async () => {
    await notifyPaymentSucceeded('payment-1')

    expect(mocks.createAdminNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'payment',
      severity: 'SUCCESS',
      dedupeKey: 'admin:payment-success:payment-1',
      title: 'Куплены БС',
      body: expect.stringContaining('Иван оплатил 200,00 ₽ за расширенный доступ'),
      entityType: 'payment',
      entityId: 'payment-1',
      telegram: expect.objectContaining({
        text: expect.stringContaining('<b>✅ Куплены БС</b>'),
        actionHref: '/dashboard/admin/payments',
      }),
    }))
    expect(mocks.recordPaymentEvent).toHaveBeenCalledWith(expect.objectContaining({
      paymentId: 'payment-1',
      stage: 'NOTIFICATION',
      status: 'SUCCESS',
    }))
  })
})

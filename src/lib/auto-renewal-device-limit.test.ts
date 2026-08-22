import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createPayment: vi.fn(),
  paymentFindUnique: vi.fn(),
  paymentCreate: vi.fn(),
  paymentUpdate: vi.fn(),
  autoRenewalFindMany: vi.fn(),
  autoRenewalUpdate: vi.fn(),
  transactionAutoRenewalUpdate: vi.fn(),
  notifyUser: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    autoRenewal: {
      findMany: mocks.autoRenewalFindMany,
      update: mocks.autoRenewalUpdate,
    },
    payment: {
      findUnique: mocks.paymentFindUnique,
      update: mocks.paymentUpdate,
    },
    $transaction: (callback: (tx: unknown) => unknown) => callback({
      payment: { create: mocks.paymentCreate },
      autoRenewal: { update: mocks.transactionAutoRenewalUpdate },
    }),
  },
}))
vi.mock('./yookassa', () => ({ createPayment: mocks.createPayment }))
vi.mock('./payment-settings-crypto', () => ({
  encryptPaymentSecret: (value: string) => `encrypted:${value}`,
  decryptPaymentSecret: () => 'saved-method',
}))
vi.mock('./notifications', () => ({ notifyUser: mocks.notifyUser }))
vi.mock('./logger', () => ({ logError: vi.fn(), logInfo: vi.fn(), logWarn: vi.fn() }))
vi.mock('./app-url', () => ({ getAppUrl: () => 'https://cabinet.example' }))

import { processDueAutoRenewals } from './auto-renewal'

describe('automatic renewal device pricing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.paymentFindUnique.mockResolvedValue(null)
    mocks.paymentCreate.mockResolvedValue({ id: 'payment-1', amountKopecks: 110000 })
    mocks.paymentUpdate.mockResolvedValue({})
    mocks.transactionAutoRenewalUpdate.mockResolvedValue({})
    mocks.createPayment.mockResolvedValue({ id: 'yoo-1', status: 'pending' })
    mocks.autoRenewalFindMany.mockResolvedValue([{
      id: 'renewal-1',
      userId: 'user-1',
      planId: 'plan-1',
      status: 'ACTIVE',
      paymentMethodIdEncrypted: 'encrypted-method',
      consentAcceptedAt: new Date('2026-08-01T00:00:00.000Z'),
      consentVersion: 'auto-renewal-v1',
      consentPriceKopecks: 110000,
      consentDurationDays: 30,
      deviceLimit: 8,
      whitelistAddonEnabled: false,
      nextChargeAt: new Date('2026-08-21T00:00:00.000Z'),
      retryCount: 0,
      user: { id: 'user-1', email: 'user@example.com' },
      plan: {
        id: 'plan-1',
        name: 'Premium',
        priceKopecks: 70000,
        durationDays: 30,
        trafficLimitGb: null,
        deviceLimit: 4,
        maxDeviceLimit: 20,
        extraDevicePriceKopecks: 10000,
        activeInternalSquads: ['squad-1'],
        whitelistAddonEnabled: true,
        whitelistAddonPriceKopecks: 20000,
        whitelistAddonInternalSquads: ['whitelist-squad'],
        remnashopPlanId: 10,
        isPromo: false,
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    }])
  })

  it('charges and provisions the frozen selected device count', async () => {
    await expect(processDueAutoRenewals()).resolves.toEqual({ checked: 1, created: 1, failed: 0 })

    expect(mocks.paymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amountKopecks: 110000,
        originalAmountKopecks: 110000,
        deviceLimit: 8,
        planSnapshot: expect.objectContaining({
          selectedDeviceLimit: 8,
          extraDeviceCount: 4,
          extraDeviceAmountKopecks: 40000,
        }),
      }),
    })
    expect(mocks.createPayment).toHaveBeenCalledWith(expect.objectContaining({
      amount: 1100,
      metadata: expect.objectContaining({ deviceLimit: '8' }),
    }))
  })

  it('includes the whitelist add-on in an automatic renewal', async () => {
    const [setting] = await mocks.autoRenewalFindMany()
    setting.whitelistAddonEnabled = true
    setting.consentPriceKopecks = 130000
    mocks.autoRenewalFindMany.mockResolvedValue([setting])
    mocks.paymentCreate.mockResolvedValue({ id: 'payment-1', amountKopecks: 130000 })

    await expect(processDueAutoRenewals()).resolves.toEqual({ checked: 1, created: 1, failed: 0 })

    expect(mocks.paymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amountKopecks: 130000,
        originalAmountKopecks: 130000,
        addonSnapshot: expect.objectContaining({
          type: 'WHITELIST_ADDON_BUNDLE',
          priceKopecks: 20000,
          internalSquads: ['whitelist-squad'],
        }),
      }),
    })
    expect(mocks.createPayment).toHaveBeenCalledWith(expect.objectContaining({
      amount: 1300,
      metadata: expect.objectContaining({ whitelistAddon: 'true' }),
    }))
  })
})

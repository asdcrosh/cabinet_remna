import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  buildPlanCatalog: vi.fn(),
  planFind: vi.fn(),
}))

vi.mock('@/lib/auth/guard', () => ({ requireAuth: mocks.requireAuth, withAuth: (handler: unknown) => handler }))
vi.mock('@/lib/plan-catalog', () => ({ buildPlanCatalog: mocks.buildPlanCatalog }))
vi.mock('@/lib/prisma', () => ({ prisma: { plan: { findUnique: mocks.planFind } } }))
vi.mock('@/lib/auto-renewal-consent', () => ({ AUTO_RENEWAL_CONSENT_VERSION: 'offer:test' }))

import { GET } from './route'

const planView = {
  id: 'p90',
  name: 'Premium',
  description: null,
  price: '900 ₽',
  priceKopecks: 90_000,
  monthlyPrice: '300 ₽',
  savingsPercent: 10,
  durationDays: 90,
  unlimitedDuration: false,
  trafficLimitGb: 200,
  deviceLimit: 3,
  unlimitedDevices: false,
  maxDeviceLimit: 10,
  deviceAddonEnabled: true,
  extraDevicePriceKopecks: 10_000,
  initialDeviceLimit: 4,
  currentDeviceLimit: 4,
  isPromo: false,
  promoCodesEnabled: true,
  popular: true,
  current: true,
  isPlanSwitch: false,
  currentPlanName: 'Premium',
  currentWhitelistAddonActive: false,
  currentWhitelistAddonExpireAt: null,
  autoRenewalEnabled: false,
  autoRenewalWhitelistAddonEnabled: false,
  whitelistAddonEnabled: true,
  whitelistAddonPriceKopecks: 15_000,
  initialWhitelistAddonRequested: false,
  initialPromoCode: undefined,
  availablePromoCodes: [{ code: 'BOX15', discountPercent: 15, discountKopecks: 13_500, finalAmountKopecks: 76_500, source: 'BONUS_BOX' }],
  personalDiscountPercent: 5,
  nextPurchaseDiscountPercent: 0,
  paymentProviders: [{ id: 'YOOKASSA', label: 'ЮKassa' }],
}

describe('GET /api/mobile/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ uid: 'user-1', aud: 'mobile', sid: 'ms-1' })
    mocks.planFind.mockResolvedValue({
      whitelistAddonEnabled: true,
      whitelistAddonPriceKopecks: 15_000,
      whitelistAddonInternalSquads: ['wl'],
    })
    mocks.buildPlanCatalog.mockResolvedValue({
      plans: [planView],
      paymentProviders: [{ id: 'YOOKASSA', label: 'ЮKassa' }],
      canManagePlans: false,
      currentSubscription: {
        planId: 'p90',
        expireAt: new Date('2026-11-20T06:47:00Z'),
        plan: { name: 'Premium', unlimitedDuration: false, unlimitedDevices: false, deviceLimit: 3 },
      },
      currentDeviceLimit: 4,
      needsTelegramCheckForPromo: false,
      autoRenewal: null,
      autoRenewalAvailable: true,
      autoRenewalConsentCurrent: false,
      activeAutoRenewal: false,
    })
  })

  it('отдаёт витрину текущего пользователя', async () => {
    const body = await (await GET(new Request('https://lk.example/api/mobile/checkout'))).json()
    expect(mocks.buildPlanCatalog).toHaveBeenCalledWith({ userId: 'user-1', mobileApp: { trialDeviceKey: null } })
    expect(body.plans).toHaveLength(1)
    expect(body.plans[0]).toMatchObject({
      id: 'p90',
      initialDeviceLimit: 4,
      whitelistAddonAvailable: true,
      availablePromoCodes: [{ code: 'BOX15', discountPercent: 15, source: 'BONUS_BOX' }],
    })
    // форматированные строки сайта приложению не нужны
    expect(body.plans[0].price).toBeUndefined()
    expect(body.personalDiscountPercent).toBe(5)
    expect(body.currentSubscription).toEqual({
      planId: 'p90',
      planName: 'Premium',
      expireAt: '2026-11-20T06:47:00.000Z',
      unlimitedDuration: false,
      unlimitedDevices: false,
      deviceLimit: 4,
    })
    expect(body.whitelistAddon).toEqual({ active: false, expireAt: null, purchasable: true, priceKopecks: 15_000 })
    expect(body.autoRenewal).toMatchObject({ available: true, consentVersion: 'offer:test', active: false, status: null })
  })

  it('без подписки дополнение БС купить нельзя', async () => {
    const catalog = await mocks.buildPlanCatalog()
    mocks.buildPlanCatalog.mockResolvedValue({ ...catalog, currentSubscription: null })
    const body = await (await GET(new Request('https://lk.example/api/mobile/checkout'))).json()
    expect(body.currentSubscription).toBeNull()
    expect(body.whitelistAddon.purchasable).toBe(false)
    expect(mocks.planFind).not.toHaveBeenCalled()
  })

  it('передаёт в витрину ключ телефона для пробного периода, некорректный — отбрасывает', async () => {
    const key = 'a'.repeat(64)
    await GET(new Request(`https://lk.example/api/mobile/checkout?deviceKey=${key}`))
    expect(mocks.buildPlanCatalog).toHaveBeenLastCalledWith({ userId: 'user-1', mobileApp: { trialDeviceKey: key } })
    await GET(new Request('https://lk.example/api/mobile/checkout?deviceKey=nope'))
    expect(mocks.buildPlanCatalog).toHaveBeenLastCalledWith({ userId: 'user-1', mobileApp: { trialDeviceKey: null } })
  })
})

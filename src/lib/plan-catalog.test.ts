import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    plan: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    trialPlanRedemption: { findMany: vi.fn(), findUnique: vi.fn() },
    subscription: { findFirst: vi.fn(), count: vi.fn() },
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/payment-providers', () => ({ getAvailablePaymentProviders: vi.fn(async () => [{ id: 'YOOKASSA' }]) }))
vi.mock('@/lib/plan-access', () => ({
  getPlanAudienceContext: vi.fn(async () => null),
  isPlanAvailableForUser: vi.fn(() => true),
}))
vi.mock('@/lib/user-promo-codes', () => ({ getAvailableUserPromoCodesByPlan: vi.fn(async () => new Map()) }))
vi.mock('@/lib/auto-renewal', () => ({ getAutoRenewalState: vi.fn(async () => null) }))
vi.mock('@/lib/remnawave', () => ({
  hasRemnawaveUserReference: vi.fn(() => false),
  remnawave: { getUser: vi.fn() },
  remnawaveUserReference: vi.fn(),
}))

import { buildPlanCatalog } from './plan-catalog'

const basePlan = {
  priceKopecks: 30_000, durationDays: 30, unlimitedDuration: false, trafficLimitGb: null, deviceLimit: 3,
  unlimitedDevices: false, maxDeviceLimit: 10, deviceAddonEnabled: false, extraDevicePriceKopecks: 0,
  whitelistAddonEnabled: false, whitelistAddonPriceKopecks: 0, whitelistAddonInternalSquads: [],
  availability: 'ALL', isActive: true, promoCodesEnabled: false, popular: false, autoRenewalEnabled: false,
  description: null, sortOrder: 0,
}
const plans = [
  { ...basePlan, id: 'trial', name: 'Пробный', isPromo: true, priceKopecks: 0, durationDays: 3 },
  { ...basePlan, id: 'month', name: 'Месяц', isPromo: false },
]
// Новый пользователь без Telegram (вошёл по почте или через Яндекс).
const user = {
  role: 'USER', personalDiscountPercent: 0, nextPurchaseDiscountPercent: 0, telegramId: null,
  remnashopUserId: null, remnashopSyncedAt: null, remnawaveId: null, remnawaveUuid: null, remnawaveUsername: null,
}
const key = 'c'.repeat(64)

describe('витрина тарифов: пробный период', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.plan.findMany.mockResolvedValue(plans)
    mocks.prisma.user.findUnique.mockResolvedValue(user)
    mocks.prisma.trialPlanRedemption.findMany.mockResolvedValue([])
    mocks.prisma.trialPlanRedemption.findUnique.mockResolvedValue(null)
    mocks.prisma.subscription.findFirst.mockResolvedValue(null)
    mocks.prisma.subscription.count.mockResolvedValue(0)
  })

  const ids = (catalog: Awaited<ReturnType<typeof buildPlanCatalog>>) => catalog.plans.map((p) => p.id)

  it('на сайте без Telegram пробного нет и просим привязать Telegram', async () => {
    const catalog = await buildPlanCatalog({ userId: 'u1' })
    expect(ids(catalog)).toEqual(['month'])
    expect(catalog.needsTelegramCheckForPromo).toBe(true)
  })

  it('в приложении пробный есть без Telegram, если телефон его ещё не брал', async () => {
    const catalog = await buildPlanCatalog({ userId: 'u1', mobileApp: { trialDeviceKey: key } })
    expect(ids(catalog)).toContain('trial')
    expect(catalog.needsTelegramCheckForPromo).toBe(false)
    expect(mocks.prisma.trialPlanRedemption.findUnique).toHaveBeenCalledWith({ where: { deviceKey: key }, select: { id: true } })
  })

  it('в приложении пробного нет: телефон уже брал, нет ключа телефона или уже была подписка', async () => {
    mocks.prisma.trialPlanRedemption.findUnique.mockResolvedValueOnce({ id: 'r1' })
    expect(ids(await buildPlanCatalog({ userId: 'u1', mobileApp: { trialDeviceKey: key } }))).toEqual(['month'])
    expect(ids(await buildPlanCatalog({ userId: 'u1', mobileApp: { trialDeviceKey: null } }))).toEqual(['month'])
    mocks.prisma.subscription.count.mockResolvedValue(1)
    const catalog = await buildPlanCatalog({ userId: 'u1', mobileApp: { trialDeviceKey: key } })
    expect(ids(catalog)).toEqual(['month'])
    expect(catalog.needsTelegramCheckForPromo).toBe(false)
  })
})

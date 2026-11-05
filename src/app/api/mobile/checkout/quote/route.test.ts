import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  rateLimit: vi.fn(),
  planFind: vi.fn(),
  userFind: vi.fn(),
  validatePromo: vi.fn(),
}))

vi.mock('@/lib/auth/guard', () => ({ requireAuth: mocks.requireAuth, withAuth: (handler: unknown) => handler }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rateLimit }))
vi.mock('@/lib/prisma', () => ({
  prisma: { plan: { findUnique: mocks.planFind }, user: { findUnique: mocks.userFind } },
}))
vi.mock('@/lib/promo-codes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/promo-codes')>()),
  validatePromoCodeForPlan: mocks.validatePromo,
}))

import { POST } from './route'
import { PromoCodeError } from '@/lib/promo-codes'

const plan = {
  id: 'p90',
  isActive: true,
  isPromo: false,
  priceKopecks: 90_000,
  durationDays: 90,
  unlimitedDuration: false,
  deviceLimit: 3,
  unlimitedDevices: false,
  maxDeviceLimit: 10,
  extraDevicePriceKopecks: 10_000,
  whitelistAddonEnabled: true,
  whitelistAddonPriceKopecks: 15_000,
  whitelistAddonInternalSquads: ['wl'],
}

function quote(body: unknown) {
  return POST(new Request('http://localhost/api/mobile/checkout/quote', {
    method: 'POST',
    body: JSON.stringify(body),
  }))
}

describe('POST /api/mobile/checkout/quote', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ uid: 'user-1', aud: 'mobile', sid: 'ms-1' })
    mocks.rateLimit.mockResolvedValue({ ok: true })
    mocks.planFind.mockResolvedValue(plan)
    mocks.userFind.mockResolvedValue({ personalDiscountPercent: 0, nextPurchaseDiscountPercent: 0 })
  })

  it('считает устройства и дополнение без скидок', async () => {
    const res = await quote({ planId: 'p90', deviceLimit: 5, whitelistAddon: true })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      deviceLimit: 5,
      extraDeviceCount: 2,
      extraDeviceAmountKopecks: 20_000,
      discount: null,
      whitelistAddonKopecks: 15_000,
      totalOriginalKopecks: 125_000,
      totalKopecks: 125_000,
      renewalKopecks: 125_000,
    })
  })

  it('персональная скидка — от цены тарифа, как при оплате', async () => {
    mocks.userFind.mockResolvedValue({ personalDiscountPercent: 10, nextPurchaseDiscountPercent: 0 })
    const body = await (await quote({ planId: 'p90', deviceLimit: 3 })).json()
    expect(body.discount).toEqual({ source: 'PERSONAL', code: null, percent: 10, kopecks: 9_000 })
    expect(body.totalKopecks).toBe(81_000)
    expect(body.renewalKopecks).toBe(81_000)
  })

  it('выгодный промокод побеждает персональную скидку', async () => {
    mocks.userFind.mockResolvedValue({ personalDiscountPercent: 5, nextPurchaseDiscountPercent: 0 })
    mocks.validatePromo.mockResolvedValue({ normalizedCode: 'SALE20', discountPercent: 20, discountKopecks: 18_000 })
    const body = await (await quote({ planId: 'p90', deviceLimit: 3, promoCode: 'sale20' })).json()
    expect(body.discount).toEqual({ source: 'PROMO', code: 'SALE20', percent: 20, kopecks: 18_000 })
    expect(body.promoOutweighed).toBe(false)
    expect(body.totalKopecks).toBe(72_000)
  })

  it('слабый промокод не применяется, приложение узнаёт об этом', async () => {
    mocks.userFind.mockResolvedValue({ personalDiscountPercent: 30, nextPurchaseDiscountPercent: 0 })
    mocks.validatePromo.mockResolvedValue({ normalizedCode: 'SALE10', discountPercent: 10, discountKopecks: 9_000 })
    const body = await (await quote({ planId: 'p90', deviceLimit: 3, promoCode: 'SALE10' })).json()
    expect(body.discount.source).toBe('PERSONAL')
    expect(body.promoOutweighed).toBe(true)
  })

  it('ошибка промокода уходит с кодом и статусом', async () => {
    mocks.validatePromo.mockRejectedValue(new PromoCodeError('Промокод не найден', 404, 'PROMO_NOT_FOUND'))
    const res = await quote({ planId: 'p90', promoCode: 'NOPE' })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Промокод не найден', code: 'PROMO_NOT_FOUND' })
  })

  it('лимит устройств вне диапазона', async () => {
    const res = await quote({ planId: 'p90', deviceLimit: 11 })
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('DEVICE_LIMIT_OUT_OF_RANGE')
  })

  it('дополнение недоступно — 422', async () => {
    mocks.planFind.mockResolvedValue({ ...plan, whitelistAddonEnabled: false })
    const res = await quote({ planId: 'p90', whitelistAddon: true })
    expect(res.status).toBe(422)
  })

  it('неактивный тариф — 404', async () => {
    mocks.planFind.mockResolvedValue({ ...plan, isActive: false })
    expect((await quote({ planId: 'p90' })).status).toBe(404)
  })

  it('лишние поля отклоняются', async () => {
    expect((await quote({ planId: 'p90', amountKopecks: 1 })).status).toBe(400)
  })

  it('частые запросы — 429', async () => {
    mocks.rateLimit.mockResolvedValue({ ok: false, retryAfter: 30 })
    const res = await quote({ planId: 'p90' })
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('30')
  })
})

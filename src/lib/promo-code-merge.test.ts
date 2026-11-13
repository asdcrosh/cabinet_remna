import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const prisma = {
    promoCode: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    promoCodeMerge: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  }
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma))
  return { prisma, remnashopQuery: vi.fn() }
})

vi.mock('./prisma', () => ({ prisma: mocks.prisma }))
vi.mock('./remnashop-db', () => ({ remnashopQuery: mocks.remnashopQuery }))

import {
  calculateMergedDiscount,
  getPromoMergeOverview,
  mergePromoCodes,
  mergedRarity,
  PromoMergeError,
} from './promo-code-merge'

const settings = { enabled: true, coefficientPercent: 70, capPercent: 30, ttlDays: 7 }
const NOW = new Date('2026-11-13T12:00:00.000Z')

function code(id: string, discountPercent: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    code: `BOX-${id.toUpperCase()}`,
    discountPercent,
    audience: 'ALL',
    purchaseScope: 'ANY',
    allowedEmails: [],
    isActive: true,
    startsAt: null,
    expiresAt: new Date('2026-11-16T12:00:00.000Z'),
    maxUses: 1,
    maxUsesPerUser: 1,
    remnashopPromoCodeId: null,
    plans: [],
    redemptions: [],
    bonusBoxOpenings: [{ userId: 'user-1', prize: { rarity: discountPercent >= 20 ? 'EPIC' : 'COMMON' } }],
    mergeResult: null,
    ...extra,
  }
}

describe('calculateMergedDiscount', () => {
  it.each([
    [[5, 5], 7],
    [[5, 5, 5], 10],
    [[5, 5, 5, 20], 24],
    [[15, 20], 24],
    [[20, 20], 28],
    [[15, 20, 20], 30],
  ])('%j → %i%%', (percents, expected) => {
    expect(calculateMergedDiscount(percents, settings)).toBe(expected)
  })

  it('never returns less than the best source code', () => {
    expect(calculateMergedDiscount([25, 1], settings)).toBe(25)
  })
})

describe('mergedRarity', () => {
  it('colours the code by its strength', () => {
    expect(mergedRarity(7, 30)).toBe('COMMON')
    expect(mergedRarity(15, 30)).toBe('RARE')
    expect(mergedRarity(24, 30)).toBe('EPIC')
    expect(mergedRarity(30, 30)).toBe('LEGENDARY')
  })
})

describe('getPromoMergeOverview', () => {
  beforeEach(() => vi.clearAllMocks())

  it('enables merging only with two codes below the cap', async () => {
    mocks.prisma.promoCode.findMany.mockResolvedValueOnce([code('a', 5), code('b', 50)])
    const one = await getPromoMergeOverview('user-1', settings, NOW)
    expect(one.canMerge).toBe(false)
    expect(one.codes.find((item) => item.id === 'b')).toMatchObject({ mergeable: false, reason: 'AT_CAP' })

    mocks.prisma.promoCode.findMany.mockResolvedValueOnce([code('a', 5), code('c', 20), code('b', 50)])
    const two = await getPromoMergeOverview('user-1', settings, NOW)
    expect(two.canMerge).toBe(true)
  })

  it('keeps the button off when merging is disabled', async () => {
    mocks.prisma.promoCode.findMany.mockResolvedValueOnce([code('a', 5), code('c', 20)])
    const overview = await getPromoMergeOverview('user-1', { ...settings, enabled: false }, NOW)
    expect(overview.canMerge).toBe(false)
  })

  it('looks only at the user\'s own active single-use unused codes', async () => {
    mocks.prisma.promoCode.findMany.mockResolvedValueOnce([])
    await getPromoMergeOverview('user-1', settings, NOW)
    const where = mocks.prisma.promoCode.findMany.mock.calls[0]![0].where
    expect(where).toMatchObject({ isActive: true, maxUses: 1, expiresAt: { gt: NOW } })
    expect(JSON.stringify(where.AND)).toContain('"userId":"user-1"')
    expect(where.redemptions).toEqual({ none: { status: { in: ['PENDING', 'SUCCEEDED'] } } })
  })
})

describe('mergePromoCodes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.REMNASHOP_DATABASE_URL
    mocks.prisma.promoCodeMerge.findUnique.mockResolvedValue(null)
    mocks.prisma.promoCode.findUnique.mockResolvedValue(null)
    mocks.prisma.promoCode.create.mockImplementation(async ({ data }) => ({ id: 'result-1', ...data }))
    mocks.prisma.promoCodeMerge.create.mockImplementation(async ({ data }) => ({
      ...data,
      resultPromo: {
        id: 'result-1',
        code: 'BOX-RESULT',
        discountPercent: 24,
        expiresAt: new Date('2026-11-20T12:00:00.000Z'),
      },
    }))
  })

  const input = (ids: string[]) => ({
    userId: 'user-1',
    promoCodeIds: ids,
    idempotencyKey: '2f5a1c55-8f07-4d1b-9d5e-6d1f7b0b3a11',
    settings,
    now: NOW,
  })

  it('replaces the source codes with one personal code for seven days', async () => {
    const sources = [code('a', 5), code('b', 5), code('c', 5), code('d', 20)]
    mocks.prisma.promoCode.findMany.mockResolvedValue(sources)

    const result = await mergePromoCodes(input(['a', 'b', 'c', 'd']))

    expect(mocks.prisma.$queryRaw).toHaveBeenCalled()
    expect(mocks.prisma.promoCode.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'b', 'c', 'd'] } },
      data: { isActive: false },
    })
    const created = mocks.prisma.promoCode.create.mock.calls[0]![0].data
    expect(created).toMatchObject({
      discountPercent: 24,
      audience: 'PERSONAL',
      allowedEmails: [],
      maxUses: 1,
      maxUsesPerUser: 1,
      isActive: true,
      expiresAt: new Date('2026-11-20T12:00:00.000Z'),
    })
    expect(created.code).toMatch(/^BOX-[0-9A-F]{8}$/)
    expect(mocks.prisma.promoCodeMerge.create.mock.calls[0]![0].data).toMatchObject({
      userId: 'user-1',
      sourcePercents: [5, 5, 5, 20],
      coefficientPercent: 70,
      capPercent: 30,
    })
    expect(result).toMatchObject({ bestSourcePercent: 20, replayed: false })
    expect(result.promoCode).toMatchObject({ discountPercent: 24, rarity: 'EPIC', merged: true })
  })

  it('returns the same result for a repeated request', async () => {
    mocks.prisma.promoCodeMerge.findUnique.mockResolvedValue({
      sourcePercents: [5, 5],
      capPercent: 30,
      resultPromo: { id: 'result-1', code: 'BOX-RESULT', discountPercent: 7, expiresAt: NOW },
    })

    const result = await mergePromoCodes(input(['a', 'b']))

    expect(result.replayed).toBe(true)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('refuses codes at the cap', async () => {
    mocks.prisma.promoCode.findMany.mockResolvedValue([code('a', 5), code('f', 50)])

    await expect(mergePromoCodes(input(['a', 'f']))).rejects.toMatchObject({ code: 'PROMO_MERGE_NOT_ALLOWED' })
    expect(mocks.prisma.promoCode.updateMany).not.toHaveBeenCalled()
  })

  it('refuses when a code is gone, used or belongs to someone else', async () => {
    mocks.prisma.promoCode.findMany.mockResolvedValue([code('a', 5)])

    await expect(mergePromoCodes(input(['a', 'x']))).rejects.toMatchObject({ code: 'PROMO_MERGE_UNAVAILABLE' })
  })

  it('needs two to six distinct codes', async () => {
    await expect(mergePromoCodes(input(['a']))).rejects.toBeInstanceOf(PromoMergeError)
    await expect(mergePromoCodes(input(['a', 'a']))).rejects.toMatchObject({ code: 'PROMO_MERGE_DUPLICATE' })
    await expect(mergePromoCodes(input(['1', '2', '3', '4', '5', '6', '7']))).rejects.toMatchObject({ code: 'PROMO_MERGE_COUNT' })
  })

  it('refuses when merging is turned off', async () => {
    await expect(mergePromoCodes({ ...input(['a', 'b']), settings: { ...settings, enabled: false } }))
      .rejects.toMatchObject({ code: 'PROMO_MERGE_DISABLED' })
  })

  it('refuses a code already activated in the Telegram bot', async () => {
    process.env.REMNASHOP_DATABASE_URL = 'postgres://remnashop'
    mocks.prisma.promoCode.findMany.mockResolvedValue([
      code('a', 5, { remnashopPromoCodeId: 11 }),
      code('b', 5, { remnashopPromoCodeId: 12 }),
    ])
    mocks.remnashopQuery.mockResolvedValue({ rows: [{ used: 1 }] })

    await expect(mergePromoCodes(input(['a', 'b']))).rejects.toMatchObject({ code: 'PROMO_MERGE_CODE_USED' })
    expect(mocks.remnashopQuery.mock.calls[0]![1]).toEqual([[11, 12]])
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('stops when the bot database cannot be checked', async () => {
    process.env.REMNASHOP_DATABASE_URL = 'postgres://remnashop'
    mocks.prisma.promoCode.findMany.mockResolvedValue([
      code('a', 5, { remnashopPromoCodeId: 11 }),
      code('b', 5),
    ])
    mocks.remnashopQuery.mockRejectedValue(new Error('connection refused'))

    await expect(mergePromoCodes(input(['a', 'b']))).rejects.toMatchObject({ code: 'PROMO_MERGE_CHECK_FAILED', status: 503 })
  })
})

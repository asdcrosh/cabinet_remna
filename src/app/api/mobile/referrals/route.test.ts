import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  enabled: vi.fn(),
  rateLimit: vi.fn(),
  userCount: vi.fn(),
  userFindMany: vi.fn(),
  rewardAggregate: vi.fn(),
  settings: vi.fn(),
  ensureCode: vi.fn(),
}))

vi.mock('@/lib/auth/guard', () => ({ requireAuth: mocks.requireAuth, withAuth: (handler: unknown) => handler }))
vi.mock('@/lib/feature-flags', () => ({ isFeatureEnabled: mocks.enabled }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rateLimit }))
vi.mock('@/lib/app-url', () => ({ getAppUrl: () => 'https://lk.example' }))
vi.mock('@/lib/referrals', () => ({ ensureUserReferralCode: mocks.ensureCode }))
vi.mock('@/lib/referral-settings', () => ({ getEffectiveReferralSettings: mocks.settings }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { count: mocks.userCount, findMany: mocks.userFindMany },
    referralReward: { aggregate: mocks.rewardAggregate },
  },
}))

import { GET } from './route'

const settings = {
  trigger: 'FIRST_PAYMENT',
  minimumPaymentKopecks: 50_000,
  maxRewardsPerReferrer: 0,
  referrerBonusDays: 7,
  referredBonusDays: 3,
  referrerAttempts: 1,
  referredAttempts: 0,
  promotionEndsAt: null,
}

function get(query = '') {
  return GET(new Request(`https://lk.example/api/mobile/referrals${query}`))
}

describe('GET /api/mobile/referrals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ uid: 'u1' })
    mocks.enabled.mockResolvedValue(true)
    mocks.rateLimit.mockResolvedValue({ ok: true })
    mocks.settings.mockResolvedValue(settings)
    mocks.ensureCode.mockResolvedValue('ABC123')
    mocks.userCount.mockResolvedValueOnce(3).mockResolvedValueOnce(1)
    mocks.rewardAggregate
      .mockResolvedValueOnce({ _sum: { bonusDays: 7 }, _count: 1 })
      .mockResolvedValueOnce({ _sum: { bonusDays: null }, _count: 0 })
    mocks.userFindMany.mockResolvedValue([
      {
        id: 'r1', email: 'friend@mail.ru', name: null, telegramUsername: null,
        createdAt: new Date('2026-11-01T10:00:00Z'),
        payments: [{ id: 'p1', paidAt: new Date('2026-11-02T10:00:00Z'), createdAt: new Date('2026-11-02T09:00:00Z') }],
        referralRewardAsReferred: { status: 'APPLIED', bonusDays: 7, referrerAttempts: 1, appliedAt: new Date('2026-11-02T10:05:00Z'), createdAt: new Date('2026-11-02T10:00:00Z') },
      },
      {
        id: 'r2', email: 'telegram-55@pending.invalid', name: null, telegramUsername: 'neo',
        createdAt: new Date('2026-11-03T10:00:00Z'),
        payments: [],
        referralRewardAsReferred: null,
      },
    ])
  })

  it('отдаёт ссылку, условия, итоги и приглашённых с маской почты', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.code).toBe('ABC123')
    expect(body.url).toBe('https://lk.example/register?ref=ABC123')
    expect(body.condition).toBe('Награды после первой оплаты от 500 ₽')
    expect(body.rewards).toMatchObject({ referrerBonusDays: 7, referredBonusDays: 3, referrerAttempts: 1 })
    expect(body.stats).toEqual({ invited: 3, paid: 1, conversion: 33, appliedDays: 7, pendingDays: 0 })
    expect(body.referrals[0]).toMatchObject({
      name: 'fr***@mail.ru',
      email: 'fr***@mail.ru',
      status: 'APPLIED',
      label: 'Начислен',
      paidAt: '2026-11-02T10:00:00.000Z',
    })
    expect(body.referrals[1]).toMatchObject({ name: '@neo', email: 'Telegram Mini App', status: 'WAITING_PAYMENT', paidAt: null })
    expect(JSON.stringify(body)).not.toContain('friend@')
  })

  it('страница из запроса, только свои приглашённые', async () => {
    await get('?page=2')
    expect(mocks.userFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { referredById: 'u1' }, skip: 50, take: 50,
    }))
  })

  it('выключено в кабинете — 404', async () => {
    mocks.enabled.mockResolvedValue(false)
    const res = await get()
    expect(res.status).toBe(404)
    expect(mocks.ensureCode).not.toHaveBeenCalled()
  })

  it('лимит запросов', async () => {
    mocks.rateLimit.mockResolvedValue({ ok: false, retryAfter: 20 })
    const res = await get()
    expect(res.status).toBe(429)
  })
})

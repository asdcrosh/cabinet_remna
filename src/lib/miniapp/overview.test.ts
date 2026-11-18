import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  getFeatureFlags: vi.fn(),
  buildPlanCatalog: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: mocks.findUnique } } }))
vi.mock('@/lib/feature-flags', () => ({ getFeatureFlags: mocks.getFeatureFlags }))
vi.mock('@/lib/plan-catalog', () => ({ buildPlanCatalog: mocks.buildPlanCatalog }))
vi.mock('@/lib/branding', () => ({ getBrandName: () => 'VPN' }))
vi.mock('@/lib/remnawave', () => ({ remnawave: { getSubscriptionByUsername: vi.fn() } }))
vi.mock('./stars', () => ({ starsEnabled: () => false, starsRateKopecks: () => 0 }))

import { getMiniAppOverview } from './overview'

function account(role: string) {
  return {
    id: 'user-1', role, name: 'Иван', telegramUsername: 'ivan', remnawaveUsername: null,
    subscriptions: [], _count: { devices: 0 },
  }
}

describe('Mini App overview admin flag', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getFeatureFlags.mockResolvedValue({ referrals: true, bonusBox: true, support: true, broadcasts: true, newDesign: true })
    mocks.buildPlanCatalog.mockResolvedValue({ plans: [] })
  })

  it.each([
    ['USER', false],
    ['MODERATOR', false],
    ['ADMIN', true],
    ['SUPER_ADMIN', true],
  ])('%s sees the «Управление» section: %s', async (role, expected) => {
    mocks.findUnique.mockResolvedValue(account(role))
    const overview = await getMiniAppOverview('user-1')
    expect(overview.admin).toBe(expected)
  })
})

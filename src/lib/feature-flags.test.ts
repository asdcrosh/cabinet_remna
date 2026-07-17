import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    featureSetting: {
      findUnique: mocks.findUnique,
      upsert: mocks.upsert,
    },
  },
}))

import { getFeatureFlags, isFeatureEnabled, updateFeatureFlags } from './feature-flags'

const keys = ['FEATURE_REFERRALS', 'FEATURE_SUPPORT', 'FEATURE_BROADCASTS', 'BONUS_BOX_ENABLED'] as const
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findUnique.mockResolvedValue(null)
})

afterEach(() => {
  for (const key of keys) {
    const value = original[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('feature flags', () => {
  it('uses environment defaults until settings are saved in the database', async () => {
    for (const key of keys) delete process.env[key]
    await expect(getFeatureFlags()).resolves.toEqual({
      referrals: true,
      bonusBox: true,
      support: true,
      broadcasts: true,
    })
  })

  it('prefers database settings over environment flags', async () => {
    process.env.BONUS_BOX_ENABLED = 'false'
    mocks.findUnique.mockResolvedValue({
      referrals: true,
      bonusBox: true,
      support: false,
      broadcasts: true,
    })

    await expect(isFeatureEnabled('bonusBox')).resolves.toBe(true)
    await expect(isFeatureEnabled('support')).resolves.toBe(false)
  })

  it('saves all flags in the singleton row', async () => {
    const flags = { referrals: false, bonusBox: true, support: false, broadcasts: true }
    mocks.upsert.mockResolvedValue(flags)

    await expect(updateFeatureFlags(flags)).resolves.toEqual(flags)
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'default' },
      create: { id: 'default', ...flags },
      update: flags,
    }))
  })
})

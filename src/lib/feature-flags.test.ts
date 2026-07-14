import { afterEach, describe, expect, it } from 'vitest'
import { getFeatureFlags, isFeatureEnabled } from './feature-flags'

const keys = ['FEATURE_REFERRALS', 'FEATURE_SUPPORT', 'FEATURE_BROADCASTS', 'BONUS_BOX_ENABLED'] as const
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]))

afterEach(() => {
  for (const key of keys) {
    const value = original[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('feature flags', () => {
  it('uses enabled defaults', () => {
    for (const key of keys) delete process.env[key]
    expect(getFeatureFlags()).toEqual({ referrals: true, bonusBox: true, support: true, broadcasts: true })
  })

  it('uses the bonus box runtime flag and accepts common false values', () => {
    process.env.BONUS_BOX_ENABLED = 'false'
    process.env.FEATURE_SUPPORT = 'off'
    process.env.FEATURE_BROADCASTS = '0'
    expect(isFeatureEnabled('bonusBox')).toBe(false)
    expect(isFeatureEnabled('support')).toBe(false)
    expect(isFeatureEnabled('broadcasts')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import {
  resolveReferralSettings,
  STANDARD_REFERRAL_SETTINGS,
  type ReferralSettings,
} from './referral-settings'

const promotion: ReferralSettings = {
  trigger: 'REGISTRATION',
  minimumPaymentKopecks: 0,
  maxRewardsPerReferrer: 50,
  referrerBonusDays: 30,
  referredBonusDays: 14,
  referrerAttempts: 10,
  referredAttempts: 5,
  promotionEndsAt: '2026-07-31T20:59:59.999Z',
}

describe('resolveReferralSettings', () => {
  it('keeps promotional conditions through the configured end date', () => {
    expect(resolveReferralSettings(
      promotion,
      new Date('2026-07-31T20:59:59.999Z')
    )).toEqual(promotion)
  })

  it('returns the standard inviter-only reward after expiration', () => {
    expect(resolveReferralSettings(
      promotion,
      new Date('2026-07-31T21:00:00.000Z')
    )).toEqual(STANDARD_REFERRAL_SETTINGS)
  })
})

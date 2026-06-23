import { describe, expect, it } from 'vitest'
import { isPlanAvailableForUser, type PlanAudienceContext } from './plan-access'

const baseUser: PlanAudienceContext = {
  email: 'user@example.com',
  telegramId: 123456789n,
  isInvited: false,
  hasPaidSubscription: false,
}

function plan(
  availability: 'ALL' | 'NEW' | 'EXISTING' | 'INVITED' | 'ALLOWED' | 'LINK',
  overrides: Partial<{ allowedEmails: string[]; allowedTelegramIds: string[] }> = {}
) {
  return {
    availability,
    allowedEmails: overrides.allowedEmails ?? [],
    allowedTelegramIds: overrides.allowedTelegramIds ?? [],
  }
}

describe('plan availability', () => {
  it('handles all, new and existing audiences', () => {
    expect(isPlanAvailableForUser(plan('ALL'), baseUser)).toBe(true)
    expect(isPlanAvailableForUser(plan('NEW'), baseUser)).toBe(true)
    expect(isPlanAvailableForUser(plan('EXISTING'), baseUser)).toBe(false)

    const existing = { ...baseUser, hasPaidSubscription: true }
    expect(isPlanAvailableForUser(plan('NEW'), existing)).toBe(false)
    expect(isPlanAvailableForUser(plan('EXISTING'), existing)).toBe(true)
  })

  it('handles invited and explicitly allowed users', () => {
    expect(isPlanAvailableForUser(plan('INVITED'), baseUser)).toBe(false)
    expect(isPlanAvailableForUser(plan('INVITED'), { ...baseUser, isInvited: true })).toBe(true)
    expect(isPlanAvailableForUser(plan('ALLOWED', { allowedEmails: ['USER@example.com'] }), baseUser)).toBe(true)
    expect(isPlanAvailableForUser(plan('ALLOWED', { allowedTelegramIds: ['123456789'] }), baseUser)).toBe(true)
    expect(isPlanAvailableForUser(plan('ALLOWED'), baseUser)).toBe(false)
  })

  it('shows link plans only in a direct-link flow', () => {
    expect(isPlanAvailableForUser(plan('LINK'), baseUser)).toBe(false)
    expect(isPlanAvailableForUser(plan('LINK'), baseUser, { allowLink: true })).toBe(true)
  })
})

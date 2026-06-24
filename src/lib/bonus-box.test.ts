import { describe, expect, it, vi } from 'vitest'
import type { BonusBoxPrize, BonusBoxRarity } from '@prisma/client'

vi.mock('./prisma', () => ({ prisma: {} }))
vi.mock('./remnawave', () => ({ remnawave: {} }))

import { applyBonusBoxEconomyGuard, getBonusBoxConfig } from './bonus-box'

type Config = ReturnType<typeof getBonusBoxConfig>

const config: Config = {
  enabled: true,
  rubPerAttempt: 300,
  minAttemptsPerPayment: 1,
  maxAttemptsPerPayment: 10,
  attemptTtlDays: 30,
  weeklyEnabled: true,
  weeklyDay: 5,
  weeklyAttempts: 1,
  weeklyMaxBalance: 3,
  referrerAttempts: 2,
  referredAttempts: 1,
  promoExpiresInDays: 7,
  economyGuardEnabled: true,
  rareCooldownOpenings: 2,
  epicCooldownOpenings: 8,
  legendaryCooldownOpenings: 30,
  epicMinOpenings: 4,
  legendaryMinOpenings: 12,
}

describe('applyBonusBoxEconomyGuard', () => {
  it('does not let frequent rare prizes reset the legendary path', () => {
    const available = applyBonusBoxEconomyGuard(
      prizes(),
      history([
        'RARE',
        'COMMON',
        'COMMON',
        'RARE',
        'COMMON',
        'COMMON',
        'RARE',
        'COMMON',
        'COMMON',
        'RARE',
        'COMMON',
        'COMMON',
      ]),
      config
    )

    expect(ids(available)).toContain('legendary')
  })

  it('allows epic after the short rare pause instead of the full epic cooldown', () => {
    const available = applyBonusBoxEconomyGuard(
      prizes(),
      history(['COMMON', 'COMMON', 'RARE', 'COMMON', 'COMMON', 'COMMON']),
      config
    )

    expect(ids(available)).toContain('epic')
  })

  it('does not let epic prizes reset the legendary path', () => {
    const available = applyBonusBoxEconomyGuard(
      prizes(),
      history([
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'EPIC',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
      ]),
      config
    )

    expect(ids(available)).toContain('legendary')
  })

  it('keeps legendary closed for the long cooldown after a legendary prize', () => {
    const available = applyBonusBoxEconomyGuard(
      prizes(),
      history([
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'COMMON',
        'LEGENDARY',
      ]),
      config
    )

    expect(ids(available)).not.toContain('legendary')
  })
})

function prizes() {
  return [
    prize('common', 'COMMON'),
    prize('rare', 'RARE'),
    prize('epic', 'EPIC'),
    prize('legendary', 'LEGENDARY'),
  ]
}

function prize(id: string, rarity: BonusBoxRarity): BonusBoxPrize {
  return {
    id,
    title: id,
    description: null,
    type: 'SUBSCRIPTION_DAYS',
    value: 1,
    weight: 10,
    rarity,
    isActive: true,
    maxWins: null,
    winsCount: 0,
    promoExpiresInDays: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  }
}

function history(rarities: BonusBoxRarity[]) {
  return rarities.map((rarity) => ({ prize: { rarity } }))
}

function ids(prizes: BonusBoxPrize[]) {
  return prizes.map((prize) => prize.id)
}

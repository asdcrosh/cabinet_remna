import { describe, expect, it } from 'vitest'
import { resolveSubscriptionPresentation } from './subscription-presentation'

const now = new Date('2026-09-19T12:00:00.000Z')

describe('subscription presentation', () => {
  it('keeps a paused local subscription paused when Remnawave reports disabled', () => {
    const state = resolveSubscriptionPresentation({
      localStatus: 'PAUSED',
      remoteStatus: 'DISABLED',
      localExpireAt: new Date('2026-10-01T00:00:00.000Z'),
      now,
    })
    expect(state).toMatchObject({ status: 'PAUSED', phase: 'paused', usable: false, requiresRenewal: false })
  })

  it('uses grace as the effective limited state', () => {
    const state = resolveSubscriptionPresentation({
      localStatus: 'EXPIRED',
      remoteStatus: 'EXPIRED',
      graceExpireAt: new Date('2026-09-22T12:00:00.000Z'),
      now,
    })
    expect(state).toMatchObject({ status: 'LIMITED', phase: 'grace', daysLeft: 3, usable: true })
  })

  it('does not expire an unlimited subscription by its technical date', () => {
    const state = resolveSubscriptionPresentation({
      localStatus: 'ACTIVE',
      localExpireAt: new Date('2025-01-01T00:00:00.000Z'),
      unlimitedDuration: true,
      remoteUnavailable: true,
      now,
    })
    expect(state).toMatchObject({ status: 'ACTIVE', phase: 'active', daysLeft: null, usable: true })
  })

  it('shows pending synchronization separately from active access', () => {
    const state = resolveSubscriptionPresentation({
      localStatus: 'ACTIVE',
      localExpireAt: new Date('2026-10-01T00:00:00.000Z'),
      pendingSync: true,
      now,
    })
    expect(state).toMatchObject({ status: 'ACTIVE', phase: 'syncing', usable: true })
  })

  it('falls back to saved state when Remnawave is unavailable', () => {
    const state = resolveSubscriptionPresentation({
      localStatus: 'LIMITED',
      localExpireAt: new Date('2026-09-20T12:00:00.000Z'),
      remoteUnavailable: true,
      now,
    })
    expect(state).toMatchObject({ status: 'LIMITED', phase: 'limited', daysLeft: 1, remoteUnavailable: true })
    expect(state.description).toContain('последние сохранённые данные')
  })
})

import { describe, expect, it } from 'vitest'
import { buildBroadcastAudiencePreview } from './broadcast-audience'

describe('buildBroadcastAudiencePreview', () => {
  it('counts unique recipients and respects channel and broadcast preferences', () => {
    const users = [
      audienceUser({ emailVerifiedAt: new Date(), telegramId: 101n }),
      audienceUser({
        email: 'disabled@example.com',
        emailVerifiedAt: new Date(),
        telegramId: 102n,
        notificationPreference: preferences({ broadcastsEnabled: false }),
      }),
      audienceUser({
        email: 'telegram@example.com',
        telegramId: 103n,
        notificationPreference: preferences({ inAppEnabled: false, emailEnabled: false }),
      }),
      audienceUser({ email: 'pending@pending.invalid', emailVerifiedAt: new Date() }),
    ]

    expect(buildBroadcastAudiencePreview(users, new Set(['IN_APP', 'EMAIL', 'TELEGRAM']))).toEqual({
      recipients: 3,
      channels: { inApp: 2, telegram: 2, email: 1 },
    })
  })

  it('returns zero for channels that were not selected', () => {
    const users = [audienceUser({ emailVerifiedAt: new Date(), telegramId: 101n })]
    expect(buildBroadcastAudiencePreview(users, new Set(['EMAIL']))).toEqual({
      recipients: 1,
      channels: { inApp: 0, telegram: 0, email: 1 },
    })
  })
})

function audienceUser(overrides: Partial<{
  email: string
  emailVerifiedAt: Date | null
  telegramId: bigint | null
  notificationPreference: ReturnType<typeof preferences> | null
}> = {}) {
  return {
    email: 'user@example.com',
    emailVerifiedAt: null,
    telegramId: null,
    notificationPreference: null,
    ...overrides,
  }
}

function preferences(overrides: Partial<{
  broadcastsEnabled: boolean
  inAppEnabled: boolean
  telegramEnabled: boolean
  emailEnabled: boolean
}> = {}) {
  return {
    broadcastsEnabled: true,
    inAppEnabled: true,
    telegramEnabled: true,
    emailEnabled: true,
    ...overrides,
  }
}

export type BroadcastAudienceChannel = 'IN_APP' | 'EMAIL' | 'TELEGRAM'

type BroadcastAudienceUser = {
  email: string
  emailVerifiedAt: Date | null
  telegramId: bigint | null
  notificationPreference: {
    broadcastsEnabled: boolean
    inAppEnabled: boolean
    telegramEnabled: boolean
    emailEnabled: boolean
  } | null
}

export function buildBroadcastAudiencePreview(
  users: BroadcastAudienceUser[],
  channels: Set<BroadcastAudienceChannel>
) {
  const canUseChannel = (user: BroadcastAudienceUser, channel: BroadcastAudienceChannel) => {
    const preferences = user.notificationPreference
    if (preferences?.broadcastsEnabled === false) return false
    if (channel === 'IN_APP') return preferences?.inAppEnabled !== false
    if (channel === 'TELEGRAM') return Boolean(user.telegramId) && preferences?.telegramEnabled !== false
    return Boolean(user.emailVerifiedAt)
      && isDeliverableBroadcastEmail(user.email)
      && preferences?.emailEnabled !== false
  }

  return {
    recipients: users.filter((user) => Array.from(channels).some((channel) => canUseChannel(user, channel))).length,
    channels: {
      inApp: channels.has('IN_APP') ? users.filter((user) => canUseChannel(user, 'IN_APP')).length : 0,
      telegram: channels.has('TELEGRAM') ? users.filter((user) => canUseChannel(user, 'TELEGRAM')).length : 0,
      email: channels.has('EMAIL') ? users.filter((user) => canUseChannel(user, 'EMAIL')).length : 0,
    },
  }
}

export function isDeliverableBroadcastEmail(email: string) {
  return !email.endsWith('@pending.invalid') && !email.endsWith('@pending.invalid.local')
}

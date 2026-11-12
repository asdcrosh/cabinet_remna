import { describe, expect, it, vi } from 'vitest'
import { buildRichScreen } from './rich-screens'
import { channelCampaign, isChannelMember, isChannelReference } from './channel-referrals'
import { miniAppDemo } from './model'
import { isPaymentUpdate, telegramUpdateSchema, validWebhookSecret } from './bot'

describe('Telegram Mini App boundaries', () => {
  it('requires the webhook secret and never acknowledges legacy payments', () => {
    const secret = 'a'.repeat(48)
    expect(validWebhookSecret(secret, secret)).toBe(true)
    expect(validWebhookSecret('b'.repeat(48), secret)).toBe(false)
    expect(isPaymentUpdate({ pre_checkout_query: { id: 'q' } })).toBe(true)
    expect(isPaymentUpdate({ message: { successful_payment: { invoice_payload: 'legacy' } } })).toBe(true)
    expect(isPaymentUpdate({ message: { text: '/start' } })).toBe(false)
    expect(telegramUpdateSchema.safeParse({ update_id: 1, message: { chat: { id: 123, type: 'private' }, from: { id: 123 }, text: '/start' } }).success).toBe(true)
  })
  it('accepts only current channel members', () => {
    expect(isChannelMember({ status: 'member' })).toBe(true)
    expect(isChannelMember({ status: 'restricted', is_member: true })).toBe(true)
    expect(isChannelMember({ status: 'restricted', is_member: false })).toBe(false)
    expect(isChannelMember({ status: 'left' })).toBe(false)
  })
  it('accepts the configured public channel username and matching link', () => {
    expect(isChannelReference('@alekseevVP_Official')).toBe(true)
    expect(isChannelReference('https://t.me/alekseevVP_Official')).toBe(false)
    vi.stubEnv('TELEGRAM_CHANNEL_REWARDS_ENABLED', 'true')
    vi.stubEnv('TELEGRAM_REWARD_CHANNEL_ID', '@alekseevVP_Official')
    vi.stubEnv('TELEGRAM_REWARD_CHANNEL_URL', 'https://t.me/alekseevVP_Official')
    vi.stubEnv('TELEGRAM_REWARD_PLAN_ID', 'plan-1')
    vi.stubEnv('TELEGRAM_REWARD_REFERRER_DAYS', '7')
    vi.stubEnv('TELEGRAM_REWARD_REFERRED_DAYS', '7')
    vi.stubEnv('TELEGRAM_REWARD_MAX_PER_REFERRER', '20')
    try {
      expect(channelCampaign()?.channelId).toBe('@alekseevVP_Official')
      vi.stubEnv('TELEGRAM_REWARD_CHANNEL_URL', 'https://t.me/other_channel')
      expect(channelCampaign).toThrow('Channel rewards configuration is incomplete')
    } finally { vi.unstubAllEnvs() }
  })
  it('escapes dynamic chat content and keeps subscription keys outside the chat', () => {
    const html = buildRichScreen({ screen: 'devices', overview: miniAppDemo, appUrl: 'https://cabinet.example.test/miniapp', devices: [{ title: '<script>alert(1)</script>', platform: 'iOS' }] })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('subscriptionUrl')
    expect(html).toContain('Переименовать или удалить')
  })
  it('shows Cabinet tariff terms without Telegram checkout', () => {
    const overview = { ...miniAppDemo, plans: [{ ...miniAppDemo.plans[0]!, isPlanSwitch: true,
      current: false, trafficLimitGb: 100 }] }
    const html = buildRichScreen({ screen: 'plans', overview, appUrl: 'https://cabinet.example.test/miniapp' })
    expect(html).toContain('100 ГБ')
    expect(html).toContain('Тарифы показаны для ознакомления')
    expect(html).not.toContain('avp:buy:')
    expect(html).not.toContain('Stars')
    expect(html).toContain('остаток прежнего не переносится')
  })
})

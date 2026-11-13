import { describe, expect, it, vi } from 'vitest'
import { buildRichScreen } from './rich-screens'
import { channelCampaign, isChannelMember, isChannelReference } from './channel-referrals'
import { miniAppDemo } from './model'
import { isPaymentUpdate, isUnsupportedCallback, telegramUpdateSchema, validWebhookSecret } from './bot'
import { miniAppDestination } from './destination'

describe('Telegram Mini App boundaries', () => {
  it('requires the webhook secret and never acknowledges legacy payments', () => {
    const secret = 'a'.repeat(48)
    expect(validWebhookSecret(secret, secret)).toBe(true)
    expect(validWebhookSecret('b'.repeat(48), secret)).toBe(false)
    expect(isPaymentUpdate({ pre_checkout_query: { id: 'q' } })).toBe(true)
    expect(isPaymentUpdate({ message: { successful_payment: { invoice_payload: 'legacy' } } })).toBe(true)
    expect(isPaymentUpdate({ message: { text: '/start' } })).toBe(false)
    expect(isUnsupportedCallback({ callback_query: { data: 'buy_subscription' } })).toBe(true)
    expect(isUnsupportedCallback({ callback_query: { data: 'avp:devices' } })).toBe(false)
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
  it('shows Cabinet tariff terms without external payment in Telegram', () => {
    const overview = { ...miniAppDemo, plans: [{ ...miniAppDemo.plans[0]!, isPlanSwitch: true,
      current: false, trafficLimitGb: 100 }] }
    const html = buildRichScreen({ screen: 'plans', overview, appUrl: 'https://cabinet.example.test/miniapp' })
    expect(html).toContain('100 ГБ')
    expect(html).toContain('Платная покупка внутри Telegram станет доступна после подключения Stars')
    expect(html).not.toContain('avp:buy:')
    expect(html).not.toContain('ЮKassa')
    expect(html).toContain('остаток прежнего не переносится')
  })
  it('opens the matching Cabinet page for every Mini App section', () => {
    expect(miniAppDestination('plans')).toBe('/dashboard/plans')
    expect(miniAppDestination('billing')).toBe('/dashboard/billing')
    expect(miniAppDestination('devices')).toBe('/dashboard/devices')
    expect(miniAppDestination('bonus')).toBe('/dashboard/bonus-box')
    expect(miniAppDestination('unknown')).toBe('/dashboard')
    const html = buildRichScreen({ screen: 'billing', overview: miniAppDemo, appUrl: 'https://cabinet.example.test/miniapp' })
    expect(html).toContain('tab=billing')
  })
  it('renders billing history with statuses and the auto-renewal state', () => {
    const html = buildRichScreen({ screen: 'billing', overview: miniAppDemo, appUrl: 'https://cabinet.example.test/miniapp',
      autoRenewal: 'включено · MIR **1234',
      payments: [{ title: 'AlekseevVP', amount: '290 ₽', status: '✅ Оплачен', date: '01.11.2026' }, { title: 'AlekseevVP', amount: '290 ₽', status: '⏳ Ожидает оплаты', date: '01.10.2026' }] })
    expect(html).toContain('Автопродление: включено · MIR **1234')
    expect(html).toContain('290 ₽')
    expect(html).toContain('✅ Оплачен')
    expect(html).toContain('⏳ Ожидает оплаты')
  })
  it('summarises notifications, settings and bonus attempts', () => {
    const inbox = buildRichScreen({ screen: 'notifications', overview: miniAppDemo, appUrl: 'https://cabinet.example.test/miniapp',
      inbox: { unread: 2, items: [{ title: 'Подписка продлена', date: '01.11.2026', fresh: true }] } })
    expect(inbox).toContain('Непрочитанных: 2')
    expect(inbox).toContain('🔵 Подписка продлена')
    const prefs = buildRichScreen({ screen: 'settings', overview: miniAppDemo, appUrl: 'https://cabinet.example.test/miniapp',
      prefs: { telegram: true, email: false, broadcasts: true } })
    expect(prefs).toContain('✅ Вкл')
    expect(prefs).toContain('⛔️ Выкл')
    const bonus = buildRichScreen({ screen: 'bonus', overview: miniAppDemo, appUrl: 'https://cabinet.example.test/miniapp',
      bonus: { enabled: true, attempts: 3 } })
    expect(bonus).toContain('3 попытки')
    const disabled = buildRichScreen({ screen: 'bonus', overview: miniAppDemo, appUrl: 'https://cabinet.example.test/miniapp',
      bonus: { enabled: false, attempts: 0 } })
    expect(disabled).toContain('сейчас отключена')
  })
  it('shows service stats only on the admin screen', () => {
    const html = buildRichScreen({ screen: 'admin', overview: miniAppDemo, appUrl: 'https://cabinet.example.test/miniapp',
      admin: true, adminStats: { users: 120, activeSubscriptions: 87, paymentsToday: 5, openTickets: 2 } })
    expect(html).toContain('Пользователи')
    expect(html).toContain('87')
    expect(html).toContain('tab=admin')
    const userHome = buildRichScreen({ screen: 'home', overview: miniAppDemo, appUrl: 'https://cabinet.example.test/miniapp' })
    expect(userHome).not.toContain('Админка')
  })
  it('does not render an empty rich button row when optional features are off', () => {
    const overview = { ...miniAppDemo, support: false, referrals: false }
    const html = buildRichScreen({ screen: 'home', overview, appUrl: 'https://cabinet.example.test/miniapp' })
    expect(html).not.toContain('<tg-button-row></tg-button-row>')
  })
})

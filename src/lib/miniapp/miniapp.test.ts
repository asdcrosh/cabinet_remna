import { describe, expect, it, vi } from 'vitest'
import { buildDeviceDeleteConfirm, buildRichPaymentScreen, buildRichScreen, buildSpinResultScreen } from './rich-screens'
import { channelCampaign, isChannelMember, isChannelReference } from './channel-referrals'
import { miniAppDemo } from './model'
import { isMiniAppOwnedUpdate, isPaymentUpdate, isUnsupportedPaymentUpdate, isUnsupportedCallback, telegramUpdateSchema, validWebhookSecret } from './bot'
import { starsForKopecks } from './stars'

describe('Telegram Mini App boundaries', () => {
  it('requires the webhook secret and never acknowledges legacy payments', () => {
    const secret = 'a'.repeat(48)
    expect(validWebhookSecret(secret, secret)).toBe(true)
    expect(validWebhookSecret('b'.repeat(48), secret)).toBe(false)
    expect(isPaymentUpdate({ pre_checkout_query: { id: 'q' } })).toBe(true)
    expect(isPaymentUpdate({ message: { successful_payment: { invoice_payload: 'legacy' } } })).toBe(true)
    expect(isUnsupportedPaymentUpdate({ message: { successful_payment: { invoice_payload: 'legacy' } } })).toBe(true)
    expect(isUnsupportedPaymentUpdate({ message: { successful_payment: { invoice_payload: 'avp:ck12345678901234567890' } } })).toBe(false)
    expect(isPaymentUpdate({ message: { text: '/start' } })).toBe(false)
    expect(isUnsupportedCallback({ callback_query: { data: 'buy_subscription' } })).toBe(true)
    expect(isUnsupportedCallback({ callback_query: { data: 'avp:devices' } })).toBe(false)
    expect(isMiniAppOwnedUpdate({ callback_query: { data: 'buy_subscription' } })).toBe(false)
    expect(isMiniAppOwnedUpdate({ callback_query: { data: 'avp:devices' } })).toBe(true)
    expect(isMiniAppOwnedUpdate({ message: { text: '/start legacy_campaign' } })).toBe(false)
    expect(isMiniAppOwnedUpdate({ message: { text: '/start ref_ABC123' } })).toBe(true)
    expect(isMiniAppOwnedUpdate({ message: { text: '/support' } })).toBe(true)
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
    const html = buildRichScreen({ screen: 'devices', overview: miniAppDemo, appUrl: 'https://cabinet.example.test/miniapp', devices: [{ id: 'dev-1', title: '<script>alert(1)</script>', platform: 'iOS' }] })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('subscriptionUrl')
    expect(html).toContain('avp:devdel:dev-1')
  })
  it('shows Cabinet tariff terms with Stars checkout when enabled', () => {
    const overview = { ...miniAppDemo, plans: [{ ...miniAppDemo.plans[0]!, isPlanSwitch: true,
      current: false, trafficLimitGb: 100 }] }
    const html = buildRichScreen({ screen: 'plans', overview, appUrl: 'https://cabinet.example.test/miniapp' })
    expect(html).toContain('100 ГБ')
    expect(html).toContain('Базовая цена 299 ₽')
    expect(html).toContain('avp:pay:demo')
    expect(html).toContain('остаток прежнего не переносится')
  })
  it('links only an available plan to the external Cabinet checkout and keeps Stars in the bot', () => {
    const input = { screen: 'plans' as const, overview: miniAppDemo, appUrl: 'https://cabinet.example.test/miniapp' }
    const html = buildRichPaymentScreen(input, 'demo', true)
    expect(html).toContain('type="url"')
    expect(html).toContain('https://cabinet.example.test/pay?plan=demo')
    expect(html).toContain('avp:buy:demo')
    expect(buildRichPaymentScreen(input, 'demo', false)).not.toContain('/pay?plan=')
    expect(buildRichPaymentScreen(input, 'unknown', true)).not.toContain('/pay?plan=')
  })
  it('uses one safe brand banner on bot and payment screens', () => {
    const input = { screen: 'home' as const, overview: miniAppDemo,
      appUrl: 'https://cabinet.example.test/miniapp', bannerUrl: 'https://cabinet.example.test/miniapp/banner.png' }
    expect(buildRichScreen(input)).toContain('<img src="https://cabinet.example.test/miniapp/banner.png">')
    expect(buildRichPaymentScreen(input, 'demo', true)).toContain('<img src="https://cabinet.example.test/miniapp/banner.png">')
    expect(buildRichScreen({ ...input, bannerUrl: 'http://insecure.example/banner.png' })).not.toContain('<img')
  })
  it('rounds the configured ruble price up to whole Stars', () => {
    expect(starsForKopecks(30_000, 300)).toBe(100)
    expect(starsForKopecks(30_001, 300)).toBe(101)
    expect(() => starsForKopecks(0, 300)).toThrow()
  })
  it('owns the section slash commands and renders their screens', () => {
    for (const command of ['/billing', '/bonus', '/notifications', '/settings', '/admin']) {
      expect(isMiniAppOwnedUpdate({ message: { text: command } })).toBe(true)
    }
    const billing = buildRichScreen({ screen: 'billing', overview: miniAppDemo, appUrl: 'https://cabinet.example.test/miniapp',
      autoRenewal: 'включено · MIR **1234',
      payments: [{ title: 'AlekseevVP', amount: '299 ₽', status: 'Оплачен', date: '01.11.2026' }] })
    expect(billing).toContain('Автопродление: включено · MIR **1234')
    expect(billing).toContain('299 ₽ · Оплачен')
    expect(billing).toContain('tab=billing')
    const bonus = buildRichScreen({ screen: 'bonus', overview: miniAppDemo, appUrl: 'https://cabinet.example.test/miniapp',
      bonus: { enabled: true, attempts: 2 } })
    expect(bonus).toContain('Доступно попыток: 2')
    expect(buildRichScreen({ screen: 'bonus', overview: miniAppDemo, appUrl: 'https://cabinet.example.test/miniapp',
      bonus: { enabled: false, attempts: 0 } })).toContain('сейчас отключена')
    const inbox = buildRichScreen({ screen: 'notifications', overview: miniAppDemo, appUrl: 'https://cabinet.example.test/miniapp',
      inbox: { unread: 1, items: [{ title: 'Подписка продлена', date: '01.11.2026', fresh: true }] } })
    expect(inbox).toContain('Непрочитанных: 1')
    expect(inbox).toContain('Подписка продлена · новое')
    const prefs = buildRichScreen({ screen: 'settings', overview: miniAppDemo, appUrl: 'https://cabinet.example.test/miniapp',
      prefs: { telegram: true, email: false, broadcasts: true } })
    expect(prefs).toContain('Включены')
    expect(prefs).toContain('Выключены')
  })
  it('shows service stats only to admins', () => {
    const html = buildRichScreen({ screen: 'admin', overview: miniAppDemo, appUrl: 'https://cabinet.example.test/miniapp',
      admin: true, adminStats: { users: 120, activeSubscriptions: 87, paymentsToday: 5, openTickets: 2 } })
    expect(html).toContain('Активные подписки')
    expect(html).toContain('tab=admin')
    expect(buildRichScreen({ screen: 'admin', overview: miniAppDemo, appUrl: 'https://cabinet.example.test/miniapp' })).not.toContain('Пользователи')
    expect(buildRichScreen({ screen: 'home', overview: miniAppDemo, appUrl: 'https://cabinet.example.test/miniapp' })).not.toContain('Админка')
  })
  it('runs in-chat actions: device removal, wheel spin and mark-all-read', () => {
    const input = { screen: 'devices' as const, overview: miniAppDemo, appUrl: 'https://cabinet.example.test/miniapp' }
    const devices = buildRichScreen({ ...input, devices: [{ id: 'dev-1', title: 'iPhone', platform: 'iOS' }, { id: 'dev-2', title: 'MacBook', platform: 'macOS' }] })
    expect(devices).toContain('avp:devdel:dev-1')
    expect(devices).toContain('avp:devdel:dev-2')
    const confirm = buildDeviceDeleteConfirm(input, { id: 'dev-1', title: 'iPhone', platform: 'iOS' })
    expect(confirm).toContain('Удалить устройство?')
    expect(confirm).toContain('avp:devyes:dev-1')
    expect(confirm).toContain('avp:devices')
    const spin = buildSpinResultScreen({ ...input, screen: 'bonus' }, { prizeTitle: '7 дней подписки', prizeDescription: null,
      promoCode: 'BONUS-7', promoCodeExpiresAt: '2026-12-01T00:00:00Z', remainingAttempts: 1 })
    expect(spin).toContain('🎉 7 дней подписки')
    expect(spin).toContain('BONUS-7')
    expect(spin).toContain('type="copy_text"')
    expect(spin).toContain('avp:spin')
    const bonus = buildRichScreen({ ...input, screen: 'bonus', bonus: { enabled: true, attempts: 2 } })
    expect(bonus).toContain('Крутить колесо · 2')
    const inbox = buildRichScreen({ ...input, screen: 'notifications', inbox: { unread: 3, items: [{ title: 'Подписка продлена', date: '01.11.2026', fresh: true }] } })
    expect(inbox).toContain('avp:readall')
    expect(inbox).toContain('Прочитать все')
    const billing = buildRichScreen({ ...input, screen: 'billing' })
    expect(billing).toContain('avp:pay:demo')
    expect(billing).toContain('Продлить')
  })
  it('does not render an empty rich button row when optional features are off', () => {
    const overview = { ...miniAppDemo, support: false, referrals: false }
    const html = buildRichScreen({ screen: 'home', overview, appUrl: 'https://cabinet.example.test/miniapp' })
    expect(html).not.toContain('<tg-button-row></tg-button-row>')
  })
})

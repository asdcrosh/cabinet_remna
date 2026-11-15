import { describe, expect, it, vi } from 'vitest'
import { buildAdminTicketsScreen, buildAutoRenewalOffConfirm, buildDeviceDeleteConfirm, buildDeviceScreen, buildRichPaymentScreen, buildRichScreen, buildSpinResultScreen, buildSupportCategoryScreen, buildSupportPromptScreen, buildSupportThreadScreen } from './rich-screens'
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
    expect(isMiniAppOwnedUpdate({ message: { text: '/start update' } })).toBe(true)
    expect(isMiniAppOwnedUpdate({ message: { text: '/support' } })).toBe(true)
    expect(telegramUpdateSchema.safeParse({ update_id: 1, message: { chat: { id: 123, type: 'private' }, from: { id: 123 }, text: '/start' } }).success).toBe(true)
    expect(telegramUpdateSchema.safeParse({ update_id: 2, message: { chat: { id: 123, type: 'private' }, from: { id: 123 },
      caption: 'Текст рассылки', photo: [{ file_id: 'file-1', width: 90, height: 90 }, { file_id: 'file-2', width: 800, height: 800 }] } }).success).toBe(true)
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
    expect(html).toContain('avp:dev:dev-1')
  })
  it('shows Cabinet tariff terms with Stars checkout when enabled', () => {
    const overview = { ...miniAppDemo, plans: [{ ...miniAppDemo.plans[0]!, isPlanSwitch: true,
      current: false, trafficLimitGb: 100 }] }
    const html = buildRichScreen({ screen: 'plans', overview, appUrl: 'https://cabinet.example.test/miniapp' })
    expect(html).toContain('100 ГБ')
    expect(html).toContain('💰 299 ₽')
    expect(html).toContain('avp:pay:demo')
    expect(html).toContain('остаток прежнего не переносится')
  })
  it('opens card checkout inside Telegram and keeps Stars in the bot', () => {
    const input = { screen: 'plans' as const, overview: miniAppDemo, appUrl: 'https://cabinet.example.test/miniapp' }
    const html = buildRichPaymentScreen(input, 'demo', true)
    expect(html).toContain('type="web_app"')
    expect(html).toContain('https://cabinet.example.test/miniapp?tab=plans&amp;plan=demo')
    expect(html).toContain('avp:buy:demo')
    expect(buildRichPaymentScreen(input, 'demo', false)).not.toContain('plan=demo')
    expect(buildRichPaymentScreen(input, 'unknown', true)).not.toContain('plan=demo')
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
      autoRenewal: 'включено · MIR **1234', autoRenewalActive: true,
      payments: [{ title: 'AlekseevVP', amount: '299 ₽', status: 'Оплачен', date: '01.11.2026' }] })
    expect(billing).toContain('Автопродление: включено · MIR **1234')
    expect(billing).toContain('299 ₽ · Оплачен')
    expect(billing).toContain('avp:renew:off')
    expect(billing).not.toContain('type="web_app"')
    const bonus = buildRichScreen({ screen: 'bonus', overview: miniAppDemo, appUrl: 'https://cabinet.example.test/miniapp',
      bonus: { enabled: true, attempts: 2 } })
    expect(bonus).toContain('Доступно попыток: <b>2</b>')
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
    expect(prefs).toContain('avp:set:telegram')
    expect(prefs).toContain('avp:set:email')
    expect(prefs).toContain('avp:set:broadcasts')
    expect(prefs).not.toContain('type="web_app"')
  })
  it('runs support, settings and connection flows without leaving the chat', () => {
    const appUrl = 'https://cabinet.example.test/miniapp'
    const support = buildRichScreen({ screen: 'support', overview: miniAppDemo, appUrl,
      tickets: [{ id: 'ticket-1', subject: 'Проблема с подключением', status: 'Есть ответ' }] })
    expect(support).toContain('avp:sup:new')
    expect(support).toContain('avp:supt:ticket-1')
    expect(support).not.toContain('type="web_app"')
    const categories = buildSupportCategoryScreen({ screen: 'support', overview: miniAppDemo, appUrl },
      [{ value: 'payment', label: 'Оплата', description: 'Платёж' }])
    expect(categories).toContain('avp:supcat:payment')
    const prompt = buildSupportPromptScreen({ screen: 'support', overview: miniAppDemo, appUrl },
      { title: 'Оплата', hint: 'Опишите вопрос' })
    expect(prompt).toContain('следующее сообщение')
    expect(prompt).toContain('avp:sup:cancel')
    const thread = buildSupportThreadScreen({ screen: 'support', overview: miniAppDemo, appUrl },
      { id: 'ticket-1', subject: 'Проблема с подключением', status: 'Есть ответ',
        messages: [{ from: 'admin', body: 'Попробуйте переподключиться', date: '01.11.2026' }] })
    expect(thread).toContain('🛟 Поддержка')
    expect(thread).toContain('avp:supr:ticket-1')
    expect(thread).toContain('avp:supc:ticket-1')
    const connect = buildRichScreen({ screen: 'connect', overview: miniAppDemo, appUrl,
      connectUrl: 'https://panel.example.test/sub/abc123' })
    expect(connect).toContain('type="copy_text"')
    expect(connect).toContain('https://panel.example.test/sub/abc123')
    expect(connect).not.toContain('type="web_app"')
    const connectNoKey = buildRichScreen({ screen: 'connect', overview: { ...miniAppDemo, subscription: null }, appUrl })
    expect(connectNoKey).toContain('avp:plans')
    const confirm = buildAutoRenewalOffConfirm({ screen: 'billing', overview: miniAppDemo, appUrl })
    expect(confirm).toContain('avp:renew:offyes')
    const promo = buildRichScreen({ screen: 'bonus', overview: miniAppDemo, appUrl,
      bonus: { enabled: true, attempts: 0 }, promoCodes: [{ code: 'SALE10', discountPercent: 10, expiresAt: null }] })
    expect(promo).toContain('SALE10')
    expect(promo).toContain('type="copy_text"')
    const plans = buildRichScreen({ screen: 'plans', overview: miniAppDemo, appUrl })
    expect(plans).not.toContain('type="web_app"')
  })
  it('gives admins a native ticket queue in the bot', () => {
    const appUrl = 'https://cabinet.example.test/miniapp'
    const admin = buildRichScreen({ screen: 'admin', overview: miniAppDemo, appUrl, admin: true,
      adminStats: { users: 10, activeSubscriptions: 5, paymentsToday: 1, openTickets: 2 } })
    expect(admin).toContain('avp:admt')
    const list = buildAdminTicketsScreen({ screen: 'admin', overview: miniAppDemo, appUrl },
      [{ id: 'ticket-1', subject: 'Проблема с подключением', status: 'Ждёт ответа', userLabel: '@ivan', date: '01.11.2026', fresh: true }])
    expect(list).toContain('avp:admt:ticket-1')
    expect(list).toContain('@ivan')
    expect(list).toContain('🔴')
    const thread = buildSupportThreadScreen({ screen: 'admin', overview: miniAppDemo, appUrl },
      { id: 'ticket-1', subject: 'Проблема с подключением', status: 'Ждёт ответа', userLabel: '@ivan',
        messages: [{ from: 'user', body: 'Не подключается', date: '01.11.2026' }] }, { viewer: 'admin' })
    expect(thread).toContain('👤 Пользователь')
    expect(thread).toContain('@ivan')
    expect(thread).toContain('avp:admr:ticket-1')
    expect(thread).toContain('avp:admc:ticket-1')
    expect(buildAdminTicketsScreen({ screen: 'admin', overview: miniAppDemo, appUrl }, [])).toContain('Открытых обращений нет')
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
    expect(devices).toContain('avp:dev:dev-1')
    expect(devices).toContain('avp:dev:dev-2')
    expect(devices).not.toContain('avp:devdel:dev-1')
    const card = buildDeviceScreen(input, { id: 'dev-1', title: 'iPhone', platform: 'iOS' })
    expect(card).toContain('📱 iPhone')
    expect(card).toContain('avp:devdel:dev-1')
    expect(card).toContain('avp:devices')
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

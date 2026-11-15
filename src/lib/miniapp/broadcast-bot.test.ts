import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
  botCall: vi.fn(async (_method: string, _payload?: Record<string, unknown>) => ({ message_id: 1 })),
  isFeatureEnabled: vi.fn(async () => true),
  rateLimitKey: vi.fn(async () => ({ ok: true, retryAfter: 0 })),
  createAdminNotification: vi.fn(async () => {}),
  writeAuditLog: vi.fn(async () => {}),
  createBroadcastCampaign: vi.fn(async () => ({ campaignId: 'camp-1', batchKey: 'batch-1', recipients: 42, limited: false })),
}))

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/feature-flags', () => ({ isFeatureEnabled: mocks.isFeatureEnabled }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitKey: mocks.rateLimitKey }))
vi.mock('@/lib/admin-notifications', () => ({ createAdminNotification: mocks.createAdminNotification }))
vi.mock('@/lib/audit-log', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/lib/broadcast-campaign', () => ({ createBroadcastCampaign: mocks.createBroadcastCampaign }))
vi.mock('./bot-api', () => ({ miniAppBotCall: mocks.botCall }))
vi.mock('./channel-referrals', () => ({
  isChannelReference: (value: string) => /^-100\d+$/.test(value) || /^@[A-Za-z0-9_]{5,32}$/.test(value),
}))

import { broadcastThemes, broadcastThemeView, createBotBroadcast, extractBroadcastButton, findBroadcastTheme, parseBroadcastDraft, serializeBroadcastDraft, validateBroadcastText, BROADCAST_TEXT_MAX } from './broadcast-bot'
import { botScreens, buildBroadcastPreviewScreen, buildBroadcastPromptScreen, buildBroadcastSentScreen, buildBroadcastThemesScreen } from './rich-screens'

describe('broadcast themes', () => {
  it('has unique keys and buttons that lead to real bot screens', () => {
    const keys = broadcastThemes.map(theme => theme.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const theme of broadcastThemes) {
      expect(theme.label.length).toBeGreaterThan(3)
      expect(theme.title.length).toBeGreaterThanOrEqual(3)
      if (theme.button) {
        expect(botScreens).toContain(theme.button.screen)
        expect(`avp:${theme.button.screen}`.length).toBeLessThanOrEqual(64)
        expect(theme.button.label.length).toBeLessThanOrEqual(32)
      }
    }
  })

  it('finds themes by key and rejects unknown ones', () => {
    expect(findBroadcastTheme('promo')?.button?.screen).toBe('plans')
    expect(findBroadcastTheme('winback')?.segment).toBe('EXPIRED')
    expect(findBroadcastTheme('news')?.button).toBeNull()
    expect(findBroadcastTheme('nope')).toBeNull()
  })

  it('validates broadcast text length', () => {
    expect(validateBroadcastText('  коротко ').ok).toBe(true)
    expect(validateBroadcastText('абв').ok).toBe(false)
    expect(validateBroadcastText('x'.repeat(BROADCAST_TEXT_MAX + 1)).ok).toBe(false)
    expect(validateBroadcastText('  привет  ')).toEqual({ ok: true, body: 'привет' })
  })

  it('serializes and parses drafts with an optional photo', () => {
    const payload = serializeBroadcastDraft({ text: 'Текст рассылки', image: 'file-id-1' })
    expect(parseBroadcastDraft(payload)).toEqual({ text: 'Текст рассылки', image: 'file-id-1', button: null })
    expect(parseBroadcastDraft(serializeBroadcastDraft({ text: 'Без фото', image: null }))).toEqual({ text: 'Без фото', image: null, button: null })
    // Ранние черновики хранились простым текстом — они тоже читаются.
    expect(parseBroadcastDraft('Старый текстовый черновик')).toEqual({ text: 'Старый текстовый черновик', image: null })
    // Битый JSON читается как текстовый черновик — так хранились ранние версии.
    expect(parseBroadcastDraft('{"broken":')).toEqual({ text: '{"broken":', image: null })
    expect(parseBroadcastDraft(null)).toBeNull()
    expect(parseBroadcastDraft('   ')).toBeNull()
  })

  it('serializes and parses drafts with a custom button', () => {
    const button = { label: 'Читать в канале', url: 'https://t.me/alekseevVP_Official', data: null }
    const payload = serializeBroadcastDraft({ text: 'Новость', image: null, button })
    expect(parseBroadcastDraft(payload)).toEqual({ text: 'Новость', image: null, button })
    // Чужеродные кнопки из БД отбрасываются.
    const tampered = JSON.stringify({ text: 'Новость', image: null, button: { label: 'Вред', data: 'javascript:alert(1)' } })
    expect(parseBroadcastDraft(tampered)).toEqual({ text: 'Новость', image: null, button: null })
  })
})

describe('extractBroadcastButton', () => {
  it('keeps the text untouched without a button line', () => {
    expect(extractBroadcastButton('Просто текст\nв две строки')).toEqual({ body: 'Просто текст\nв две строки', button: null })
  })

  it('parses an https url button', () => {
    expect(extractBroadcastButton('Текст акции\nКнопка: Читать в канале | https://t.me/alekseevVP_Official')).toEqual({
      body: 'Текст акции',
      button: { label: 'Читать в канале', url: 'https://t.me/alekseevVP_Official', data: null },
    })
  })

  it('parses a bot screen button', () => {
    expect(extractBroadcastButton('Текст\nКнопка: Забрать бонус | bonus')).toEqual({
      body: 'Текст', button: { label: 'Забрать бонус', url: null, data: 'avp:bonus' },
    })
  })

  it('parses a promo button and uppercases the code', () => {
    expect(extractBroadcastButton('Текст\nКнопка: Применить скидку | promo:sale30')).toEqual({
      body: 'Текст', button: { label: 'Применить скидку', url: null, data: 'avp:promo:SALE30' },
    })
  })

  it('rejects unknown targets and malformed lines with a helpful error', () => {
    expect(extractBroadcastButton('Текст\nКнопка: Куда-то | telegram')).toHaveProperty('error')
    expect(extractBroadcastButton('Текст\nКнопка: без разделителя')).toHaveProperty('error')
    expect(extractBroadcastButton('Текст\nКнопка: Плохо | http://insecure.example')).toHaveProperty('error')
  })
})

describe('createBotBroadcast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isFeatureEnabled.mockResolvedValue(true)
    mocks.rateLimitKey.mockResolvedValue({ ok: true, retryAfter: 0 })
    mocks.createBroadcastCampaign.mockResolvedValue({ campaignId: 'camp-1', batchKey: 'batch-1', recipients: 42, limited: false })
    mocks.prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'ADMIN' })
  })

  it('rejects non-admin users', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'USER' })
    const result = await createBotBroadcast('user-1', 'promo', 'Текст рассылки')
    expect(result.ok).toBe(false)
    expect(mocks.createBroadcastCampaign).not.toHaveBeenCalled()
  })

  it('queues a campaign with the theme button and segment', async () => {
    const result = await createBotBroadcast('admin-1', 'promo', 'Скидка 20% до конца недели')
    expect(result).toEqual({ ok: true, theme: findBroadcastTheme('promo'), recipients: 42, limited: false, channelPosted: false })
    expect(mocks.createBroadcastCampaign).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Акция',
      body: 'Скидка 20% до конца недели',
      segment: 'ALL',
      channels: ['TELEGRAM'],
      telegramBotButton: { label: '💎 Выбрать тариф', data: 'avp:plans' },
      createdById: 'admin-1',
    }))
    expect(mocks.createAdminNotification).toHaveBeenCalled()
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'ADMIN_BROADCAST_CREATED' }))
  })

  it('queues a buttonless campaign for the news theme', async () => {
    const result = await createBotBroadcast('admin-1', 'news', 'Завтра технические работы с 3 до 5 утра')
    expect(result.ok).toBe(true)
    expect(mocks.createBroadcastCampaign).toHaveBeenCalledWith(expect.objectContaining({ telegramBotButton: null, telegramImageFileId: null }))
  })

  it('attaches a photo file id to the campaign when provided', async () => {
    const result = await createBotBroadcast('admin-1', 'promo', 'Скидка 20% до конца недели', 'photo-file-id-1')
    expect(result.ok).toBe(true)
    expect(mocks.createBroadcastCampaign).toHaveBeenCalledWith(expect.objectContaining({
      telegramImageFileId: 'photo-file-id-1',
      telegramBotButton: { label: '💎 Выбрать тариф', data: 'avp:plans' },
    }))
  })

  it('respects the feature flag and the rate limit', async () => {
    mocks.isFeatureEnabled.mockResolvedValue(false)
    expect((await createBotBroadcast('admin-1', 'promo', 'Текст рассылки')).ok).toBe(false)
    mocks.isFeatureEnabled.mockResolvedValue(true)
    mocks.rateLimitKey.mockResolvedValue({ ok: false, retryAfter: 60 })
    expect((await createBotBroadcast('admin-1', 'promo', 'Текст рассылки')).ok).toBe(false)
    expect(mocks.createBroadcastCampaign).not.toHaveBeenCalled()
  })

  it('custom button replaces the theme button in the campaign', async () => {
    const button = { label: 'Читать в канале', url: 'https://t.me/alekseevVP_Official', data: null }
    const result = await createBotBroadcast('admin-1', 'promo', 'Скидка 20%', null, button)
    expect(result.ok).toBe(true)
    expect(mocks.createBroadcastCampaign).toHaveBeenCalledWith(expect.objectContaining({
      telegramBotButton: { label: 'Читать в канале', url: 'https://t.me/alekseevVP_Official' },
    }))
  })

  it('duplicates the broadcast to the channel with a deeplink button', async () => {
    process.env.TELEGRAM_BROADCAST_CHANNEL_ID = '@alekseevVP_Official'
    process.env.TELEGRAM_MINIAPP_BOT_USERNAME = 'alekseevVP_bot'
    const result = await createBotBroadcast('admin-1', 'promo', 'Скидка 20% до конца недели')
    expect(result.ok && result.channelPosted).toBe(true)
    const post = mocks.botCall.mock.calls.find(([method]) => method === 'sendRichMessage')
    const payload = post?.[1] as { chat_id?: string; rich_message?: { html?: string } } | undefined
    expect(payload?.chat_id).toBe('@alekseevVP_Official')
    expect(payload?.rich_message?.html).toContain('Скидка 20% до конца недели')
    // Кнопка темы в канале — ссылка-диаплинк на раздел бота.
    expect(payload?.rich_message?.html).toContain('https://t.me/alekseevVP_bot?start=plans')
    delete process.env.TELEGRAM_BROADCAST_CHANNEL_ID
    delete process.env.TELEGRAM_MINIAPP_BOT_USERNAME
  })

  it('channel failure does not cancel the user broadcast', async () => {
    process.env.TELEGRAM_BROADCAST_CHANNEL_ID = '@alekseevVP_Official'
    mocks.botCall.mockRejectedValueOnce(new Error('not an admin'))
    const result = await createBotBroadcast('admin-1', 'promo', 'Текст акции')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.channelPosted).toBe(false)
    delete process.env.TELEGRAM_BROADCAST_CHANNEL_ID
  })
})

describe('broadcast bot screens', () => {
  const input = { screen: 'admin' as const, overview: null, appUrl: 'https://cabinet.example.test/miniapp' }
  const themes = broadcastThemes.map(broadcastThemeView)

  it('lists themes with automatic button hints', () => {
    const html = buildBroadcastThemesScreen(input, themes)
    expect(html).toContain('Новая рассылка')
    expect(html).toContain('avp:bct:promo')
    expect(html).toContain('avp:bct:news')
    expect(html).toContain('кнопка «💎 Выбрать тариф»')
    expect(html).toContain('avp:admin')
  })

  it('escapes the draft text in the preview and keeps send/cancel actions', () => {
    const html = buildBroadcastPreviewScreen(input, {
      themeLabel: '🎉 Акция и скидки',
      segmentLabel: 'Все пользователи',
      buttonLabel: '💎 Выбрать тариф',
      text: 'Скидка <b>20%</b>\nТолько до пятницы',
    })
    expect(html).not.toContain('<b>20%</b>')
    expect(html).toContain('&lt;b&gt;20%&lt;/b&gt;')
    expect(html).toContain('<br>')
    expect(html).toContain('avp:bc:send')
    expect(html).toContain('avp:bc:edit')
    expect(html).toContain('avp:bc:cancel')
  })

  it('prompts for the text with theme audience and renders the queued result', () => {
    const prompt = buildBroadcastPromptScreen(input, broadcastThemeView(findBroadcastTheme('winback')!))
    expect(prompt).toContain('С истекшей подпиской')
    expect(prompt).toContain('avp:bc:cancel')
    const sent = buildBroadcastSentScreen(input, { themeLabel: '🎉 Акция и скидки', recipients: 128, limited: false })
    expect(sent).toContain('128')
    expect(sent).toContain('avp:bc:new')
  })
})

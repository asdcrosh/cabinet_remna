import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
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

import { broadcastThemes, broadcastThemeView, createBotBroadcast, findBroadcastTheme, validateBroadcastText, BROADCAST_TEXT_MAX } from './broadcast-bot'
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
    expect(result).toEqual({ ok: true, theme: findBroadcastTheme('promo'), recipients: 42, limited: false })
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
    expect(mocks.createBroadcastCampaign).toHaveBeenCalledWith(expect.objectContaining({ telegramBotButton: null }))
  })

  it('respects the feature flag and the rate limit', async () => {
    mocks.isFeatureEnabled.mockResolvedValue(false)
    expect((await createBotBroadcast('admin-1', 'promo', 'Текст рассылки')).ok).toBe(false)
    mocks.isFeatureEnabled.mockResolvedValue(true)
    mocks.rateLimitKey.mockResolvedValue({ ok: false, retryAfter: 60 })
    expect((await createBotBroadcast('admin-1', 'promo', 'Текст рассылки')).ok).toBe(false)
    expect(mocks.createBroadcastCampaign).not.toHaveBeenCalled()
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

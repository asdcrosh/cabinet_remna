import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  logError: vi.fn(),
  logInfo: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    adminTelegramDelivery: {
      findMany: mocks.findMany,
      updateMany: mocks.updateMany,
      update: mocks.update,
    },
  },
}))
vi.mock('./app-url', () => ({ getAppUrl: () => 'https://cabinet.example.test' }))
vi.mock('./logger', () => ({ logError: mocks.logError, logInfo: mocks.logInfo }))

import {
  buildAdminPaymentTelegramText,
  buildAdminSupportTelegramText,
  buildAdminWhitelistAddonTelegramText,
  processAdminTelegramDeliveries,
} from './admin-telegram-notifications'

const originalEnv = {
  token: process.env.TELEGRAM_BOT_TOKEN,
  ownerChat: process.env.ADMIN_TELEGRAM_CHAT_ID,
  fallbackChat: process.env.TELEGRAM_NOTIFY_CHAT_ID,
  enabled: process.env.ADMIN_TELEGRAM_NOTIFICATIONS_ENABLED,
}

describe('admin Telegram notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TELEGRAM_BOT_TOKEN = '123456:telegram-token'
    process.env.ADMIN_TELEGRAM_CHAT_ID = '777001'
    delete process.env.TELEGRAM_NOTIFY_CHAT_ID
    process.env.ADMIN_TELEGRAM_NOTIFICATIONS_ENABLED = 'true'
    mocks.findMany.mockResolvedValue([])
    mocks.updateMany.mockResolvedValue({ count: 1 })
    mocks.update.mockResolvedValue({})
    global.fetch = vi.fn(async () => Response.json({ ok: true, result: { message_id: 42 } })) as typeof fetch
  })

  afterEach(() => {
    restoreEnv('TELEGRAM_BOT_TOKEN', originalEnv.token)
    restoreEnv('ADMIN_TELEGRAM_CHAT_ID', originalEnv.ownerChat)
    restoreEnv('TELEGRAM_NOTIFY_CHAT_ID', originalEnv.fallbackChat)
    restoreEnv('ADMIN_TELEGRAM_NOTIFICATIONS_ENABLED', originalEnv.enabled)
  })

  it('formats a concise escaped successful payment for the owner', () => {
    const text = buildAdminPaymentTelegramText({
      amount: '900 ₽',
      planName: 'Premium <90>',
      durationDays: 90,
      customerName: 'Иван & Ко',
      customerEmail: 'ivan@example.test',
      telegramUsername: '@ivan',
      provider: 'ЮKassa',
      expireAt: new Date('2026-11-17T11:54:07.980Z'),
      isPaid: true,
      isRenewal: false,
    })

    expect(text).toContain('<b>✅ Новая оплата</b>')
    expect(text).toContain('900 ₽')
    expect(text).toContain('Premium &lt;90&gt; · 90 дней')
    expect(text).toContain('Иван &amp; Ко · @ivan · ivan@example.test')
    expect(text).toContain('17.11.2026')
  })

  it('formats a whitelist add-on purchase for the owner', () => {
    const text = buildAdminWhitelistAddonTelegramText({
      amount: '200 ₽',
      expireAt: new Date('2026-09-22T12:00:00.000Z'),
    })

    expect(text).toContain('<b>✅ Куплены БС</b>')
    expect(text).toContain('<b>200 ₽</b> · расширенный доступ')
    expect(text).not.toContain('ivan@example.test')
    expect(text).toContain('22.09.2026')
  })

  it('formats support previews without leaking a technical pending email', () => {
    const text = buildAdminSupportTelegramText({
      kind: 'ticket',
      subject: 'Оплата <ошибка>',
      message: '  Деньги списались & подписка не появилась  ',
      customerName: 'Клиент',
      customerEmail: 'telegram-123@pending.invalid',
      telegramUsername: 'client',
    })

    expect(text).toContain('<b>🆘 Новое обращение в поддержку</b>')
    expect(text).toContain('Клиент · @client')
    expect(text).not.toContain('pending.invalid')
    expect(text).toContain('Оплата &lt;ошибка&gt;')
    expect(text).toContain('Деньги списались &amp; подписка не появилась')
  })

  it('sends a claimed delivery only to the configured owner chat', async () => {
    mocks.findMany.mockResolvedValue([{
      id: 'delivery-1',
      text: '<b>✅ Новая оплата</b>',
      actionHref: '/dashboard/admin/payments?q=payment-1',
      actionLabel: 'Открыть платёж',
      attempts: 0,
    }])

    const result = await processAdminTelegramDeliveries()

    expect(result).toEqual({ configured: true, attempted: 1, sent: 1, retried: 0, failed: 0 })
    expect(fetch).toHaveBeenCalledOnce()
    const request = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as RequestInit
    const payload = JSON.parse(String(request.body))
    expect(payload.chat_id).toBe('777001')
    expect(payload.reply_markup.inline_keyboard[0][0]).toEqual({
      text: 'Открыть платёж',
      web_app: { url: 'https://cabinet.example.test/dashboard/admin/payments?q=payment-1' },
    })
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'delivery-1' },
      data: expect.objectContaining({
        status: 'SENT',
        telegramMessageId: '42',
        lastError: null,
      }),
    }))
  })

  it('keeps a failed delivery retryable without throwing into the payment flow', async () => {
    mocks.findMany.mockResolvedValue([{
      id: 'delivery-1',
      text: 'Оплата',
      actionHref: null,
      actionLabel: null,
      attempts: 0,
    }])
    global.fetch = vi.fn(async () => Response.json(
      { ok: false, description: 'temporary failure' },
      { status: 502 }
    )) as typeof fetch

    const result = await processAdminTelegramDeliveries()

    expect(result).toEqual({ configured: true, attempted: 1, sent: 0, retried: 1, failed: 0 })
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'RETRYING',
        lockedAt: null,
        lastError: expect.stringContaining('temporary failure'),
      }),
    }))
  })

  it('stays idle when owner delivery is disabled', async () => {
    process.env.ADMIN_TELEGRAM_NOTIFICATIONS_ENABLED = 'false'

    await expect(processAdminTelegramDeliveries()).resolves.toEqual({
      configured: false,
      attempted: 0,
      sent: 0,
      retried: 0,
      failed: 0,
    })
    expect(mocks.findMany).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
})

function restoreEnv(name: string, value: string | undefined) {
  if (value == null) delete process.env[name]
  else process.env[name] = value
}

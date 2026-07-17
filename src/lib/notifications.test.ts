import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
    },
    notificationLog: {
      createMany: vi.fn(),
      updateMany: vi.fn(),
    },
    userNotification: {
      createMany: vi.fn(),
    },
  }

  return { prisma }
})

vi.mock('./prisma', () => ({ prisma: mocks.prisma }))
vi.mock('./app-url', () => ({ getAppUrl: () => 'https://cabinet.example.test' }))
vi.mock('./branding', () => ({ getBrandName: () => 'Cabinet' }))
vi.mock('./email-template', () => ({ renderActionEmail: () => '<p>Email</p>' }))

import { notifySubscriptionExpiring, notifyUser } from './notifications'

describe('notifyUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TELEGRAM_BOT_TOKEN = 'telegram-token'
    process.env.EMAIL_VERIFICATION_WEBHOOK_URL = 'https://mail.example.test/send'
    process.env.EMAIL_VERIFICATION_WEBHOOK_SECRET = 'mail-secret'
    global.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch
  })

  it('sends verified users Telegram and email notifications once per channel', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.test',
      emailVerifiedAt: new Date(),
      name: 'User',
      telegramId: 123n,
    })
    mocks.prisma.notificationLog.createMany.mockResolvedValue({ count: 1 })
    mocks.prisma.userNotification.createMany.mockResolvedValue({ count: 1 })

    const result = await notifyUser({
      userId: 'user-1',
      type: 'PAYMENT_SUCCESS',
      dedupeKey: 'payment-1',
      title: 'Оплата прошла',
      body: 'Оплата прошла',
      telegramText: '<b>Оплата прошла</b>',
      emailSubject: 'Оплата прошла',
      emailText: 'Оплата прошла',
      emailHtml: '<p>Оплата прошла</p>',
    })

    expect(result).toEqual({ telegram: 'sent', email: 'sent' })
    expect(mocks.prisma.userNotification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          type: 'PAYMENT_SUCCESS',
          title: 'Оплата прошла',
        }),
      })
    )
    expect(mocks.prisma.notificationLog.createMany).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenCalledWith(
      'https://api.telegram.org/bottelegram-token/sendMessage',
      expect.objectContaining({ method: 'POST' })
    )
    expect(fetch).toHaveBeenCalledWith(
      'https://mail.example.test/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer mail-secret' }),
      })
    )
  })

  it('skips email for users without verified email', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.test',
      emailVerifiedAt: null,
      name: 'User',
      telegramId: 123n,
    })
    mocks.prisma.notificationLog.createMany.mockResolvedValue({ count: 1 })
    mocks.prisma.userNotification.createMany.mockResolvedValue({ count: 1 })

    const result = await notifyUser({
      userId: 'user-1',
      type: 'SUPPORT_REPLY',
      dedupeKey: 'message-1',
      title: 'Ответ поддержки',
      body: 'Ответ поддержки',
      telegramText: 'Ответ поддержки',
      emailSubject: 'Ответ поддержки',
      emailText: 'Ответ поддержки',
      emailHtml: '<p>Ответ поддержки</p>',
    })

    expect(result).toEqual({ telegram: 'sent', email: 'skipped' })
    expect(mocks.prisma.notificationLog.createMany).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('logs delivery errors without throwing', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.test',
      emailVerifiedAt: null,
      name: 'User',
      telegramId: 123n,
    })
    mocks.prisma.notificationLog.createMany.mockResolvedValue({ count: 1 })
    mocks.prisma.notificationLog.updateMany.mockResolvedValue({ count: 1 })
    mocks.prisma.userNotification.createMany.mockResolvedValue({ count: 1 })
    global.fetch = vi.fn(async () => new Response('bad token', { status: 401 })) as typeof fetch

    const result = await notifyUser({
      userId: 'user-1',
      type: 'PAYMENT_FAILED',
      dedupeKey: 'payment-1',
      title: 'Платёж отменён',
      body: 'Платёж отменён',
      telegramText: 'Платёж отменён',
    })

    expect(result).toEqual({ telegram: 'failed', email: 'skipped' })
    expect(mocks.prisma.notificationLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ error: expect.stringContaining('Telegram failed') }) })
    )
  })

  it('sends Telegram photo notifications with inline action button', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.test',
      emailVerifiedAt: null,
      name: 'User',
      telegramId: 123n,
    })
    mocks.prisma.notificationLog.createMany.mockResolvedValue({ count: 1 })
    mocks.prisma.userNotification.createMany.mockResolvedValue({ count: 1 })

    const result = await notifyUser({
      userId: 'user-1',
      type: 'BROADCAST',
      dedupeKey: 'broadcast-1',
      title: 'Новость',
      body: 'Новость',
      telegramText: '<b>Новость</b>',
      telegramImageUrl: 'https://cdn.example.test/image.jpg',
      telegramActionUrl: 'https://cabinet.example.test/dashboard/plans',
      telegramActionLabel: 'Выбрать тариф',
    })

    expect(result).toEqual({ telegram: 'sent', email: 'skipped' })
    expect(fetch).toHaveBeenCalledWith(
      'https://api.telegram.org/bottelegram-token/sendPhoto',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"photo":"https://cdn.example.test/image.jpg"'),
      })
    )
    const request = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as { body: string } | undefined
    expect(request).toBeDefined()
    if (!request) throw new Error('Expected Telegram request')
    const payload = JSON.parse(request.body)
    expect(payload).toEqual(
      expect.objectContaining({
        chat_id: '123',
        caption: '<b>Новость</b>',
        reply_markup: { inline_keyboard: [[{ text: 'Выбрать тариф', url: 'https://cabinet.example.test/dashboard/plans' }]] },
      })
    )
  })

  it('quietly skips duplicate channel notifications', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.test',
      emailVerifiedAt: new Date(),
      name: 'User',
      telegramId: 123n,
    })
    mocks.prisma.notificationLog.createMany.mockResolvedValue({ count: 0 })
    mocks.prisma.userNotification.createMany.mockResolvedValue({ count: 0 })

    const result = await notifyUser({
      userId: 'user-1',
      type: 'SUBSCRIPTION_EXPIRING',
      dedupeKey: 'subscription-expiring:subscription-1:3d',
      title: 'Подписка скоро закончится',
      body: 'Подписка скоро закончится',
      telegramText: 'Подписка скоро закончится',
      emailSubject: 'Подписка скоро закончится',
      emailText: 'Подписка скоро закончится',
      emailHtml: '<p>Подписка скоро закончится</p>',
    })

    expect(result).toEqual({ telegram: 'duplicate', email: 'duplicate' })
    expect(mocks.prisma.notificationLog.createMany).toHaveBeenCalledTimes(2)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends Telegram action button as Web App when requested', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.test',
      emailVerifiedAt: null,
      name: 'User',
      telegramId: 123n,
    })
    mocks.prisma.notificationLog.createMany.mockResolvedValue({ count: 1 })
    mocks.prisma.userNotification.createMany.mockResolvedValue({ count: 1 })

    const result = await notifyUser({
      userId: 'user-1',
      type: 'BROADCAST',
      dedupeKey: 'broadcast-1',
      title: 'Рассылка',
      body: 'Сообщение',
      telegramText: 'Сообщение',
      telegramActionUrl: 'https://cabinet.example.test/dashboard/plans',
      telegramActionLabel: 'Выбрать тариф',
      telegramActionOpenInTelegram: true,
      inApp: false,
    })

    expect(result.telegram).toBe('sent')
    expect(fetch).toHaveBeenCalledWith(
      'https://api.telegram.org/bottelegram-token/sendMessage',
      expect.objectContaining({
        body: expect.stringContaining('"web_app":{"url":"https://cabinet.example.test/dashboard/plans"}'),
      })
    )
    const request = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as { body: string } | undefined
    expect(request).toBeDefined()
    if (!request) throw new Error('Expected Telegram request')
    const payload = JSON.parse(request.body)
    expect(payload.reply_markup.inline_keyboard[0][0]).toEqual({
      text: 'Выбрать тариф',
      web_app: { url: 'https://cabinet.example.test/dashboard/plans' },
    })
    expect(payload.reply_markup.inline_keyboard[0][0].url).toBeUndefined()
  })

  it('sends fallback email when Telegram is not linked', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.test',
      emailVerifiedAt: new Date(),
      name: 'User',
      telegramId: null,
    })
    mocks.prisma.notificationLog.createMany.mockResolvedValue({ count: 1 })
    mocks.prisma.userNotification.createMany.mockResolvedValue({ count: 1 })

    const result = await notifyUser({
      userId: 'user-1',
      type: 'PAYMENT_SUCCESS',
      dedupeKey: 'payment-1',
      title: 'Оплата прошла',
      body: 'Оплата прошла',
      telegramText: '<b>Оплата прошла</b>',
      emailSubject: 'Оплата прошла',
      emailText: 'Оплата прошла',
      emailHtml: '<p>Оплата прошла</p>',
      emailDeliveryMode: 'fallback',
    })

    expect(result).toEqual({ telegram: 'skipped', email: 'sent' })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(
      'https://mail.example.test/send',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('does not send fallback email when Telegram was delivered', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.test',
      emailVerifiedAt: new Date(),
      name: 'User',
      telegramId: 123n,
    })
    mocks.prisma.notificationLog.createMany.mockResolvedValue({ count: 1 })
    mocks.prisma.userNotification.createMany.mockResolvedValue({ count: 1 })

    const result = await notifyUser({
      userId: 'user-1',
      type: 'PAYMENT_SUCCESS',
      dedupeKey: 'payment-1',
      title: 'Оплата прошла',
      body: 'Оплата прошла',
      telegramText: '<b>Оплата прошла</b>',
      emailSubject: 'Оплата прошла',
      emailText: 'Оплата прошла',
      emailHtml: '<p>Оплата прошла</p>',
      emailDeliveryMode: 'fallback',
    })

    expect(result).toEqual({ telegram: 'sent', email: 'skipped' })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(
      'https://api.telegram.org/bottelegram-token/sendMessage',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('sends an expired subscription message through all channels', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.test',
      emailVerifiedAt: new Date(),
      name: 'User',
      telegramId: 123n,
    })
    mocks.prisma.notificationLog.createMany.mockResolvedValue({ count: 1 })
    mocks.prisma.userNotification.createMany.mockResolvedValue({ count: 1 })
    const expireAt = new Date('2026-07-17T09:00:00.000Z')

    await notifySubscriptionExpiring({
      userId: 'user-1',
      subscriptionId: 'subscription-1',
      expireAt,
      stage: 'expired',
      planName: 'Стандарт',
    })

    expect(mocks.prisma.userNotification.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        title: 'Подписка закончилась',
        body: expect.stringContaining('Продлите её'),
        dedupeKey: expect.stringContaining(expireAt.toISOString()),
      }),
    }))
    expect(mocks.prisma.notificationLog.createMany).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('uses separate dedupe keys after a subscription renewal', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.test',
      emailVerifiedAt: null,
      name: 'User',
      telegramId: null,
    })
    mocks.prisma.userNotification.createMany.mockResolvedValue({ count: 1 })

    await notifySubscriptionExpiring({
      userId: 'user-1',
      subscriptionId: 'subscription-1',
      expireAt: new Date('2026-07-20T09:00:00.000Z'),
      stage: '3d',
    })
    await notifySubscriptionExpiring({
      userId: 'user-1',
      subscriptionId: 'subscription-1',
      expireAt: new Date('2026-08-20T09:00:00.000Z'),
      stage: '3d',
    })

    const firstCall = mocks.prisma.userNotification.createMany.mock.calls[0]
    const secondCall = mocks.prisma.userNotification.createMany.mock.calls[1]
    expect(firstCall).toBeDefined()
    expect(secondCall).toBeDefined()
    if (!firstCall || !secondCall) throw new Error('Expected two notifications')
    const first = firstCall[0].data.dedupeKey
    const second = secondCall[0].data.dedupeKey
    expect(first).not.toBe(second)
  })
})

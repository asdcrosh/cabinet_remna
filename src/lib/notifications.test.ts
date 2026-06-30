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

import { notifyUser } from './notifications'

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
    const payload = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string)
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
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    adminNotification: { create: mocks.create },
  },
}))

import { createAdminNotification } from './admin-notifications'

describe('createAdminNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.create.mockResolvedValue({ id: 'notification-1' })
  })

  it('creates one durable Telegram delivery together with the admin notification', async () => {
    await createAdminNotification({
      type: 'payment',
      dedupeKey: 'admin:payment-success:payment-1',
      title: 'Оплата прошла',
      body: 'Клиент оплатил тариф.',
      telegram: {
        text: '<b>✅ Новая оплата</b>',
        actionHref: '/dashboard/admin/payments?q=payment-1',
        actionLabel: 'Открыть платёж',
      },
    })

    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dedupeKey: 'admin:payment-success:payment-1',
        telegramDelivery: {
          create: {
            text: '<b>✅ Новая оплата</b>',
            actionHref: '/dashboard/admin/payments?q=payment-1',
            actionLabel: 'Открыть платёж',
          },
        },
      }),
    })
  })
})

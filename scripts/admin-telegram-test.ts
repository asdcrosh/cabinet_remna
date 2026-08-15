import { createAdminNotification } from '../src/lib/admin-notifications'
import { processAdminTelegramDeliveries } from '../src/lib/admin-telegram-notifications'
import { prisma } from '../src/lib/prisma'

async function main() {
  const dedupeKey = `admin:telegram-self-test:${Date.now()}`
  const notification = await createAdminNotification({
    type: 'telegram_test',
    severity: 'SUCCESS',
    dedupeKey,
    title: 'Telegram-уведомления подключены',
    body: 'Контрольное owner-only уведомление успешно поставлено в очередь.',
    entityType: 'system',
    actionHref: '/dashboard/admin/notifications',
    actionLabel: 'Открыть уведомления',
    telegram: {
      text: [
        '<b>✅ Уведомления с сайта подключены</b>',
        '',
        'Теперь сюда будут приходить успешные оплаты, проблемы с выдачей подписки и новые сообщения поддержки.',
        '',
        'Получатель: только владелец кабинета.',
      ].join('\n'),
      actionHref: '/dashboard/admin/notifications',
      actionLabel: 'Открыть уведомления',
    },
  })
  if (!notification) throw new Error('Unable to create a unique Telegram self-test notification')

  await processAdminTelegramDeliveries({ batchSize: 20 })

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const delivery = await prisma.adminTelegramDelivery.findUnique({
      where: { notificationId: notification.id },
      select: {
        id: true,
        status: true,
        attempts: true,
        telegramMessageId: true,
        lastError: true,
      },
    })
    if (delivery?.status === 'SENT') {
      console.log(JSON.stringify({
        ok: true,
        notificationId: notification.id,
        deliveryId: delivery.id,
        status: delivery.status,
        attempts: delivery.attempts,
        telegramMessageId: delivery.telegramMessageId,
      }))
      return
    }
    if (delivery?.status === 'FAILED') {
      throw new Error(`Telegram self-test failed: ${delivery.lastError ?? 'unknown error'}`)
    }
    await sleep(500)
  }

  throw new Error('Telegram self-test did not reach SENT status in time')
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

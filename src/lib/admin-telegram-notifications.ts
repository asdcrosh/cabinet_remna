import { getAppUrl } from './app-url'
import { logError, logInfo } from './logger'
import { prisma } from './prisma'
import { escapeTelegramHtml } from './telegram-format'

const DELIVERY_TIMEOUT_MS = 15_000
const LOCK_TIMEOUT_MS = 5 * 60 * 1000
const MAX_ATTEMPTS = 8

export type AdminTelegramPayload = {
  text: string
  actionHref?: string
  actionLabel?: string
}

export async function processAdminTelegramDeliveries(input: {
  batchSize?: number
  shouldStop?: () => boolean
} = {}) {
  const recipient = adminTelegramRecipient()
  if (!recipient) {
    return { configured: false, attempted: 0, sent: 0, retried: 0, failed: 0 }
  }

  const now = new Date()
  const staleLock = new Date(now.getTime() - LOCK_TIMEOUT_MS)
  const deliveries = await prisma.adminTelegramDelivery.findMany({
    where: {
      OR: [
        {
          status: { in: ['PENDING', 'RETRYING'] },
          nextRetryAt: { lte: now },
        },
        {
          status: 'PROCESSING',
          lockedAt: { lte: staleLock },
        },
      ],
    },
    orderBy: [{ nextRetryAt: 'asc' }, { createdAt: 'asc' }],
    take: Math.min(100, Math.max(1, input.batchSize ?? 20)),
    select: {
      id: true,
      text: true,
      actionHref: true,
      actionLabel: true,
      attempts: true,
    },
  })

  let attempted = 0
  let sent = 0
  let retried = 0
  let failed = 0

  for (const delivery of deliveries) {
    if (input.shouldStop?.()) break
    const claimed = await prisma.adminTelegramDelivery.updateMany({
      where: {
        id: delivery.id,
        OR: [
          {
            status: { in: ['PENDING', 'RETRYING'] },
            nextRetryAt: { lte: new Date() },
          },
          {
            status: 'PROCESSING',
            lockedAt: { lte: staleLock },
          },
        ],
      },
      data: {
        status: 'PROCESSING',
        lockedAt: new Date(),
        attempts: { increment: 1 },
        lastError: null,
      },
    })
    if (claimed.count === 0) continue

    attempted += 1
    const attempt = delivery.attempts + 1
    try {
      const telegramMessageId = await sendAdminTelegramMessage({
        ...recipient,
        text: delivery.text,
        actionHref: delivery.actionHref,
        actionLabel: delivery.actionLabel,
      })
      await prisma.adminTelegramDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          telegramMessageId,
          nextRetryAt: new Date(),
          lockedAt: null,
          lastError: null,
        },
      })
      sent += 1
      logInfo('admin_telegram.delivery_sent', { deliveryId: delivery.id, attempt })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Telegram delivery failed'
      const exhausted = attempt >= MAX_ATTEMPTS
      await prisma.adminTelegramDelivery.update({
        where: { id: delivery.id },
        data: {
          status: exhausted ? 'FAILED' : 'RETRYING',
          nextRetryAt: exhausted ? new Date() : computeNextRetryAt(attempt),
          lockedAt: null,
          lastError: message.slice(0, 1000),
        },
      })
      if (exhausted) failed += 1
      else retried += 1
      logError('admin_telegram.delivery_failed', error, {
        deliveryId: delivery.id,
        attempt,
        exhausted,
      })
    }
  }

  return { configured: true, attempted, sent, retried, failed }
}

export function buildAdminPaymentTelegramText(input: {
  amount: string
  planName: string
  durationDays: number | null
  customerName: string | null
  customerEmail: string
  telegramUsername: string | null
  provider: string
  expireAt: Date | null
  isPaid: boolean
  isRenewal: boolean
}) {
  const title = input.isPaid
    ? input.isRenewal ? '✅ Продление оплачено' : '✅ Новая оплата'
    : '🎁 Тариф активирован'
  const plan = [input.planName, input.durationDays ? formatDurationDays(input.durationDays) : null]
    .filter(Boolean)
    .join(' · ')
  return [
    `<b>${title}</b>`,
    '',
    input.isPaid ? `<b>${escapeTelegramHtml(input.amount)}</b> · ${escapeTelegramHtml(plan)}` : escapeTelegramHtml(plan),
    `👤 ${formatCustomer(input)}`,
    `💳 ${escapeTelegramHtml(input.provider)}`,
    input.expireAt
      ? `📦 Подписка выдана до <b>${escapeTelegramHtml(formatDate(input.expireAt))}</b>`
      : '📦 Подписка выдана',
  ].join('\n')
}

export function buildAdminPaymentStuckTelegramText(input: {
  amount: string
  planName: string
  customerName: string | null
  customerEmail: string
  telegramUsername: string | null
  provider: string
  reason: string
}) {
  return [
    '<b>🚨 Оплата требует внимания</b>',
    '',
    `<b>${escapeTelegramHtml(input.amount)}</b> · ${escapeTelegramHtml(input.planName)}`,
    `👤 ${formatCustomer(input)}`,
    `💳 ${escapeTelegramHtml(input.provider)}`,
    '',
    escapeTelegramHtml(input.reason),
  ].join('\n')
}

export function buildAdminSupportTelegramText(input: {
  kind: 'ticket' | 'message'
  subject: string
  message: string
  customerName: string | null
  customerEmail: string
  telegramUsername: string | null
}) {
  const title = input.kind === 'ticket'
    ? '🆘 Новое обращение в поддержку'
    : '💬 Новое сообщение в поддержку'
  const preview = compactPreview(input.message, 700)
  return [
    `<b>${title}</b>`,
    '',
    `👤 ${formatCustomer(input)}`,
    `🏷 ${escapeTelegramHtml(input.subject)}`,
    '',
    `<blockquote>${escapeTelegramHtml(preview)}</blockquote>`,
  ].join('\n')
}

function adminTelegramRecipient() {
  if (isFalse(process.env.ADMIN_TELEGRAM_NOTIFICATIONS_ENABLED)) return null
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const chatId = (
    process.env.ADMIN_TELEGRAM_CHAT_ID?.trim() ||
    process.env.TELEGRAM_NOTIFY_CHAT_ID?.trim()
  )
  if (!token || !chatId || !/^-?\d+$/.test(chatId)) return null
  return { token, chatId }
}

async function sendAdminTelegramMessage(input: {
  token: string
  chatId: string
  text: string
  actionHref?: string | null
  actionLabel?: string | null
}) {
  const actionUrl = input.actionHref
    ? new URL(input.actionHref, `${getAppUrl()}/`).toString()
    : null
  const response = await fetch(`https://api.telegram.org/bot${input.token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: input.chatId,
      text: input.text.slice(0, 4000),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(actionUrl && input.actionLabel
        ? {
            reply_markup: {
              inline_keyboard: [[{
                text: input.actionLabel,
                web_app: { url: actionUrl },
              }]],
            },
          }
        : {}),
    }),
    signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
  })
  const data = await response.json().catch(() => null) as {
    ok?: boolean
    description?: string
    result?: { message_id?: number }
  } | null
  if (!response.ok || !data?.ok) {
    throw new Error(`Telegram failed: ${response.status} ${data?.description ?? 'unknown error'}`.slice(0, 1000))
  }
  return data.result?.message_id == null ? null : String(data.result.message_id)
}

function computeNextRetryAt(attempt: number) {
  const delayMinutes = Math.min(60, 2 ** Math.min(attempt - 1, 6))
  return new Date(Date.now() + delayMinutes * 60 * 1000)
}

function formatCustomer(input: {
  customerName: string | null
  customerEmail: string
  telegramUsername: string | null
}) {
  const username = input.telegramUsername?.trim().replace(/^@/, '')
  const name = input.customerName?.trim()
  const email = input.customerEmail.endsWith('@pending.invalid') ? null : input.customerEmail
  return [name, username ? `@${username}` : null, email].filter(Boolean).map((item) => escapeTelegramHtml(item!)).join(' · ') || 'Пользователь'
}

function compactPreview(value: string, maxLength: number) {
  const compact = value.trim().replace(/\s+/g, ' ')
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 1).trimEnd()}…`
}

function formatDurationDays(days: number) {
  const mod10 = days % 10
  const mod100 = days % 100
  const suffix = mod10 === 1 && mod100 !== 11
    ? 'день'
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)
      ? 'дня'
      : 'дней'
  return `${days} ${suffix}`
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  }).format(date)
}

function isFalse(value: string | undefined) {
  return ['0', 'false', 'no', 'off'].includes(value?.trim().toLowerCase() ?? '')
}

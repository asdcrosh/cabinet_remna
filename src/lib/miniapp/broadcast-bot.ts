import { getBrandName } from '@/lib/branding'
import { isAdminRole } from '@/lib/auth/roles'
import { prisma } from '@/lib/prisma'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { rateLimitKey } from '@/lib/rate-limit'
import { createAdminNotification } from '@/lib/admin-notifications'
import { writeAuditLog } from '@/lib/audit-log'
import { createBroadcastCampaign, type BroadcastSegment } from '@/lib/broadcast-campaign'
import { escapeTelegramHtml as escape } from '@/lib/telegram-format'
import { miniAppBotCall } from './bot-api'
import { isChannelReference } from './channel-referrals'

// Рассылка из бота: администратор выбирает тему, пишет текст одним сообщением —
// кнопка в нужный раздел бота и аудитория подставляются по теме автоматически.

export type BroadcastTheme = {
  key: string
  label: string
  title: string
  segment: BroadcastSegment
  segmentLabel: string
  button: { label: string; screen: string } | null
  hint: string
}

export const broadcastThemes: BroadcastTheme[] = [
  {
    key: 'promo',
    label: '🎉 Акция и скидки',
    title: 'Акция',
    segment: 'ALL',
    segmentLabel: 'Все пользователи',
    button: { label: '💎 Выбрать тариф', screen: 'plans' },
    hint: 'Расскажите об акции: размер скидки, сроки и что получит пользователь.',
  },
  {
    key: 'winback',
    label: '💔 Возврат клиентов',
    title: 'Мы скучаем',
    segment: 'EXPIRED',
    segmentLabel: 'С истекшей подпиской',
    button: { label: '🔄 Продлить подписку', screen: 'plans' },
    hint: 'Верните тех, у кого закончилась подписка: напомните о сервисе или предложите бонус за продление.',
  },
  {
    key: 'connect',
    label: '🔌 Помощь с подключением',
    title: 'Как подключиться',
    segment: 'ACTIVE',
    segmentLabel: 'С активной подпиской',
    button: { label: '🔌 Подключиться', screen: 'connect' },
    hint: 'Инструкция по подключению или новость о приложениях для устройств.',
  },
  {
    key: 'bonus',
    label: '🎁 Бонусы и промокоды',
    title: 'Бонусы',
    segment: 'ALL',
    segmentLabel: 'Все пользователи',
    button: { label: '🎁 Мои бонусы', screen: 'bonus' },
    hint: 'Расскажите о розыгрыше, новом промокоде или заданиях за попытки.',
  },
  {
    key: 'support',
    label: '🛟 Новости поддержки',
    title: 'Поддержка',
    segment: 'ALL',
    segmentLabel: 'Все пользователи',
    button: { label: '🛟 Написать в поддержку', screen: 'support' },
    hint: 'Изменения в работе поддержки, график ответов, разбор частых вопросов.',
  },
  {
    key: 'news',
    label: '📢 Общая новость',
    title: 'Новости сервиса',
    segment: 'ALL',
    segmentLabel: 'Все пользователи',
    button: null,
    hint: 'Любое объявление без кнопки действия.',
  },
]

export function findBroadcastTheme(key: string) {
  return broadcastThemes.find((theme) => theme.key === key) ?? null
}

// DTO для чистых рендеров экранов.
export function broadcastThemeView(theme: BroadcastTheme) {
  return {
    key: theme.key,
    label: theme.label,
    segmentLabel: theme.segmentLabel,
    buttonLabel: theme.button?.label ?? null,
    hint: theme.hint,
  }
}

export const BROADCAST_TEXT_MIN = 5
export const BROADCAST_TEXT_MAX = 1200

export function validateBroadcastText(text: string) {
  const body = text.trim()
  if (body.length < BROADCAST_TEXT_MIN) return { ok: false as const, error: 'Текст слишком короткий — напишите хотя бы пару слов.' }
  if (body.length > BROADCAST_TEXT_MAX) return { ok: false as const, error: `Текст слишком длинный. Максимум ${BROADCAST_TEXT_MAX} символов.` }
  return { ok: true as const, body }
}

// Произвольная кнопка рассылки: ссылка или действие в боте (callback_data).
export type BroadcastCustomButton = { label: string; url: string | null; data: string | null }

// Разделы, на которые может вести кнопка рассылки (админка получателям недоступна).
const BROADCAST_BUTTON_SCREENS = ['home', 'subscription', 'plans', 'billing', 'devices', 'bonus', 'promos',
  'notifications', 'referrals', 'support', 'connect', 'settings'] as const

const BUTTON_LINE = /^\s*кнопка\s*:\s*(.{1,32}?)\s*\|\s*(\S+)\s*$/i

// Последняя строка «Кнопка: Текст | цель» заменяет кнопку темы. Цель —
// https-ссылка, раздел бота (plans, bonus, support, …) или promo:КОД.
export function extractBroadcastButton(text: string): { body: string; button: BroadcastCustomButton | null } | { error: string } {
  const lines = text.trim().split('\n')
  const last = lines[lines.length - 1] ?? ''
  if (!/^\s*кнопка\s*:/i.test(last)) return { body: text.trim(), button: null }
  const match = last.match(BUTTON_LINE)
  if (!match) return { error: 'Кнопка не распознана. Формат последней строки: «Кнопка: Текст | plans», «Кнопка: Текст | https://t.me/…» или «Кнопка: Текст | promo:КОД».' }
  const label = match[1]!.trim()
  const target = match[2]!.trim()
  if (!label) return { error: 'У кнопки пустой текст. Напишите, что на ней будет написано.' }
  let button: BroadcastCustomButton | null = null
  if (/^https:\/\//i.test(target)) {
    try {
      const url = new URL(target)
      if (url.protocol !== 'https:' || target.length > 256) throw new Error('bad url')
      button = { label, url: target, data: null }
    } catch { return { error: 'Ссылка кнопки должна начинаться с https:// и быть короче 256 символов.' } }
  } else if (/^promo:[A-Za-z0-9]{4,32}$/.test(target)) {
    button = { label, url: null, data: `avp:promo:${target.slice(6).toUpperCase()}` }
  } else if ((BROADCAST_BUTTON_SCREENS as readonly string[]).includes(target.toLowerCase())) {
    button = { label, url: null, data: `avp:${target.toLowerCase()}` }
  } else {
    return { error: `Куда ведёт кнопка — не понял. Доступны разделы: ${BROADCAST_BUTTON_SCREENS.join(', ')}, ссылка https:// или promo:КОД.` }
  }
  return { body: lines.slice(0, -1).join('\n').trim(), button }
}

// Черновик рассылки в payload диалога: текст, опциональный file_id фото и своя кнопка.
export type BroadcastDraft = { text: string; image: string | null; button?: BroadcastCustomButton | null }

export function serializeBroadcastDraft(draft: BroadcastDraft) {
  return JSON.stringify(draft)
}

export function parseBroadcastDraft(payload: string | null | undefined): BroadcastDraft | null {
  if (!payload) return null
  try {
    const value: unknown = JSON.parse(payload)
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const draft = value as Record<string, unknown>
      if (typeof draft.text === 'string' && draft.text.trim()) {
        return { text: draft.text, image: typeof draft.image === 'string' && draft.image ? draft.image.slice(0, 256) : null,
          button: parseDraftButton(draft.button) }
      }
    }
  } catch { /* Ранние черновики хранились простым текстом. */ }
  return payload.trim() ? { text: payload, image: null } : null
}

// Кнопка из черновика принимается только в строгом формате: черновик хранится
// в БД и мог быть записан чем угодно.
function parseDraftButton(value: unknown): BroadcastCustomButton | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const button = value as Record<string, unknown>
  if (typeof button.label !== 'string' || !button.label.trim()) return null
  const label = button.label.trim().slice(0, 32)
  if (typeof button.url === 'string' && /^https:\/\//.test(button.url) && button.url.length <= 256) {
    return { label, url: button.url, data: null }
  }
  if (typeof button.data === 'string' && /^avp:[a-z0-9:_-]{1,58}$/i.test(button.data)) {
    return { label, url: null, data: button.data }
  }
  return null
}

export async function createBotBroadcast(adminUserId: string, themeKey: string, text: string, image?: string | null,
  customButton?: BroadcastCustomButton | null) {
  const admin = await prisma.user.findUnique({ where: { id: adminUserId }, select: { id: true, role: true } })
  if (!admin || !isAdminRole(admin.role)) return { ok: false as const, error: 'Раздел доступен администраторам.' }
  if (!await isFeatureEnabled('broadcasts')) return { ok: false as const, error: 'Рассылки сейчас отключены администратором.' }
  const theme = findBroadcastTheme(themeKey)
  if (!theme) return { ok: false as const, error: 'Тема рассылки не найдена. Начните заново.' }
  const validated = validateBroadcastText(text)
  if (!validated.ok) return validated

  const limit = await rateLimitKey(`bot-broadcast:${admin.id}`, 3, 5 * 60_000)
  if (!limit.ok) return { ok: false as const, error: 'Слишком много рассылок подряд. Подождите несколько минут.' }

  // Своя кнопка заменяет кнопку темы; без неё уезжает тематическая.
  const botButton = customButton
    ? { label: customButton.label, ...(customButton.url ? { url: customButton.url } : { data: customButton.data! }) }
    : theme.button ? { label: theme.button.label, data: `avp:${theme.button.screen}` } : null
  const queued = await createBroadcastCampaign({
    title: theme.title,
    body: validated.body,
    segment: theme.segment,
    channels: ['TELEGRAM'],
    telegramBotButton: botButton,
    telegramImageFileId: image ?? null,
    createdById: admin.id,
  })

  await createAdminNotification({
    type: 'broadcast',
    severity: 'INFO',
    dedupeKey: `admin:${queued.batchKey}`,
    title: 'Рассылка поставлена в очередь из бота',
    body: `${theme.title}: получателей ${queued.recipients}.`,
    actionHref: '/dashboard/admin/broadcasts',
    actionLabel: 'Открыть рассылки',
  })
  await writeAuditLog({
    actorId: admin.id,
    action: 'ADMIN_BROADCAST_CREATED',
    message: 'Администратор поставил рассылку в очередь из Telegram-бота',
    metadata: {
      entityType: 'broadcastCampaign',
      campaignId: queued.campaignId,
      title: theme.title,
      theme: theme.key,
      segment: theme.segment,
      channels: ['TELEGRAM'],
      recipients: queued.recipients,
      limited: queued.limited,
    },
  })

  // Тот же пост — в канал сервиса: кнопки бота заменяются ссылками-диаплинками.
  const channelPosted = await postBroadcastToChannel({
    text: validated.body, image: image ?? null, button: channelButtonFor(botButton) })
  return { ok: true as const, theme, recipients: queued.recipients, limited: queued.limited, channelPosted }
}

// В канале callback-кнопки бота бесполезны (бот отвечает только в личке),
// поэтому действие превращаем в диаплинк: t.me/<бот>?start=<раздел>.
function channelButtonFor(botButton: { label: string; data?: string; url?: string } | null) {
  if (!botButton) return null
  if (botButton.url) return { label: botButton.label, url: botButton.url }
  const username = (process.env.TELEGRAM_MINIAPP_BOT_USERNAME || '').replace(/^@/, '').trim()
  if (!username || !botButton.data) return null
  const screen = botButton.data.startsWith('avp:promo:') ? 'promos'
    : botButton.data.startsWith('avp:') ? botButton.data.slice(4) : null
  if (!screen || !/^[a-z]{2,20}$/.test(screen)) return null
  return { label: botButton.label, url: `https://t.me/${username}?start=${screen}` }
}

// Пост в канал идёт без персонализации: переменные заменяем нейтральными.
async function postBroadcastToChannel(input: { text: string; image: string | null;
  button: { label: string; url: string } | null }) {
  const reference = (process.env.TELEGRAM_BROADCAST_CHANNEL_ID || process.env.TELEGRAM_REWARD_CHANNEL_ID || '').trim()
  if (!isChannelReference(reference)) return false
  const text = input.text.replace(/\{name\}/gi, 'друг').replace(/\{plan\}/gi, () => getBrandName()).replace(/\{days_left\}/gi, '—')
  try {
    if (input.image) {
      await miniAppBotCall('sendPhoto', { chat_id: reference, photo: input.image,
        caption: text.slice(0, 1000), parse_mode: 'HTML',
        ...(input.button ? { reply_markup: { inline_keyboard: [[{ text: input.button.label, url: input.button.url, style: 'success' }]] } } : {}) })
    } else {
      const html = `<p>${escape(text).replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>')}</p>`
        + (input.button ? `<tg-button-row><tg-button type="url" style="success" url="${escape(input.button.url)}">${escape(input.button.label)}</tg-button></tg-button-row>` : '')
      await miniAppBotCall('sendRichMessage', { chat_id: reference, rich_message: { html } })
    }
    return true
  } catch {
    // Канал — вторичный адресат: сбой поста не отменяет рассылку пользователям.
    return false
  }
}

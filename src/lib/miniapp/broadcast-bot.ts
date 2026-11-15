import { prisma } from '@/lib/prisma'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { rateLimitKey } from '@/lib/rate-limit'
import { createAdminNotification } from '@/lib/admin-notifications'
import { writeAuditLog } from '@/lib/audit-log'
import { createBroadcastCampaign, type BroadcastSegment } from '@/lib/broadcast-campaign'

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

// Черновик рассылки в payload диалога: текст и опциональный file_id фото.
export type BroadcastDraft = { text: string; image: string | null }

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
        return { text: draft.text, image: typeof draft.image === 'string' && draft.image ? draft.image.slice(0, 256) : null }
      }
    }
  } catch { /* Ранние черновики хранились простым текстом. */ }
  return payload.trim() ? { text: payload, image: null } : null
}

export async function createBotBroadcast(adminUserId: string, themeKey: string, text: string, image?: string | null) {
  const admin = await prisma.user.findUnique({ where: { id: adminUserId }, select: { id: true, role: true } })
  if (!admin || admin.role === 'USER') return { ok: false as const, error: 'Раздел доступен администраторам.' }
  if (!await isFeatureEnabled('broadcasts')) return { ok: false as const, error: 'Рассылки сейчас отключены администратором.' }
  const theme = findBroadcastTheme(themeKey)
  if (!theme) return { ok: false as const, error: 'Тема рассылки не найдена. Начните заново.' }
  const validated = validateBroadcastText(text)
  if (!validated.ok) return validated

  const limit = await rateLimitKey(`bot-broadcast:${admin.id}`, 3, 5 * 60_000)
  if (!limit.ok) return { ok: false as const, error: 'Слишком много рассылок подряд. Подождите несколько минут.' }

  const queued = await createBroadcastCampaign({
    title: theme.title,
    body: validated.body,
    segment: theme.segment,
    channels: ['TELEGRAM'],
    telegramBotButton: theme.button ? { label: theme.button.label, data: `avp:${theme.button.screen}` } : null,
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

  return { ok: true as const, theme, recipients: queued.recipients, limited: queued.limited }
}

import type { Prisma, SubscriptionStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { renderActionEmail } from '@/lib/email-template'
import { getAppUrl } from '@/lib/app-url'
import { getBrandName } from '@/lib/branding'
import { renderTelegramCustomEmoji, stripTelegramCustomEmojiMarkup } from '@/lib/telegram-format'
import { remnashopQuery } from '@/lib/remnashop-db'
import { logWarn } from '@/lib/logger'
import type { BroadcastDeliveryPayload } from '@/lib/broadcast-delivery'
import { getBroadcastActionUrl } from '@/lib/broadcast-action-url'

// Ядро рассылок: аудитория, персонализация и постановка кампании в очередь.
// Используется и HTTP-роутом админки, и рассылкой из Telegram-бота.

export const MAX_RECIPIENTS = 5000
export const DEFAULT_INACTIVE_DAYS = 45
export const ACTIVE_SUBSCRIPTION_STATUSES = ['ACTIVE', 'LIMITED'] satisfies SubscriptionStatus[]

export type BroadcastSegment = 'ALL' | 'ACTIVE' | 'NO_ACTIVE' | 'EXPIRED' | 'NEVER_PURCHASED' | 'INACTIVE_N_DAYS'
export type BroadcastChannel = 'IN_APP' | 'EMAIL' | 'TELEGRAM'
// Кнопка под сообщением в боте: действие (callback_data) или внешняя ссылка.
export type BroadcastBotButton = { label: string; data?: string; url?: string }

export const broadcastUserSelect = {
  id: true,
  email: true,
  emailVerifiedAt: true,
  name: true,
  telegramId: true,
  referralCode: true,
  notificationPreference: {
    select: {
      broadcastsEnabled: true,
      inAppEnabled: true,
      telegramEnabled: true,
      emailEnabled: true,
    },
  },
  subscriptions: {
    where: { status: { in: ACTIVE_SUBSCRIPTION_STATUSES }, expireAt: { gt: new Date() } },
    orderBy: { expireAt: 'desc' },
    take: 1,
    select: {
      expireAt: true,
      plan: { select: { name: true } },
    },
  },
} satisfies Prisma.UserSelect

interface RemnashopAudienceRow {
  id: number
  telegram_id: string | null
  email: string | null
}

export function normalizeBroadcastSegment(value: string): BroadcastSegment {
  if (value === 'INACTIVE_45D') return 'INACTIVE_N_DAYS'
  return value as BroadcastSegment
}

// Ставит кампанию в очередь: создаёт запись и персонализированные доставки.
// Ссылки и картинка должны быть уже нормализованы вызывающим кодом.
export async function createBroadcastCampaign(input: {
  title: string
  body: string
  segment: BroadcastSegment
  inactiveDays?: number | null
  channels: BroadcastChannel[]
  actionHref?: string | null
  actionLabel?: string
  actionOpenInTelegram?: boolean
  imageUrl?: string | null
  telegramBotButton?: BroadcastBotButton | null
  telegramImageFileId?: string | null
  createdById: string
}) {
  const inactiveDays = input.segment === 'INACTIVE_N_DAYS' ? input.inactiveDays ?? DEFAULT_INACTIVE_DAYS : null
  const channels = new Set(input.channels)
  const users = await findBroadcastUsers(input.segment, inactiveDays ?? DEFAULT_INACTIVE_DAYS, input.channels)
  const actionHref = input.actionHref ?? null
  const actionUrl = getBroadcastActionUrl(actionHref, getAppUrl())
  const actionOpenInTelegram = Boolean(input.actionOpenInTelegram && actionHref)
  const batchKey = `broadcast:${Date.now()}:${input.createdById}`

  const campaign = await prisma.broadcastCampaign.create({
    data: {
      title: input.title,
      body: stripTelegramCustomEmojiMarkup(input.body),
      segment: input.segment,
      inactiveDays,
      channels: input.channels,
      actionHref,
      actionLabel: input.actionLabel,
      actionOpenInTelegram,
      imageUrl: input.imageUrl ?? null,
      recipients: users.length,
      limited: users.length === MAX_RECIPIENTS,
      createdById: input.createdById,
    },
    select: { id: true },
  })

  const deliveries = users.map((user) => {
    const payload = buildBroadcastPayload({
      user,
      batchKey,
      title: input.title,
      body: input.body,
      actionHref,
      actionLabel: input.actionLabel,
      actionOpenInTelegram,
      imageUrl: input.imageUrl ?? null,
      channels,
      actionUrl,
      telegramBotButton: input.telegramBotButton ?? null,
      telegramImageFileId: input.telegramImageFileId ?? null,
    })

    return {
      campaignId: campaign.id,
      userId: user.id,
      payload: payload as unknown as Prisma.InputJsonValue,
    }
  })

  for (let index = 0; index < deliveries.length; index += 1000) {
    await prisma.broadcastDelivery.createMany({
      data: deliveries.slice(index, index + 1000),
      skipDuplicates: true,
    })
  }

  return {
    campaignId: campaign.id,
    batchKey,
    recipients: users.length,
    limited: users.length === MAX_RECIPIENTS,
  }
}

export async function findBroadcastUsers(segment: BroadcastSegment, inactiveDays: number, channels: BroadcastChannel[]) {
  const where = combineWhere(
    await buildSegmentWhere(segment, inactiveDays),
    buildDeliveryWhere(channels)
  )
  return prisma.user.findMany({
    where,
    select: broadcastUserSelect,
    orderBy: { createdAt: 'desc' },
    take: MAX_RECIPIENTS,
  })
}

async function buildSegmentWhere(segment: BroadcastSegment, inactiveDays: number): Promise<Prisma.UserWhereInput> {
  const now = new Date()
  const inactiveCutoff = new Date(now.getTime() - inactiveDays * 24 * 60 * 60 * 1000)

  switch (segment) {
    case 'ACTIVE':
      return buildActiveWhere(now)
    case 'NO_ACTIVE':
      return buildNoActiveWhere(now)
    case 'EXPIRED':
      return buildExpiredWhere(now)
    case 'NEVER_PURCHASED':
      return buildNeverPurchasedWhere()
    case 'INACTIVE_N_DAYS':
      return buildInactiveBuyersWhere(inactiveCutoff, inactiveDays, now)
    case 'ALL':
    default:
      return {}
  }
}

async function buildActiveWhere(now: Date): Promise<Prisma.UserWhereInput> {
  const localWhere = localActiveWhere(now)
  const remnashopRows = await fetchRemnashopActiveUsers()
  if (!remnashopRows) return localWhere

  return {
    OR: [
      remnashopRowsToUserWhere(remnashopRows),
      {
        AND: [
          { remnashopUserId: null },
          localWhere,
        ],
      },
    ],
  }
}

async function buildNoActiveWhere(now: Date): Promise<Prisma.UserWhereInput> {
  const localWhere = localNoActiveWhere(now)
  const remnashopRows = await fetchRemnashopNoActiveUsers()
  if (!remnashopRows) return localWhere

  return {
    AND: [
      localWhere,
      {
        OR: [
          remnashopRowsToUserWhere(remnashopRows),
          { remnashopUserId: null },
        ],
      },
    ],
  }
}

async function buildExpiredWhere(now: Date): Promise<Prisma.UserWhereInput> {
  const localWhere = localExpiredWhere(now)
  const remnashopRows = await fetchRemnashopExpiredUsers()
  if (!remnashopRows) return localWhere

  return {
    AND: [
      localNoActiveWhere(now),
      {
        OR: [
          remnashopRowsToUserWhere(remnashopRows),
          {
            AND: [
              { remnashopUserId: null },
              localWhere,
            ],
          },
        ],
      },
    ],
  }
}

async function buildInactiveBuyersWhere(cutoff: Date, inactiveDays: number, now: Date): Promise<Prisma.UserWhereInput> {
  const localWhere = localInactiveBuyersWhere(cutoff, now)
  const remnashopRows = await fetchRemnashopInactiveBuyers(inactiveDays)
  if (!remnashopRows) return localWhere

  return {
    AND: [
      localNoActiveWhere(now),
      {
        OR: [
          remnashopRowsToUserWhere(remnashopRows),
          {
            AND: [
              { remnashopUserId: null },
              localWhere,
            ],
          },
        ],
      },
    ],
  }
}

async function buildNeverPurchasedWhere(): Promise<Prisma.UserWhereInput> {
  const localWhere = localNeverPurchasedWhere()
  const remnashopRows = await fetchRemnashopNeverPurchased()
  if (!remnashopRows) return localWhere

  return {
    AND: [
      localWhere,
      {
        OR: [
          remnashopRowsToUserWhere(remnashopRows),
          { remnashopUserId: null },
        ],
      },
    ],
  }
}

function localActiveWhere(now: Date): Prisma.UserWhereInput {
  return { subscriptions: { some: { status: { in: ACTIVE_SUBSCRIPTION_STATUSES }, expireAt: { gt: now } } } }
}

function localNoActiveWhere(now: Date): Prisma.UserWhereInput {
  return { subscriptions: { none: { status: { in: ACTIVE_SUBSCRIPTION_STATUSES }, expireAt: { gt: now } } } }
}

function localExpiredWhere(now: Date): Prisma.UserWhereInput {
  return {
    subscriptions: {
      some: { expireAt: { lte: now } },
      none: { status: { in: ACTIVE_SUBSCRIPTION_STATUSES }, expireAt: { gt: now } },
    },
  }
}

function localInactiveBuyersWhere(cutoff: Date, now: Date): Prisma.UserWhereInput {
  return {
    AND: [
      {
        subscriptions: {
          some: { expireAt: { lt: cutoff } },
        },
      },
      {
        subscriptions: {
          none: { expireAt: { gte: cutoff } },
        },
      },
      localNoActiveWhere(now),
    ],
  }
}

function localNeverPurchasedWhere(): Prisma.UserWhereInput {
  return {
    payments: { none: { status: 'SUCCEEDED' } },
    subscriptions: { none: {} },
  }
}

async function fetchRemnashopInactiveBuyers(inactiveDays: number) {
  if (!process.env.REMNASHOP_DATABASE_URL) return null

  try {
    const result = await remnashopQuery<RemnashopAudienceRow>(
      `
        WITH last_subscription AS (
          SELECT user_id, max(expire_at) AS last_expire_at
          FROM subscriptions
          WHERE expire_at IS NOT NULL
          GROUP BY user_id
        )
        SELECT u.id, u.telegram_id::text AS telegram_id, lower(u.email) AS email
        FROM users u
        JOIN last_subscription ls ON ls.user_id = u.id
        WHERE ls.last_expire_at < now() - ($1::int * interval '1 day')
          AND NOT EXISTS (
            SELECT 1
            FROM subscriptions active_s
            WHERE active_s.user_id = u.id
              AND active_s.expire_at > now()
              AND upper(active_s.status::text) = 'ACTIVE'
          )
        ORDER BY ls.last_expire_at DESC
        LIMIT ${MAX_RECIPIENTS * 2}
      `,
      [inactiveDays]
    )
    return result.rows
  } catch (error) {
    logWarn('broadcast.remnashop_inactive_segment_failed', {
      inactiveDays,
      message: error instanceof Error ? error.message : 'unknown error',
    })
    return null
  }
}

async function fetchRemnashopActiveUsers() {
  if (!process.env.REMNASHOP_DATABASE_URL) return null

  try {
    const result = await remnashopQuery<RemnashopAudienceRow>(
      `
        SELECT DISTINCT u.id, u.telegram_id::text AS telegram_id, lower(u.email) AS email
        FROM users u
        JOIN subscriptions s ON s.user_id = u.id
        WHERE s.expire_at > now()
          AND upper(s.status::text) = 'ACTIVE'
        ORDER BY u.id DESC
        LIMIT ${MAX_RECIPIENTS * 2}
      `
    )
    return result.rows
  } catch (error) {
    logWarn('broadcast.remnashop_active_segment_failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    })
    return null
  }
}

async function fetchRemnashopNoActiveUsers() {
  if (!process.env.REMNASHOP_DATABASE_URL) return null

  try {
    const result = await remnashopQuery<RemnashopAudienceRow>(
      `
        SELECT u.id, u.telegram_id::text AS telegram_id, lower(u.email) AS email
        FROM users u
        WHERE NOT EXISTS (
          SELECT 1
          FROM subscriptions active_s
          WHERE active_s.user_id = u.id
            AND active_s.expire_at > now()
            AND upper(active_s.status::text) = 'ACTIVE'
        )
        ORDER BY u.id DESC
        LIMIT ${MAX_RECIPIENTS * 2}
      `
    )
    return result.rows
  } catch (error) {
    logWarn('broadcast.remnashop_no_active_segment_failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    })
    return null
  }
}

async function fetchRemnashopExpiredUsers() {
  if (!process.env.REMNASHOP_DATABASE_URL) return null

  try {
    const result = await remnashopQuery<RemnashopAudienceRow>(
      `
        SELECT u.id, u.telegram_id::text AS telegram_id, lower(u.email) AS email
        FROM users u
        WHERE EXISTS (
          SELECT 1
          FROM subscriptions expired_s
          WHERE expired_s.user_id = u.id
            AND expired_s.expire_at <= now()
        )
          AND NOT EXISTS (
            SELECT 1
            FROM subscriptions active_s
            WHERE active_s.user_id = u.id
              AND active_s.expire_at > now()
              AND upper(active_s.status::text) = 'ACTIVE'
          )
        ORDER BY u.id DESC
        LIMIT ${MAX_RECIPIENTS * 2}
      `
    )
    return result.rows
  } catch (error) {
    logWarn('broadcast.remnashop_expired_segment_failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    })
    return null
  }
}

async function fetchRemnashopNeverPurchased() {
  if (!process.env.REMNASHOP_DATABASE_URL) return null

  try {
    const result = await remnashopQuery<RemnashopAudienceRow>(
      `
        SELECT u.id, u.telegram_id::text AS telegram_id, lower(u.email) AS email
        FROM users u
        WHERE NOT EXISTS (
          SELECT 1 FROM subscriptions s WHERE s.user_id = u.id
        )
          AND NOT EXISTS (
            SELECT 1
            FROM transactions t
            WHERE t.user_id = u.id
              AND upper(t.status::text) IN ('COMPLETED', 'SUCCEEDED', 'SUCCESS', 'PAID')
          )
        ORDER BY u.id DESC
        LIMIT ${MAX_RECIPIENTS * 2}
      `
    )
    return result.rows
  } catch (error) {
    logWarn('broadcast.remnashop_never_purchased_segment_failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    })
    return null
  }
}

function remnashopRowsToUserWhere(rows: RemnashopAudienceRow[]): Prisma.UserWhereInput {
  const or: Prisma.UserWhereInput[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    addUniqueWhere(or, seen, `remnashop:${row.id}`, { remnashopUserId: row.id })
    if (row.telegram_id && /^\d+$/.test(row.telegram_id)) {
      addUniqueWhere(or, seen, `telegram:${row.telegram_id}`, { telegramId: BigInt(row.telegram_id) })
    }
    if (row.email && !row.email.endsWith('@pending.invalid') && !row.email.endsWith('@pending.invalid.local')) {
      addUniqueWhere(or, seen, `email:${row.email}`, { email: { equals: row.email, mode: 'insensitive' } })
    }
  }

  return or.length > 0 ? { OR: or } : { id: '__no_remnashop_matches__' }
}

function addUniqueWhere(
  items: Prisma.UserWhereInput[],
  seen: Set<string>,
  key: string,
  where: Prisma.UserWhereInput
) {
  if (seen.has(key)) return
  seen.add(key)
  items.push(where)
}

function buildDeliveryWhere(channels: BroadcastChannel[]): Prisma.UserWhereInput {
  const or: Prisma.UserWhereInput[] = []
  if (channels.includes('IN_APP')) {
    or.push(channelPreferenceWhere('inAppEnabled'))
  }
  if (channels.includes('TELEGRAM')) {
    or.push({
      AND: [
        { telegramId: { not: null } },
        channelPreferenceWhere('telegramEnabled'),
      ],
    })
  }
  if (channels.includes('EMAIL')) {
    or.push({
      AND: [
        { emailVerifiedAt: { not: null } },
        {
          NOT: [
            { email: { endsWith: '@pending.invalid' } },
            { email: { endsWith: '@pending.invalid.local' } },
          ],
        },
        channelPreferenceWhere('emailEnabled'),
      ],
    })
  }

  return or.length > 0 ? { OR: or } : {}
}

function channelPreferenceWhere(channel: 'inAppEnabled' | 'telegramEnabled' | 'emailEnabled'): Prisma.UserWhereInput {
  return {
    OR: [
      { notificationPreference: { is: null } },
      { notificationPreference: { is: { broadcastsEnabled: true, [channel]: true } } },
    ],
  }
}

function combineWhere(...items: Prisma.UserWhereInput[]): Prisma.UserWhereInput {
  const activeItems = items.filter((item) => Object.keys(item).length > 0)
  if (activeItems.length === 0) return {}
  if (activeItems.length === 1) return activeItems[0] ?? {}
  return { AND: activeItems }
}

export function normalizeBroadcastImageUrl(value: string | null | undefined) {
  const href = value?.trim()
  if (!href) return null

  try {
    const url = new URL(href)
    if (url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

export function buildBroadcastPayload({
  user,
  batchKey,
  title,
  body,
  actionHref,
  actionLabel,
  actionOpenInTelegram,
  imageUrl,
  channels,
  actionUrl,
  telegramBotButton,
  telegramImageFileId,
}: {
  user: {
    id: string
    email: string
    name: string | null
    referralCode: string | null
    subscriptions: Array<{ expireAt: Date; plan: { name: string } | null }>
  }
  batchKey: string
  title: string
  body: string
  actionHref: string | null
  actionLabel: string | undefined
  actionOpenInTelegram: boolean
  imageUrl: string | null
  channels: Set<BroadcastChannel>
  actionUrl: string
  telegramBotButton?: BroadcastBotButton | null
  telegramImageFileId?: string | null
}): BroadcastDeliveryPayload {
  const variables = buildTemplateVariables(user)
  const personalizedTitle = applyTemplateVariables(title, variables)
  const personalizedBody = applyTemplateVariables(body, variables)
  const personalizedPlainBody = stripTelegramCustomEmojiMarkup(personalizedBody)
  const personalizedActionLabel = actionLabel ? applyTemplateVariables(actionLabel, variables) : undefined

  return {
    userId: user.id,
    dedupeKey: `${batchKey}:${user.id}`,
    title: personalizedTitle,
    body: personalizedPlainBody,
    actionHref,
    actionLabel: personalizedActionLabel ?? null,
    inApp: channels.has('IN_APP'),
    telegramText: channels.has('TELEGRAM') ? renderTelegramCustomEmoji(personalizedBody) : null,
    telegramImageUrl: channels.has('TELEGRAM') ? imageUrl : null,
    telegramActionUrl: channels.has('TELEGRAM') && actionHref ? actionUrl : null,
    telegramActionLabel: channels.has('TELEGRAM') && actionHref ? personalizedActionLabel || 'Открыть' : null,
    telegramActionOpenInTelegram: channels.has('TELEGRAM') ? actionOpenInTelegram : undefined,
    telegramBotButton: channels.has('TELEGRAM') ? telegramBotButton ?? null : null,
    telegramImageFileId: channels.has('TELEGRAM') ? telegramImageFileId ?? null : null,
    emailSubject: channels.has('EMAIL') ? `${personalizedTitle} — ${getBrandName()}` : null,
    emailText: channels.has('EMAIL') ? `${personalizedPlainBody}${actionHref ? `\n\n${actionUrl}` : ''}` : null,
    emailHtml: channels.has('EMAIL')
      ? renderActionEmail({
          eyebrow: 'Сообщение',
          title: personalizedTitle,
          lead: 'Новое сообщение от администратора сервиса.',
          body: personalizedPlainBody,
          ctaLabel: personalizedActionLabel || 'Открыть кабинет',
          ctaUrl: actionUrl,
          imageUrl,
          expiry: 'Это сообщение отправлено администратором сервиса.',
          securityNote: 'Если сообщение неактуально, просто игнорируйте его.',
        })
      : null,
  }
}

function buildTemplateVariables(user: {
  id?: string
  email: string
  name: string | null
  referralCode: string | null
  subscriptions: Array<{ expireAt: Date; plan: { name: string } | null }>
}) {
  const subscription = user.subscriptions[0]
  const daysLeft = subscription ? Math.max(0, Math.ceil((subscription.expireAt.getTime() - Date.now()) / 86_400_000)) : 0
  const referralCode = user.referralCode
  return {
    name: user.name?.trim() || user.email,
    email: user.email,
    days_left: String(daysLeft),
    plan: subscription?.plan?.name || 'без активного тарифа',
    ref_link: referralCode ? `${getAppUrl()}/register?ref=${encodeURIComponent(referralCode)}` : `${getAppUrl()}/dashboard/referrals`,
  }
}

function applyTemplateVariables(value: string, variables: Record<string, string>) {
  return value.replace(/\{(name|email|days_left|plan|ref_link)\}/g, (_, key: string) => variables[key] ?? '')
}

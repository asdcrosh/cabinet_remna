import { NextResponse } from 'next/server'
import type { Prisma, SubscriptionStatus } from '@prisma/client'
import { z } from 'zod'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'
import { notifyUser } from '@/lib/notifications'
import { renderActionEmail } from '@/lib/email-template'
import { getAppUrl } from '@/lib/app-url'
import { getBrandName } from '@/lib/branding'
import { createAdminNotification } from '@/lib/admin-notifications'
import { renderTelegramCustomEmoji, stripTelegramCustomEmojiMarkup } from '@/lib/telegram-format'
import { rateLimit } from '@/lib/rate-limit'
import { remnashopQuery } from '@/lib/remnashop-db'
import { logWarn } from '@/lib/logger'
import type { BroadcastDeliveryPayload } from '@/lib/broadcast-delivery'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_RECIPIENTS = 5000
const MAX_ACTION_HREF_LENGTH = 600
const ACTIVE_SUBSCRIPTION_STATUSES = ['ACTIVE', 'LIMITED'] satisfies SubscriptionStatus[]
const DEFAULT_INACTIVE_DAYS = 45

const schema = z.object({
  title: z.string().trim().min(3).max(80),
  body: z.string().trim().min(5).max(1200),
  segment: z.enum(['ALL', 'ACTIVE', 'NO_ACTIVE', 'EXPIRED', 'NEVER_PURCHASED', 'INACTIVE_N_DAYS', 'INACTIVE_45D']),
  inactiveDays: z.coerce.number().int().min(1).max(3650).optional().nullable(),
  channels: z.array(z.enum(['IN_APP', 'EMAIL', 'TELEGRAM'])).min(1).max(3),
  actionHref: z.string().trim().max(MAX_ACTION_HREF_LENGTH).optional().nullable(),
  actionLabel: z.string().trim().max(32).optional().nullable(),
  actionOpenInTelegram: z.boolean().optional(),
  imageUrl: z.string().trim().url().max(600).optional().nullable().or(z.literal('')),
  testMode: z.boolean().optional(),
})

export const POST = withAuth(async (req: Request) => {
  const session = await requireAdmin()
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Проверьте заголовок, текст, сегмент и каналы' }, { status: 400 })
  }

  const input = parsed.data
  const segment = normalizeSegment(input.segment)
  const inactiveDays = segment === 'INACTIVE_N_DAYS' ? input.inactiveDays ?? DEFAULT_INACTIVE_DAYS : null
  const channels = new Set(input.channels)
  const limit = await rateLimit(
    req,
    input.testMode ? `broadcast-test:${session.uid}` : `broadcast:${session.uid}`,
    input.testMode ? 20 : 3,
    input.testMode ? 60_000 : 5 * 60_000
  )
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Слишком много отправок. Подождите и попробуйте снова.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    )
  }

  const users = input.testMode
    ? await prisma.user.findMany({
        where: { id: session.uid },
        select: broadcastUserSelect,
        take: 1,
      })
    : await findBroadcastUsers(segment, inactiveDays ?? DEFAULT_INACTIVE_DAYS, input.channels)

  const actionHref = normalizeActionHref(input.actionHref)
  const actionUrl = actionHref ? `${getAppUrl()}${actionHref}` : getAppUrl()
  const actionLabel = input.actionLabel || (actionHref ? 'Открыть кабинет' : undefined)
  const actionOpenInTelegram = Boolean(input.actionOpenInTelegram && actionHref)
  const imageUrl = normalizeImageUrl(input.imageUrl)
  const plainBody = stripTelegramCustomEmojiMarkup(input.body)
  const batchKey = `broadcast:${Date.now()}:${session.uid}`
  const stats = emptyBroadcastStats()

  if (input.testMode) {
    for (const user of users) {
      const payload = buildBroadcastPayload({
        user,
        batchKey,
        title: input.title,
        body: input.body,
        actionHref,
        actionLabel,
        actionOpenInTelegram,
        imageUrl,
        channels,
        actionUrl,
      })

      const result = await notifyUser({
        userId: payload.userId,
        type: 'BROADCAST',
        dedupeKey: payload.dedupeKey,
        title: payload.title,
        body: payload.body,
        actionHref: payload.actionHref ?? undefined,
        actionLabel: payload.actionLabel ?? undefined,
        inApp: payload.inApp,
        telegramText: payload.telegramText ?? undefined,
        telegramImageUrl: payload.telegramImageUrl ?? undefined,
        telegramActionUrl: payload.telegramActionUrl ?? undefined,
        telegramActionLabel: payload.telegramActionLabel ?? undefined,
        telegramActionOpenInTelegram: payload.telegramActionOpenInTelegram,
        emailSubject: payload.emailSubject ?? undefined,
        emailText: payload.emailText ?? undefined,
        emailHtml: payload.emailHtml ?? undefined,
      })

      stats.telegram[result.telegram] += 1
      stats.email[result.email] += 1
      if (payload.inApp) stats.inApp += 1
      if (payload.inApp || result.telegram === 'sent' || result.email === 'sent') {
        stats.recipients += 1
      }
    }

    return NextResponse.json({
      ok: true,
      stats,
      limited: false,
      testMode: true,
    })
  }

  const campaign = await prisma.broadcastCampaign.create({
    data: {
      title: input.title,
      body: plainBody,
      segment,
      inactiveDays,
      channels: input.channels,
      actionHref,
      actionLabel,
      actionOpenInTelegram,
      imageUrl,
      recipients: users.length,
      limited: users.length === MAX_RECIPIENTS,
      createdById: session.uid,
    },
    select: {
      id: true,
      title: true,
      body: true,
      segment: true,
      inactiveDays: true,
      channels: true,
      actionHref: true,
      actionLabel: true,
      actionOpenInTelegram: true,
      imageUrl: true,
      recipients: true,
      inAppCount: true,
      telegramSent: true,
      telegramSkipped: true,
      telegramDuplicate: true,
      telegramFailed: true,
      emailSent: true,
      emailSkipped: true,
      emailDuplicate: true,
      emailFailed: true,
      limited: true,
      createdAt: true,
      createdBy: { select: { email: true, name: true } },
    },
  })

  const deliveries = users.map((user) => {
    const payload = buildBroadcastPayload({
      user,
      batchKey,
      title: input.title,
      body: input.body,
      actionHref,
      actionLabel,
      actionOpenInTelegram,
      imageUrl,
      channels,
      actionUrl,
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

  await createAdminNotification({
    type: 'broadcast',
    severity: 'INFO',
    dedupeKey: `admin:${batchKey}`,
    title: 'Рассылка поставлена в очередь',
    body: `${input.title}: получателей ${users.length}.`,
    actionHref: '/dashboard/admin/broadcasts',
    actionLabel: 'Открыть рассылки',
  })

  return NextResponse.json({
    ok: true,
    stats: {
      ...emptyBroadcastStats(),
      recipients: users.length,
    },
    limited: users.length === MAX_RECIPIENTS,
    queued: true,
    campaign: {
      ...campaign,
      createdAt: campaign.createdAt.toISOString(),
      createdBy: campaign.createdBy ? campaign.createdBy.name || campaign.createdBy.email : null,
    },
  })
})

function emptyBroadcastStats() {
  return {
    recipients: 0,
    inApp: 0,
    telegram: { sent: 0, skipped: 0, duplicate: 0, failed: 0 },
    email: { sent: 0, skipped: 0, duplicate: 0, failed: 0 },
  }
}

const broadcastUserSelect = {
  id: true,
  email: true,
  name: true,
  referralCode: true,
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

type BroadcastSegment = 'ALL' | 'ACTIVE' | 'NO_ACTIVE' | 'EXPIRED' | 'NEVER_PURCHASED' | 'INACTIVE_N_DAYS'
type BroadcastChannel = 'IN_APP' | 'EMAIL' | 'TELEGRAM'

interface RemnashopAudienceRow {
  id: number
  telegram_id: string | null
  email: string | null
}

async function findBroadcastUsers(segment: BroadcastSegment, inactiveDays: number, channels: BroadcastChannel[]) {
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

function normalizeSegment(value: z.infer<typeof schema>['segment']): BroadcastSegment {
  if (value === 'INACTIVE_45D') return 'INACTIVE_N_DAYS'
  return value
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
  if (channels.includes('IN_APP')) return {}

  const or: Prisma.UserWhereInput[] = []
  if (channels.includes('TELEGRAM')) {
    or.push({ telegramId: { not: null } })
  }
  if (channels.includes('EMAIL')) {
    or.push({
      emailVerifiedAt: { not: null },
      NOT: [
        { email: { endsWith: '@pending.invalid' } },
        { email: { endsWith: '@pending.invalid.local' } },
      ],
    })
  }

  return or.length > 0 ? { OR: or } : {}
}

function combineWhere(...items: Prisma.UserWhereInput[]): Prisma.UserWhereInput {
  const activeItems = items.filter((item) => Object.keys(item).length > 0)
  if (activeItems.length === 0) return {}
  if (activeItems.length === 1) return activeItems[0]
  return { AND: activeItems }
}

function normalizeActionHref(value: string | null | undefined) {
  let href = value?.trim()
  if (!href) return null
  if (href.startsWith('http://') || href.startsWith('https://')) {
    try {
      const url = new URL(href)
      if (url.origin !== getAppUrl()) return null
      href = `${url.pathname}${url.search}${url.hash}`
    } catch {
      return null
    }
  }
  if (!href.startsWith('/dashboard')) return null
  return href
}

function normalizeImageUrl(value: string | null | undefined) {
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

function buildBroadcastPayload({
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

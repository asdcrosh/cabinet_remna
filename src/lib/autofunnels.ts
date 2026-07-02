import type { AutoFunnelSetting, Prisma } from '@prisma/client'
import { getAppUrl } from './app-url'
import { grantEngagementBonusBoxAttempts } from './engagement-rewards'
import { notifyUser } from './notifications'
import { prisma } from './prisma'
import { remnashopQuery } from './remnashop-db'
import { logWarn } from './logger'

type AutoFunnelSeed = Pick<
  AutoFunnelSetting,
  'key' | 'enabled' | 'title' | 'segment' | 'triggerDays' | 'cooldownDays' | 'channels' | 'messageTitle' | 'messageBody' | 'actionHref' | 'actionLabel' | 'actionOpenInTelegram' | 'bonusAttempts' | 'maxRecipientsPerRun'
>

export const DEFAULT_AUTOFUNNELS: AutoFunnelSeed[] = [
  {
    key: 'NEW_NO_PURCHASE',
    enabled: false,
    title: 'Новый без покупки',
    segment: 'NEW_NO_PURCHASE',
    triggerDays: 1,
    cooldownDays: 7,
    channels: ['IN_APP', 'TELEGRAM'],
    messageTitle: 'Подарок на первый VPN',
    messageBody: 'Вы зарегистрировались, но ещё не брали подписку. В кабинете ждёт стартовый оффер.',
    actionHref: '/dashboard/plans',
    actionLabel: 'Выбрать тариф',
    actionOpenInTelegram: true,
    bonusAttempts: 1,
    maxRecipientsPerRun: 500,
  },
  {
    key: 'SUBSCRIPTION_EXPIRING',
    enabled: false,
    title: 'Подписка скоро закончится',
    segment: 'SUBSCRIPTION_EXPIRING',
    triggerDays: 3,
    cooldownDays: 3,
    channels: ['IN_APP', 'TELEGRAM'],
    messageTitle: 'Подписка скоро закончится',
    messageBody: 'Продлите заранее, чтобы доступ не прерывался, и заберите бонус.',
    actionHref: '/dashboard/plans?bundle=ACTIVE_DOUBLE_REWARD',
    actionLabel: 'Продлить',
    actionOpenInTelegram: true,
    bonusAttempts: 0,
    maxRecipientsPerRun: 500,
  },
  {
    key: 'INACTIVE_N_DAYS',
    enabled: false,
    title: 'Давно не покупал',
    segment: 'INACTIVE_N_DAYS',
    triggerDays: 45,
    cooldownDays: 14,
    channels: ['IN_APP', 'TELEGRAM'],
    messageTitle: 'Можно вернуться выгоднее',
    messageBody: 'Подписка давно закончилась. Для возвращения доступен comeback-оффер.',
    actionHref: '/dashboard/plans?bundle=COMEBACK_TODAY',
    actionLabel: 'Вернуться',
    actionOpenInTelegram: true,
    bonusAttempts: 0,
    maxRecipientsPerRun: 500,
  },
  {
    key: 'ACTIVE_USER',
    enabled: false,
    title: 'Активный пользователь',
    segment: 'ACTIVE_USER',
    triggerDays: 14,
    cooldownDays: 14,
    channels: ['IN_APP', 'TELEGRAM'],
    messageTitle: 'Усиленный бонус за продление',
    messageBody: 'У вас активная подписка. Продлите заранее и получите больше открытий bonus box.',
    actionHref: '/dashboard/plans?bundle=ACTIVE_DOUBLE_REWARD',
    actionLabel: 'Забрать x2',
    actionOpenInTelegram: true,
    bonusAttempts: 0,
    maxRecipientsPerRun: 500,
  },
]

type AutoFunnelChannel = 'IN_APP' | 'TELEGRAM' | 'EMAIL'
type RemnashopAudienceRow = { id: number; telegram_id: string | null; email: string | null }

export async function ensureAutoFunnelSettings() {
  await Promise.all(
    DEFAULT_AUTOFUNNELS.map((funnel) =>
      prisma.autoFunnelSetting.upsert({
        where: { key: funnel.key },
        create: funnel,
        update: {
          title: funnel.title,
          segment: funnel.segment,
          messageTitle: funnel.messageTitle,
          messageBody: funnel.messageBody,
          actionHref: funnel.actionHref,
          actionLabel: funnel.actionLabel,
        },
      })
    )
  )
}

export async function getAutoFunnelSettings() {
  await ensureAutoFunnelSettings()
  return prisma.autoFunnelSetting.findMany({
    orderBy: [{ createdAt: 'asc' }],
    include: { promoCode: { select: { id: true, code: true, discountPercent: true, isActive: true } } },
  })
}

export async function previewAutoFunnel(funnelId: string) {
  const funnel = await prisma.autoFunnelSetting.findUnique({ where: { id: funnelId } })
  if (!funnel) throw new AutoFunnelError('Автоворонка не найдена', 404, 'FUNNEL_NOT_FOUND')
  const users = await findAutoFunnelUsers(funnel, true)
  return { recipients: users.length, samples: users.slice(0, 10).map((user) => ({ id: user.id, email: user.email, name: user.name })) }
}

export async function runAutoFunnels() {
  await ensureAutoFunnelSettings()
  const funnels = await prisma.autoFunnelSetting.findMany({
    where: { enabled: true },
    include: { promoCode: { select: { code: true, discountPercent: true, isActive: true } } },
  })
  const totals = { funnels: funnels.length, sent: 0, skipped: 0, giftsGranted: 0 }

  for (const funnel of funnels) {
    const users = await findAutoFunnelUsers(funnel, false)
    for (const user of users) {
      const delivery = await prisma.autoFunnelDelivery.create({
        data: { funnelId: funnel.id, userId: user.id },
      })

      let giftsGranted = 0
      if (funnel.bonusAttempts > 0) {
        const gift = await grantEngagementBonusBoxAttempts({
          userId: user.id,
          source: 'AUTOFUNNEL',
          sourceKeyPrefix: `${funnel.key}:${delivery.id}`,
          attemptsCount: funnel.bonusAttempts,
        })
        giftsGranted = gift.granted
      }

      await notifyUser({
        userId: user.id,
        type: 'AUTOFUNNEL',
        dedupeKey: `autofunnel:${funnel.key}:${delivery.id}`,
        title: funnel.messageTitle,
        body: funnel.messageBody,
        actionHref: funnel.actionHref,
        actionLabel: funnel.actionLabel,
        inApp: funnel.channels.includes('IN_APP'),
        telegramText: funnel.channels.includes('TELEGRAM')
          ? [`<b>${escapeTelegram(funnel.messageTitle)}</b>`, escapeTelegram(funnel.messageBody)].join('\n')
          : undefined,
        telegramActionUrl: funnel.channels.includes('TELEGRAM') ? `${getAppUrl()}${funnel.actionHref}` : undefined,
        telegramActionLabel: funnel.channels.includes('TELEGRAM') ? funnel.actionLabel : undefined,
        telegramActionOpenInTelegram: funnel.channels.includes('TELEGRAM') ? funnel.actionOpenInTelegram : undefined,
        emailSubject: funnel.channels.includes('EMAIL') ? `${funnel.messageTitle}` : undefined,
        emailText: funnel.channels.includes('EMAIL') ? `${funnel.messageBody}\n\n${getAppUrl()}${funnel.actionHref}` : undefined,
      })

      await prisma.autoFunnelDelivery.update({
        where: { id: delivery.id },
        data: { giftGranted: giftsGranted > 0 },
      })

      totals.sent += 1
      totals.giftsGranted += giftsGranted
    }
  }

  return totals
}

export async function updateAutoFunnelSetting(id: string, input: {
  enabled: boolean
  triggerDays: number
  cooldownDays: number
  channels: AutoFunnelChannel[]
  messageTitle: string
  messageBody: string
  actionHref: string
  actionLabel: string
  actionOpenInTelegram: boolean
  bonusAttempts: number
  promoCodeId?: string | null
  maxRecipientsPerRun: number
}) {
  return prisma.autoFunnelSetting.update({
    where: { id },
    data: {
      enabled: input.enabled,
      triggerDays: Math.max(1, input.triggerDays),
      cooldownDays: Math.max(1, input.cooldownDays),
      channels: input.channels,
      messageTitle: input.messageTitle.trim(),
      messageBody: input.messageBody.trim(),
      actionHref: normalizeActionHref(input.actionHref),
      actionLabel: input.actionLabel.trim() || 'Открыть',
      actionOpenInTelegram: input.actionOpenInTelegram,
      bonusAttempts: Math.max(0, Math.min(50, input.bonusAttempts)),
      promoCodeId: input.promoCodeId || null,
      maxRecipientsPerRun: Math.max(1, Math.min(5000, input.maxRecipientsPerRun)),
    },
  })
}

async function findAutoFunnelUsers(funnel: AutoFunnelSetting, preview: boolean) {
  const now = new Date()
  const cooldownCutoff = new Date(now.getTime() - funnel.cooldownDays * 24 * 60 * 60 * 1000)
  const where = combineWhere(
    await buildAutoFunnelSegmentWhere(funnel, now),
    {
      autoFunnelDeliveries: {
        none: {
          funnelId: funnel.id,
          sentAt: { gt: cooldownCutoff },
        },
      },
    }
  )

  return prisma.user.findMany({
    where,
    select: { id: true, email: true, name: true },
    orderBy: { createdAt: 'desc' },
    take: preview ? Math.min(50, funnel.maxRecipientsPerRun) : funnel.maxRecipientsPerRun,
  })
}

async function buildAutoFunnelSegmentWhere(funnel: AutoFunnelSetting, now: Date): Promise<Prisma.UserWhereInput> {
  const triggerCutoff = new Date(now.getTime() - funnel.triggerDays * 24 * 60 * 60 * 1000)
  const expiringTo = new Date(now.getTime() + funnel.triggerDays * 24 * 60 * 60 * 1000)

  if (funnel.segment === 'NEW_NO_PURCHASE') {
    const localWhere: Prisma.UserWhereInput = {
      createdAt: { lte: triggerCutoff },
      payments: { none: { status: 'SUCCEEDED' } },
      subscriptions: { none: {} },
      OR: [{ telegramId: { not: null } }, { emailVerifiedAt: { not: null } }],
    }
    const rows = await fetchRemnashopNeverPurchased(funnel.maxRecipientsPerRun)
    return rows ? combineWhere(localWhere, { OR: [remnashopRowsToUserWhere(rows), { remnashopUserId: null }] }) : localWhere
  }
  if (funnel.segment === 'SUBSCRIPTION_EXPIRING') {
    return {
      subscriptions: {
        some: { status: { in: ['ACTIVE', 'LIMITED'] }, expireAt: { gt: now, lte: expiringTo } },
      },
    }
  }
  if (funnel.segment === 'INACTIVE_N_DAYS') {
    const localWhere: Prisma.UserWhereInput = {
      subscriptions: {
        some: { expireAt: { lt: triggerCutoff } },
        none: { status: { in: ['ACTIVE', 'LIMITED'] }, expireAt: { gt: now } },
      },
    }
    const rows = await fetchRemnashopInactiveBuyers(funnel.triggerDays, funnel.maxRecipientsPerRun)
    return rows
      ? {
          AND: [
            { subscriptions: { none: { status: { in: ['ACTIVE', 'LIMITED'] }, expireAt: { gt: now } } } },
            { OR: [remnashopRowsToUserWhere(rows), { AND: [{ remnashopUserId: null }, localWhere] }] },
          ],
        }
      : localWhere
  }
  if (funnel.segment === 'ACTIVE_USER') {
    return {
      subscriptions: {
        some: { status: { in: ['ACTIVE', 'LIMITED'] }, expireAt: { gt: expiringTo } },
      },
    }
  }
  return {}
}

async function fetchRemnashopInactiveBuyers(inactiveDays: number, limit: number) {
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
        LIMIT ${Math.max(1, Math.min(10_000, limit * 2))}
      `,
      [inactiveDays]
    )
    return result.rows
  } catch (error) {
    logWarn('autofunnels.remnashop_inactive_segment_failed', {
      inactiveDays,
      message: error instanceof Error ? error.message : 'unknown error',
    })
    return null
  }
}

async function fetchRemnashopNeverPurchased(limit: number) {
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
        LIMIT ${Math.max(1, Math.min(10_000, limit * 2))}
      `
    )
    return result.rows
  } catch (error) {
    logWarn('autofunnels.remnashop_never_purchased_segment_failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    })
    return null
  }
}

function remnashopRowsToUserWhere(rows: RemnashopAudienceRow[]): Prisma.UserWhereInput {
  if (rows.length === 0) return { id: { in: [] } }
  const remnashopIds = rows.map((row) => row.id)
  const telegramIds = rows
    .map((row) => row.telegram_id)
    .filter((value): value is string => Boolean(value))
    .map((value) => BigInt(value))
  const emails = rows
    .map((row) => row.email?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value))

  const or: Prisma.UserWhereInput[] = []
  if (remnashopIds.length > 0) or.push({ remnashopUserId: { in: remnashopIds } })
  if (telegramIds.length > 0) or.push({ telegramId: { in: telegramIds } })
  if (emails.length > 0) or.push({ email: { in: emails } })
  return { OR: or }
}

function combineWhere(...items: Prisma.UserWhereInput[]) {
  const filtered = items.filter((item) => Object.keys(item).length > 0)
  if (filtered.length === 0) return {}
  if (filtered.length === 1) return filtered[0]
  return { AND: filtered }
}

function normalizeActionHref(value: string) {
  const trimmed = value.trim() || '/dashboard'
  if (!trimmed.startsWith('/dashboard')) return '/dashboard'
  return trimmed.slice(0, 600)
}

function escapeTelegram(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export class AutoFunnelError extends Error {
  constructor(message: string, public status = 400, public code = 'AUTOFUNNEL_ERROR') {
    super(message)
  }
}

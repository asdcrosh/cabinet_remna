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
import { escapeTelegramHtml, renderTelegramCustomEmoji, stripTelegramCustomEmojiMarkup } from '@/lib/telegram-format'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_RECIPIENTS = 5000
const ACTIVE_SUBSCRIPTION_STATUSES = ['ACTIVE', 'LIMITED'] satisfies SubscriptionStatus[]

const schema = z.object({
  title: z.string().trim().min(3).max(80),
  body: z.string().trim().min(5).max(1200),
  segment: z.enum(['ALL', 'ACTIVE', 'NO_ACTIVE', 'EXPIRED', 'EMAIL_VERIFIED', 'TELEGRAM_LINKED', 'INACTIVE_45D']),
  channels: z.array(z.enum(['IN_APP', 'EMAIL', 'TELEGRAM'])).min(1).max(3),
  actionHref: z.string().trim().max(180).optional().nullable(),
  actionLabel: z.string().trim().max(32).optional().nullable(),
  imageUrl: z.string().trim().url().max(600).optional().nullable().or(z.literal('')),
})

export const POST = withAuth(async (req: Request) => {
  const session = await requireAdmin()
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Проверьте заголовок, текст, сегмент и каналы' }, { status: 400 })
  }

  const input = parsed.data
  const users = await prisma.user.findMany({
    where: buildSegmentWhere(input.segment),
    select: {
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
    },
    orderBy: { createdAt: 'desc' },
    take: MAX_RECIPIENTS,
  })

  const actionHref = normalizeActionHref(input.actionHref)
  const actionUrl = actionHref ? `${getAppUrl()}${actionHref}` : getAppUrl()
  const actionLabel = input.actionLabel || (actionHref ? 'Открыть кабинет' : undefined)
  const imageUrl = normalizeImageUrl(input.imageUrl)
  const plainBody = stripTelegramCustomEmojiMarkup(input.body)
  const batchKey = `broadcast:${Date.now()}:${session.uid}`
  const channels = new Set(input.channels)
  const stats = {
    recipients: users.length,
    inApp: channels.has('IN_APP') ? users.length : 0,
    telegram: { sent: 0, skipped: 0, duplicate: 0, failed: 0 },
    email: { sent: 0, skipped: 0, duplicate: 0, failed: 0 },
  }

  for (const user of users) {
    const variables = buildTemplateVariables(user)
    const personalizedTitle = applyTemplateVariables(input.title, variables)
    const personalizedBody = applyTemplateVariables(input.body, variables)
    const personalizedPlainBody = stripTelegramCustomEmojiMarkup(personalizedBody)
    const personalizedActionLabel = actionLabel ? applyTemplateVariables(actionLabel, variables) : undefined

    const result = await notifyUser({
      userId: user.id,
      type: 'BROADCAST',
      dedupeKey: `${batchKey}:${user.id}`,
      title: personalizedTitle,
      body: personalizedPlainBody,
      actionHref: actionHref ?? undefined,
      actionLabel: personalizedActionLabel,
      inApp: channels.has('IN_APP'),
      telegramText: channels.has('TELEGRAM')
        ? [`<b>${escapeTelegramHtml(personalizedTitle)}</b>`, renderTelegramCustomEmoji(personalizedBody)]
            .filter(Boolean)
            .join('\n')
        : undefined,
      telegramImageUrl: channels.has('TELEGRAM') ? imageUrl ?? undefined : undefined,
      telegramActionUrl: channels.has('TELEGRAM') && actionHref ? actionUrl : undefined,
      telegramActionLabel: channels.has('TELEGRAM') && actionHref ? personalizedActionLabel || 'Открыть' : undefined,
      emailSubject: channels.has('EMAIL') ? `${personalizedTitle} — ${getBrandName()}` : undefined,
      emailText: channels.has('EMAIL') ? `${personalizedPlainBody}${actionHref ? `\n\n${actionUrl}` : ''}` : undefined,
      emailHtml: channels.has('EMAIL')
        ? renderActionEmail({
            eyebrow: 'Сообщение',
            title: personalizedTitle,
            lead: personalizedPlainBody,
            body: personalizedPlainBody,
            ctaLabel: personalizedActionLabel || 'Открыть кабинет',
            ctaUrl: actionUrl,
            imageUrl,
            expiry: 'Это сообщение отправлено администратором сервиса.',
            securityNote: 'Если сообщение неактуально, просто игнорируйте его.',
          })
        : undefined,
    })

    stats.telegram[result.telegram] += 1
    stats.email[result.email] += 1
  }

  const campaign = await prisma.broadcastCampaign.create({
    data: {
      title: input.title,
      body: plainBody,
      segment: input.segment,
      channels: input.channels,
      actionHref,
      actionLabel,
      imageUrl,
      recipients: stats.recipients,
      inAppCount: stats.inApp,
      telegramSent: stats.telegram.sent,
      telegramSkipped: stats.telegram.skipped,
      telegramDuplicate: stats.telegram.duplicate,
      telegramFailed: stats.telegram.failed,
      emailSent: stats.email.sent,
      emailSkipped: stats.email.skipped,
      emailDuplicate: stats.email.duplicate,
      emailFailed: stats.email.failed,
      limited: users.length === MAX_RECIPIENTS,
      createdById: session.uid,
    },
    select: {
      id: true,
      title: true,
      segment: true,
      channels: true,
      recipients: true,
      inAppCount: true,
      telegramSent: true,
      telegramFailed: true,
      emailSent: true,
      emailFailed: true,
      limited: true,
      createdAt: true,
      createdBy: { select: { email: true, name: true } },
    },
  })

  await createAdminNotification({
    type: 'broadcast',
    severity: 'INFO',
    dedupeKey: `admin:${batchKey}`,
    title: 'Рассылка отправлена',
    body: `${input.title}: получателей ${users.length}.`,
    actionHref: '/dashboard/admin/broadcasts',
    actionLabel: 'Открыть рассылки',
  })

  return NextResponse.json({
    ok: true,
    stats,
    limited: users.length === MAX_RECIPIENTS,
    campaign: {
      ...campaign,
      createdAt: campaign.createdAt.toISOString(),
      createdBy: campaign.createdBy ? campaign.createdBy.name || campaign.createdBy.email : null,
    },
  })
})

function buildSegmentWhere(segment: z.infer<typeof schema>['segment']): Prisma.UserWhereInput {
  const now = new Date()
  const inactiveCutoff = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000)

  switch (segment) {
    case 'ACTIVE':
      return { subscriptions: { some: { status: { in: ACTIVE_SUBSCRIPTION_STATUSES }, expireAt: { gt: now } } } }
    case 'NO_ACTIVE':
      return { subscriptions: { none: { status: { in: ACTIVE_SUBSCRIPTION_STATUSES }, expireAt: { gt: now } } } }
    case 'EXPIRED':
      return {
        subscriptions: {
          some: { expireAt: { lte: now } },
          none: { status: { in: ACTIVE_SUBSCRIPTION_STATUSES }, expireAt: { gt: now } },
        },
      }
    case 'EMAIL_VERIFIED':
      return { emailVerifiedAt: { not: null }, NOT: [{ email: { endsWith: '@pending.invalid' } }, { email: { endsWith: '@pending.invalid.local' } }] }
    case 'TELEGRAM_LINKED':
      return { telegramId: { not: null } }
    case 'INACTIVE_45D':
      return {
        payments: {
          none: {
            status: 'SUCCEEDED',
            OR: [{ paidAt: { gte: inactiveCutoff } }, { createdAt: { gte: inactiveCutoff } }],
          },
        },
      }
    case 'ALL':
    default:
      return {}
  }
}

function normalizeActionHref(value: string | null | undefined) {
  const href = value?.trim()
  if (!href) return null
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

function buildTemplateVariables(user: {
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

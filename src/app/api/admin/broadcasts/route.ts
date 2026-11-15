import { jsonResponse } from '@/lib/json-response'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'
import { notifyUser } from '@/lib/notifications'
import { getAppUrl } from '@/lib/app-url'
import { createAdminNotification } from '@/lib/admin-notifications'
import { rateLimit } from '@/lib/rate-limit'
import { getBroadcastActionUrl, normalizeBroadcastActionHref } from '@/lib/broadcast-action-url'
import { buildBroadcastAudiencePreview } from '@/lib/broadcast-audience'
import { writeAuditLog } from '@/lib/audit-log'
import { isFeatureEnabled } from '@/lib/feature-flags'
import {
  buildBroadcastPayload,
  broadcastUserSelect,
  createBroadcastCampaign,
  DEFAULT_INACTIVE_DAYS,
  findBroadcastUsers,
  MAX_RECIPIENTS,
  normalizeBroadcastImageUrl,
  normalizeBroadcastSegment,
} from '@/lib/broadcast-campaign'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_ACTION_HREF_LENGTH = 600

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
  previewMode: z.boolean().optional(),
})

const broadcastCampaignSelect = {
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
  telegramUnknown: true,
  emailSent: true,
  emailSkipped: true,
  emailDuplicate: true,
  emailFailed: true,
  emailUnknown: true,
  limited: true,
  createdAt: true,
  createdBy: { select: { email: true, name: true } },
} satisfies Prisma.BroadcastCampaignSelect

type BroadcastCampaignListItem = Prisma.BroadcastCampaignGetPayload<{ select: typeof broadcastCampaignSelect }>

export const GET = withAuth(async (req: Request) => {
  if (!await isFeatureEnabled('broadcasts')) return jsonResponse({ error: 'Not found' }, { status: 404 })
  await requireAdmin()
  const url = new URL(req.url)
  const skip = Math.max(0, Number(url.searchParams.get('skip') || '0') || 0)
  const take = Math.min(50, Math.max(1, Number(url.searchParams.get('take') || '12') || 12))

  const [total, history] = await prisma.$transaction([
    prisma.broadcastCampaign.count(),
    prisma.broadcastCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: broadcastCampaignSelect,
    }),
  ])

  return jsonResponse({
    history: history.map(serializeBroadcastCampaign),
    total,
  })
})

export const POST = withAuth(async (req: Request) => {
  if (!await isFeatureEnabled('broadcasts')) return jsonResponse({ error: 'Not found' }, { status: 404 })
  const session = await requireAdmin()
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonResponse({ error: 'Проверьте заголовок, текст, сегмент и каналы' }, { status: 400 })
  }

  const input = parsed.data
  const segment = normalizeBroadcastSegment(input.segment)
  const inactiveDays = segment === 'INACTIVE_N_DAYS' ? input.inactiveDays ?? DEFAULT_INACTIVE_DAYS : null
  const channels = new Set(input.channels)
  const limit = await rateLimit(
    req,
    input.previewMode ? `broadcast-preview:${session.uid}` : input.testMode ? `broadcast-test:${session.uid}` : `broadcast:${session.uid}`,
    input.previewMode ? 30 : input.testMode ? 20 : 3,
    input.previewMode || input.testMode ? 60_000 : 5 * 60_000
  )
  if (!limit.ok) {
    return jsonResponse(
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

  if (input.previewMode) {
    return jsonResponse({
      preview: buildBroadcastAudiencePreview(users, channels),
      limited: users.length === MAX_RECIPIENTS,
    })
  }

  const appUrl = getAppUrl()
  const actionHref = normalizeBroadcastActionHref(input.actionHref, appUrl)
  if (input.actionHref && !actionHref) {
    return jsonResponse({ error: 'Ссылка должна вести на раздел кабинета или быть HTTPS-адресом' }, { status: 400 })
  }
  const actionUrl = getBroadcastActionUrl(actionHref, appUrl)
  const actionLabel = input.actionLabel || (actionHref ? 'Открыть кабинет' : undefined)
  const actionOpenInTelegram = Boolean(input.actionOpenInTelegram && actionHref)
  const imageUrl = normalizeBroadcastImageUrl(input.imageUrl)
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
        telegramBotButton: payload.telegramBotButton ?? undefined,
        emailSubject: payload.emailSubject ?? undefined,
        emailText: payload.emailText ?? undefined,
        emailHtml: payload.emailHtml ?? undefined,
      })

      stats.telegram[result.telegram === 'unknown' ? 'failed' : result.telegram] += 1
      stats.email[result.email === 'unknown' ? 'failed' : result.email] += 1
      if (payload.inApp) stats.inApp += 1
      if (payload.inApp || result.telegram === 'sent' || result.email === 'sent') {
        stats.recipients += 1
      }
    }

    return jsonResponse({
      ok: true,
      stats,
      limited: false,
      testMode: true,
    })
  }

  const queued = await createBroadcastCampaign({
    title: input.title,
    body: input.body,
    segment,
    inactiveDays,
    channels: input.channels,
    actionHref,
    actionLabel,
    actionOpenInTelegram: input.actionOpenInTelegram,
    imageUrl,
    createdById: session.uid,
  })

  const campaign = await prisma.broadcastCampaign.findUniqueOrThrow({
    where: { id: queued.campaignId },
    select: broadcastCampaignSelect,
  })

  await createAdminNotification({
    type: 'broadcast',
    severity: 'INFO',
    dedupeKey: `admin:${queued.batchKey}`,
    title: 'Рассылка поставлена в очередь',
    body: `${input.title}: получателей ${queued.recipients}.`,
    actionHref: '/dashboard/admin/broadcasts',
    actionLabel: 'Открыть рассылки',
  })
  await writeAuditLog({
    actorId: session.uid,
    action: 'ADMIN_BROADCAST_CREATED',
    message: 'Администратор поставил рассылку в очередь',
    metadata: {
      entityType: 'broadcastCampaign',
      campaignId: campaign.id,
      title: campaign.title,
      segment: campaign.segment,
      channels: campaign.channels,
      recipients: queued.recipients,
      limited: queued.limited,
    },
    request: req,
  })

  return jsonResponse({
    ok: true,
    stats: {
      ...emptyBroadcastStats(),
      recipients: queued.recipients,
    },
    limited: queued.limited,
    queued: true,
    campaign: serializeBroadcastCampaign(campaign),
  })
})

function serializeBroadcastCampaign(campaign: BroadcastCampaignListItem) {
  return {
    ...campaign,
    createdAt: campaign.createdAt.toISOString(),
    createdBy: campaign.createdBy ? campaign.createdBy.name || campaign.createdBy.email : null,
  }
}

function emptyBroadcastStats() {
  return {
    recipients: 0,
    inApp: 0,
    telegram: { sent: 0, skipped: 0, duplicate: 0, failed: 0 },
    email: { sent: 0, skipped: 0, duplicate: 0, failed: 0 },
  }
}

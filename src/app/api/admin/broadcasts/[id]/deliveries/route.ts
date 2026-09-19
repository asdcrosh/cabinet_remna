import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'
import { isFeatureEnabled } from '@/lib/feature-flags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DELIVERY_STATUSES = new Set(['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'UNKNOWN', 'CANCELED'])

export const GET = withAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  if (!await isFeatureEnabled('broadcasts')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  await requireAdmin()
  const { id } = await params
  const campaign = await prisma.broadcastCampaign.findUnique({ where: { id }, select: { id: true } })
  if (!campaign) return NextResponse.json({ error: 'Рассылка не найдена' }, { status: 404 })

  const url = new URL(request.url)
  const requestedStatus = url.searchParams.get('status')?.toUpperCase() ?? 'ALL'
  const status = DELIVERY_STATUSES.has(requestedStatus) ? requestedStatus : 'ALL'
  const skip = Math.max(0, Number(url.searchParams.get('skip') || '0') || 0)
  const take = Math.min(50, Math.max(1, Number(url.searchParams.get('take') || '20') || 20))
  const where = {
    campaignId: id,
    ...(status === 'ALL' ? {} : { status: status as Prisma.EnumBroadcastDeliveryStatusFilter['equals'] }),
  }

  const [total, deliveries] = await prisma.$transaction([
    prisma.broadcastDelivery.count({ where }),
    prisma.broadcastDelivery.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        status: true,
        attempts: true,
        lastError: true,
        sentAt: true,
        createdAt: true,
        payload: true,
        user: { select: { email: true, name: true } },
      },
    }),
  ])

  const payloads = deliveries.map((delivery) => parseDeliveryPayload(delivery.payload))
  const dedupeKeys = payloads.flatMap((payload) => payload?.dedupeKey ? [`BROADCAST:${payload.dedupeKey}`] : [])
  const [logs, inAppNotifications] = dedupeKeys.length > 0
    ? await Promise.all([
        prisma.notificationLog.findMany({
          where: { type: 'BROADCAST', dedupeKey: { in: dedupeKeys } },
          select: { dedupeKey: true, channel: true, status: true, error: true },
        }),
        prisma.userNotification.findMany({
          where: { type: 'BROADCAST', dedupeKey: { in: dedupeKeys } },
          select: { dedupeKey: true },
        }),
      ])
    : [[], []]
  const logMap = new Map(logs.map((log) => [`${log.dedupeKey}:${log.channel}`, log]))
  const inAppKeys = new Set(inAppNotifications.map((notification) => notification.dedupeKey))

  return NextResponse.json({
    total,
    deliveries: deliveries.map((delivery, index) => {
      const payload = payloads[index]
      const dedupeKey = payload?.dedupeKey ? `BROADCAST:${payload.dedupeKey}` : null
      return {
        id: delivery.id,
        status: delivery.status,
        attempts: delivery.attempts,
        lastError: delivery.lastError,
        sentAt: delivery.sentAt?.toISOString() ?? null,
        createdAt: delivery.createdAt.toISOString(),
        user: delivery.user,
        channels: {
          inApp: channelResult(payload?.inApp === true, dedupeKey ? inAppKeys.has(dedupeKey) : false),
          telegram: externalChannelResult(Boolean(payload?.telegramText), dedupeKey ? logMap.get(`${dedupeKey}:TELEGRAM`) : null),
          email: externalChannelResult(Boolean(payload?.emailText), dedupeKey ? logMap.get(`${dedupeKey}:EMAIL`) : null),
        },
      }
    }),
  })
})

function parseDeliveryPayload(value: Prisma.JsonValue) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const payload = value as Record<string, unknown>
  return {
    dedupeKey: typeof payload.dedupeKey === 'string' ? payload.dedupeKey : null,
    inApp: payload.inApp !== false,
    telegramText: typeof payload.telegramText === 'string' && payload.telegramText.length > 0,
    emailText: typeof payload.emailText === 'string' && payload.emailText.length > 0,
  }
}

function channelResult(selected: boolean, delivered: boolean) {
  if (!selected) return { status: 'NOT_SELECTED' as const, error: null }
  return { status: delivered ? 'SENT' as const : 'SKIPPED' as const, error: null }
}

function externalChannelResult(
  selected: boolean,
  log: { status: string; error: string | null } | null | undefined
) {
  if (!selected) return { status: 'NOT_SELECTED' as const, error: null }
  if (!log) return { status: 'SKIPPED' as const, error: null }
  return { status: log.status, error: log.error }
}

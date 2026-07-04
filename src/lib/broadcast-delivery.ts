import type { Prisma } from '@prisma/client'
import { notifyUser } from './notifications'
import { prisma } from './prisma'
import { logError, logInfo } from './logger'

export interface BroadcastDeliveryPayload {
  userId: string
  dedupeKey: string
  title: string
  body: string
  actionHref?: string | null
  actionLabel?: string | null
  inApp: boolean
  telegramText?: string | null
  telegramImageUrl?: string | null
  telegramActionUrl?: string | null
  telegramActionLabel?: string | null
  telegramActionOpenInTelegram?: boolean
  emailSubject?: string | null
  emailText?: string | null
  emailHtml?: string | null
}

type NotifyResult = Awaited<ReturnType<typeof notifyUser>>

export async function processBroadcastDeliveryBatch(options: {
  batchSize?: number
  maxAttempts?: number
  lockTimeoutMs?: number
} = {}) {
  const batchSize = normalizeInt(options.batchSize ?? Number(process.env.BROADCAST_WORKER_BATCH_SIZE ?? 50), 1, 250)
  const maxAttempts = normalizeInt(options.maxAttempts ?? Number(process.env.BROADCAST_WORKER_MAX_ATTEMPTS ?? 3), 1, 10)
  const lockTimeoutMs = normalizeInt(options.lockTimeoutMs ?? 10 * 60 * 1000, 60_000, 60 * 60 * 1000)
  const staleLockCutoff = new Date(Date.now() - lockTimeoutMs)

  const candidates = await prisma.broadcastDelivery.findMany({
    where: {
      attempts: { lt: maxAttempts },
      OR: [
        { status: 'PENDING' },
        { status: 'FAILED' },
        { status: 'PROCESSING', lockedAt: { lt: staleLockCutoff } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
  })

  let processed = 0
  let succeeded = 0
  let failed = 0

  for (const delivery of candidates) {
    const claimed = await prisma.broadcastDelivery.updateMany({
      where: {
        id: delivery.id,
        status: delivery.status,
        attempts: delivery.attempts,
      },
      data: {
        status: 'PROCESSING',
        attempts: { increment: 1 },
        lockedAt: new Date(),
      },
    })
    if (claimed.count !== 1) continue

    processed += 1
    try {
      const payload = parsePayload(delivery.payload)
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

      await prisma.$transaction([
        prisma.broadcastDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'SUCCEEDED',
            lastError: null,
            lockedAt: null,
            sentAt: new Date(),
          },
        }),
        prisma.broadcastCampaign.update({
          where: { id: delivery.campaignId },
          data: buildCampaignCounterUpdate(payload, result),
        }),
      ])
      succeeded += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : 'broadcast delivery failed'
      await prisma.broadcastDelivery.update({
        where: { id: delivery.id },
        data: {
          status: delivery.attempts + 1 >= maxAttempts ? 'FAILED' : 'PENDING',
          lastError: message,
          lockedAt: null,
        },
      })
      logError('broadcast.delivery_failed', error, { deliveryId: delivery.id, campaignId: delivery.campaignId })
      failed += 1
    }
  }

  logInfo('broadcast.delivery_batch_completed', { processed, succeeded, failed })
  return { processed, succeeded, failed }
}

function buildCampaignCounterUpdate(
  payload: BroadcastDeliveryPayload,
  result: NotifyResult
): Prisma.BroadcastCampaignUpdateInput {
  return {
    inAppCount: { increment: payload.inApp ? 1 : 0 },
    telegramSent: { increment: result.telegram === 'sent' ? 1 : 0 },
    telegramSkipped: { increment: result.telegram === 'skipped' ? 1 : 0 },
    telegramDuplicate: { increment: result.telegram === 'duplicate' ? 1 : 0 },
    telegramFailed: { increment: result.telegram === 'failed' ? 1 : 0 },
    emailSent: { increment: result.email === 'sent' ? 1 : 0 },
    emailSkipped: { increment: result.email === 'skipped' ? 1 : 0 },
    emailDuplicate: { increment: result.email === 'duplicate' ? 1 : 0 },
    emailFailed: { increment: result.email === 'failed' ? 1 : 0 },
  }
}

function parsePayload(value: Prisma.JsonValue): BroadcastDeliveryPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid broadcast payload')
  }
  const payload = value as Record<string, unknown>
  if (
    typeof payload.userId !== 'string' ||
    typeof payload.dedupeKey !== 'string' ||
    typeof payload.title !== 'string' ||
    typeof payload.body !== 'string'
  ) {
    throw new Error('Invalid broadcast payload')
  }

  return {
    userId: payload.userId,
    dedupeKey: payload.dedupeKey,
    title: payload.title,
    body: payload.body,
    actionHref: nullableString(payload.actionHref),
    actionLabel: nullableString(payload.actionLabel),
    inApp: payload.inApp !== false,
    telegramText: nullableString(payload.telegramText),
    telegramImageUrl: nullableString(payload.telegramImageUrl),
    telegramActionUrl: nullableString(payload.telegramActionUrl),
    telegramActionLabel: nullableString(payload.telegramActionLabel),
    telegramActionOpenInTelegram: payload.telegramActionOpenInTelegram === true,
    emailSubject: nullableString(payload.emailSubject),
    emailText: nullableString(payload.emailText),
    emailHtml: nullableString(payload.emailHtml),
  }
}

function nullableString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function normalizeInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(Math.floor(value), min), max)
}

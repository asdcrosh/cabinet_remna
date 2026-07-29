import type { SyncDirection } from '@prisma/client'
import { createAdminNotification } from './admin-notifications'
import { prisma } from './prisma'
import {
  deactivateCabinetPromoCodesInRemnashop,
  isRemnashopPromoLocalOnlyReason,
  isRemnashopPromoSyncUnavailableReason,
  syncCabinetPromoCodeToRemnashop,
} from './remnashop-promo-sync'
import { syncCabinetPaymentToRemnashop } from './remnashop-reverse-sync'
import { syncRemnashopCatalog, syncRemnashopPaymentsToCabinet } from './remnashop-sync'
import { syncRemnashopUserBySourceId } from './remnashop-users'
import { markSyncFailed, markSyncPending, markSyncSkipped, markSyncSucceeded } from './sync-events'

type RetryableSyncEvent = {
  direction: SyncDirection
  entityType: string
  entityId: string
  operation: string
}

export async function retryRemnashopSyncEvent(event: RetryableSyncEvent) {
  if (event.direction === 'CABINET_TO_REMNASHOP' && event.entityType === 'payment') {
    const result = await syncCabinetPaymentToRemnashop(event.entityId)
    if (!result.ok) {
      throw new Error('skipped' in result ? result.skipped : 'Payment sync did not complete')
    }
    return result
  }

  if (
    event.direction === 'CABINET_TO_REMNASHOP' &&
    event.entityType === 'promoCode' &&
    event.operation === 'deactivate'
  ) {
    const result = await deactivateCabinetPromoCodesInRemnashop([event.entityId])
    if (!result.ok) {
      if (isRemnashopPromoSyncUnavailableReason(result.skipped)) {
        await markPromoConfigurationSkipped(result.skipped)
        return result
      }
      throw new Error(result.skipped)
    }
    return result
  }

  if (event.direction === 'CABINET_TO_REMNASHOP' && event.entityType === 'promoCode') {
    const result = await syncCabinetPromoCodeToRemnashop(event.entityId)
    if (!result.ok && 'skipped' in result) {
      if (isRemnashopPromoSyncUnavailableReason(result.skipped)) {
        await markPromoConfigurationSkipped(result.skipped)
        return result
      }
      if (isRemnashopPromoLocalOnlyReason(result.skipped)) return result
      throw new Error(result.skipped)
    }
    if (!result.ok) {
      throw new Error('Promo code sync did not complete')
    }
    return result
  }

  if (event.direction === 'REMNASHOP_TO_CABINET' && event.entityType === 'user') {
    const sourceId = Number(event.entityId)
    const result = await syncRemnashopUserBySourceId(sourceId, {
      forceRemnawaveSubscriptions: true,
    })
    if (!result.found) throw new Error(result.reason)
    return result
  }

  if (event.direction === 'REMNASHOP_TO_CABINET' && event.entityType === 'payment') {
    const result = await syncRemnashopPaymentsToCabinet({ paymentId: event.entityId })
    if (result.total === 0) throw new Error('remnashop payment not found')
    if (result.failed > 0) throw new Error('remnashop payment sync failed')
    return result
  }

  if (event.direction === 'REMNASHOP_TO_CABINET' && event.entityType === 'catalog') {
    return syncRemnashopCatalog()
  }

  throw new Error(`Retry is not supported for ${event.direction}:${event.entityType}`)
}

async function markPromoConfigurationSkipped(reason: string) {
  await markSyncSkipped({
    direction: 'CABINET_TO_REMNASHOP',
    entityType: 'promoCodeConfig',
    entityId: 'remnashop',
    operation: 'check',
  }, reason)
}

export async function retryDueRemnashopSyncEvents(options: {
  batchSize?: number
  shouldStop?: () => boolean
  force?: boolean
} = {}) {
  if (!process.env.REMNASHOP_DATABASE_URL) return { attempted: 0, succeeded: 0, failed: 0 }

  const events = await prisma.syncEvent.findMany({
    where: {
      status: 'FAILED',
      ...(options.force
        ? {}
        : {
            OR: [
              { nextRetryAt: null },
              { nextRetryAt: { lte: new Date() } },
            ],
          }),
      AND: [{
        OR: [
          { direction: 'CABINET_TO_REMNASHOP', entityType: { in: ['payment', 'promoCode'] } },
          { direction: 'REMNASHOP_TO_CABINET', entityType: { in: ['user', 'payment', 'catalog'] } },
        ],
      }],
    },
    orderBy: [
      { nextRetryAt: 'asc' },
      { updatedAt: 'asc' },
    ],
    take: Math.max(1, Math.min(250, options.batchSize ?? 50)),
  })

  let succeeded = 0
  let failed = 0
  for (const event of events) {
    if (options.shouldStop?.()) break
    const input = {
      direction: event.direction,
      entityType: event.entityType,
      entityId: event.entityId,
      operation: event.operation,
    }
    await markSyncPending(input)
    try {
      await retryRemnashopSyncEvent(event)
      await markSyncSucceeded(input)
      succeeded += 1
    } catch (error) {
      await markSyncFailed(input, error)
      failed += 1
      if (event.attempts + 1 >= 3) {
        await notifyRepeatedFailure(event, error)
      }
    }
  }

  return { attempted: succeeded + failed, succeeded, failed }
}

async function notifyRepeatedFailure(
  event: RetryableSyncEvent & { attempts: number },
  error: unknown
) {
  const day = new Date().toISOString().slice(0, 10)
  const message = error instanceof Error ? error.message : 'Неизвестная ошибка'
  await createAdminNotification({
    type: 'remnashop_sync_error',
    severity: 'ERROR',
    dedupeKey: `remnashop-sync:${event.direction}:${event.entityType}:${event.entityId}:${day}`,
    title: 'Remnashop не синхронизируется',
    body: `${event.entityType} ${event.entityId}: ${message}`.slice(0, 500),
    entityType: event.entityType,
    entityId: event.entityId,
    actionHref: '/dashboard/admin/remnashop-sync',
    actionLabel: 'Открыть интеграцию',
  })
}

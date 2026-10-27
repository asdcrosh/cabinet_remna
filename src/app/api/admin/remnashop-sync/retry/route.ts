import { jsonResponse } from '@/lib/json-response'
import { prisma } from '@/lib/prisma'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import {
  claimRemnashopSyncEvent,
  remnashopRetrySkippedReason,
  retryDueRemnashopSyncEvents,
  retryRemnashopSyncEvent,
} from '@/lib/remnashop-retry'
import { markSyncFailed, markSyncSkipped, markSyncSucceeded } from '@/lib/sync-events'
import { writeAuditLog } from '@/lib/audit-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = withAuth(async (req: Request) => {
  const session = await requireAdmin()

  const body = (await req.json().catch(() => null)) as {
    id?: unknown
    allFailed?: unknown
  } | null
  if (body?.allFailed === true) {
    const result = await retryDueRemnashopSyncEvents({ batchSize: 250, force: true })
    await writeAuditLog({
      actorId: session.uid,
      action: 'PAYMENT_SYNCED',
      message: 'Администратор повторил ошибки синхронизации Remnashop',
      metadata: result,
      request: req,
    })
    return jsonResponse({ ok: result.failed === 0, result })
  }

  const id = typeof body?.id === 'string' ? body.id : null
  if (!id) return jsonResponse({ error: 'id is required' }, { status: 400 })

  const event = await prisma.syncEvent.findUnique({ where: { id } })
  if (!event) return jsonResponse({ error: 'Sync event not found' }, { status: 404 })

  if (!await claimRemnashopSyncEvent(event)) {
    return jsonResponse({ error: 'Sync event is already being retried' }, { status: 409 })
  }

  try {
    const result = await retryRemnashopSyncEvent(event)
    const input = {
      direction: event.direction,
      entityType: event.entityType,
      entityId: event.entityId,
      operation: event.operation,
    }
    const skipped = remnashopRetrySkippedReason(result)
    if (skipped) await markSyncSkipped(input, skipped)
    else await markSyncSucceeded(input)
    await writeAuditLog({
      actorId: session.uid,
      action: 'PAYMENT_SYNCED',
      message: 'Администратор повторил событие синхронизации',
      metadata: {
        syncEventId: event.id,
        direction: event.direction,
        entityType: event.entityType,
        entityId: event.entityId,
        operation: event.operation,
      },
      request: req,
    })
    return jsonResponse({ ok: true, result })
  } catch (error) {
    await markSyncFailed({
      direction: event.direction,
      entityType: event.entityType,
      entityId: event.entityId,
      operation: event.operation,
    }, error)
    const message = error instanceof Error ? error.message : 'sync retry failed'
    return jsonResponse({ error: message }, { status: 500 })
  }
})

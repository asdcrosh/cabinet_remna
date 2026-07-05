import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { syncCabinetPaymentToRemnashopBestEffort } from '@/lib/remnashop-reverse-sync'
import { syncCabinetPromoCodeToRemnashopBestEffort } from '@/lib/remnashop-promo-sync'
import { syncRemnashopUserToCabinet, syncRemnashopUsersToCabinet } from '@/lib/remnashop-users'
import { markSyncFailed, markSyncPending, markSyncSucceeded } from '@/lib/sync-events'
import { writeAuditLog } from '@/lib/audit-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = withAuth(async (req: Request) => {
  const session = await requireAdmin()

  const body = (await req.json().catch(() => null)) as { id?: unknown } | null
  const id = typeof body?.id === 'string' ? body.id : null
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const event = await prisma.syncEvent.findUnique({ where: { id } })
  if (!event) return NextResponse.json({ error: 'Sync event not found' }, { status: 404 })

  await markSyncPending({
    direction: event.direction,
    entityType: event.entityType,
    entityId: event.entityId,
    operation: event.operation,
  })

  try {
    const result = await retryEvent(event)
    await markSyncSucceeded({
      direction: event.direction,
      entityType: event.entityType,
      entityId: event.entityId,
      operation: event.operation,
    })
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
    return NextResponse.json({ ok: true, result })
  } catch (error) {
    await markSyncFailed({
      direction: event.direction,
      entityType: event.entityType,
      entityId: event.entityId,
      operation: event.operation,
    }, error)
    const message = error instanceof Error ? error.message : 'sync retry failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
})

async function retryEvent(event: {
  direction: 'CABINET_TO_REMNASHOP' | 'REMNASHOP_TO_CABINET'
  entityType: string
  entityId: string
}) {
  if (event.direction === 'CABINET_TO_REMNASHOP' && event.entityType === 'payment') {
    const result = await syncCabinetPaymentToRemnashopBestEffort(event.entityId)
    if (!result.ok) throw new Error('Payment sync did not complete')
    return result
  }

  if (event.direction === 'CABINET_TO_REMNASHOP' && event.entityType === 'promoCode') {
    const result = await syncCabinetPromoCodeToRemnashopBestEffort(event.entityId)
    if (!result.ok) throw new Error('Promo code sync did not complete')
    return result
  }

  if (event.direction === 'REMNASHOP_TO_CABINET' && event.entityType === 'user') {
    const remnashopUserId = Number(event.entityId)
    if (Number.isFinite(remnashopUserId)) {
      const localUser = await prisma.user.findUnique({
        where: { remnashopUserId },
        select: { id: true },
      })
      if (localUser) {
        return syncRemnashopUserToCabinet(localUser.id, { forceRemnawaveSubscriptions: true })
      }
    }
    return syncRemnashopUsersToCabinet({ forceRemnawaveSubscriptions: true })
  }

  throw new Error(`Retry is not supported for ${event.direction}:${event.entityType}`)
}

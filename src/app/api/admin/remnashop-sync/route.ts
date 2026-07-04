import { NextResponse } from 'next/server'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { getRemnashopSyncDryRun, syncRemnashopCatalog } from '@/lib/remnashop-sync'
import { syncRemnashopUsersToCabinet } from '@/lib/remnashop-users'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async (req: Request) => {
  await requireAdmin()

  try {
    return NextResponse.json(await withSyncEvents(await getRemnashopSyncDryRun()))
  } catch (e) {
    const message = e instanceof Error ? e.message : 'remnashop sync failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
})

export const POST = withAuth(async (req: Request) => {
  await requireAdmin()

  const body = (await req.json().catch(() => null)) as { promoCodes?: unknown } | null
  const includePromoCodes = body?.promoCodes !== false

  try {
    const catalog = await syncRemnashopCatalog({ includePromoCodes })
    const users = await syncRemnashopUsersToCabinet({ forceRemnawaveSubscriptions: true })
    const reportBase = {
      ...catalog,
      counts: {
        ...catalog.counts,
        usersCreated: users.created,
        usersUpdated: users.updated,
        usersSkipped: users.skipped,
        subscriptionsSynced: users.subscriptionsSynced,
        subscriptionsSkipped: users.subscriptionsSkipped,
        subscriptionsFailed: users.subscriptionsFailed,
      },
    }
    return NextResponse.json(await withSyncEvents(reportBase))
  } catch (e) {
    const message = e instanceof Error ? e.message : 'remnashop sync failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
})

async function withSyncEvents<T extends Record<string, unknown>>(reportBase: T) {
  const [events, statusCounts] = await Promise.all([
    prisma.syncEvent.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 40,
      select: {
        id: true,
        direction: true,
        entityType: true,
        entityId: true,
        operation: true,
        status: true,
        attempts: true,
        lastError: true,
        nextRetryAt: true,
        lastSyncedAt: true,
        updatedAt: true,
      },
    }),
    prisma.syncEvent.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
  ])

  return {
    ...reportBase,
    syncEvents: events.map((event) => ({
      ...event,
      nextRetryAt: event.nextRetryAt?.toISOString() ?? null,
      lastSyncedAt: event.lastSyncedAt?.toISOString() ?? null,
      updatedAt: event.updatedAt.toISOString(),
    })),
    syncStatusCounts: Object.fromEntries(statusCounts.map((item) => [item.status, item._count._all])),
  }
}

import { NextResponse } from 'next/server'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { getRemnashopSyncDryRun, syncRemnashopCatalog } from '@/lib/remnashop-sync'
import { syncRemnashopUsersToCabinet } from '@/lib/remnashop-users'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async (req: Request) => {
  await requireAdmin()

  const url = new URL(req.url)
  const apply = url.searchParams.get('apply') === '1' || url.searchParams.get('apply') === 'true'
  const includePromoCodes = url.searchParams.get('promoCodes') !== '0'

  try {
    const reportBase = apply
      ? await (async () => {
          const catalog = await syncRemnashopCatalog({ includePromoCodes })
          const users = await syncRemnashopUsersToCabinet({ forceRemnawaveSubscriptions: true })
          return {
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
        })()
      : await getRemnashopSyncDryRun()
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
    const report = {
      ...reportBase,
      syncEvents: events.map((event) => ({
        ...event,
        nextRetryAt: event.nextRetryAt?.toISOString() ?? null,
        lastSyncedAt: event.lastSyncedAt?.toISOString() ?? null,
        updatedAt: event.updatedAt.toISOString(),
      })),
      syncStatusCounts: Object.fromEntries(statusCounts.map((item) => [item.status, item._count._all])),
    }
    return NextResponse.json(report)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'remnashop sync failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
})

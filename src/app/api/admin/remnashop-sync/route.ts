import { NextResponse } from 'next/server'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { getRemnashopSyncDryRun, syncRemnashopCatalog } from '@/lib/remnashop-sync'
import { syncRemnashopUsersToCabinet } from '@/lib/remnashop-users'
import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit-log'
import { describeSyncError } from '@/lib/sync-error'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
  await requireAdmin()

  try {
    return NextResponse.json(await withSyncEvents(await getRemnashopSyncDryRun()))
  } catch (e) {
    const message = e instanceof Error ? e.message : 'remnashop sync failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
})

export const POST = withAuth(async (req: Request) => {
  const session = await requireAdmin()

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
    await writeAuditLog({
      actorId: session.uid,
      action: 'REMNASHOP_SYNC_RUN',
      message: 'Запущена ручная синхронизация Remnashop',
      metadata: {
        includePromoCodes,
        counts: reportBase.counts,
      },
      request: req,
    })
    return NextResponse.json(await withSyncEvents(reportBase))
  } catch (e) {
    const message = e instanceof Error ? e.message : 'remnashop sync failed'
    await writeAuditLog({
      actorId: session.uid,
      action: 'REMNASHOP_SYNC_RUN',
      message: 'Ручная синхронизация Remnashop завершилась ошибкой',
      metadata: {
        includePromoCodes,
        error: message.slice(0, 1000),
      },
      request: req,
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
})

async function withSyncEvents<T extends Record<string, unknown>>(reportBase: T) {
  const [events, statusCounts, issueEvents] = await Promise.all([
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
    prisma.syncEvent.findMany({
      where: { status: { in: ['FAILED', 'SKIPPED'] } },
      orderBy: { updatedAt: 'desc' },
      take: 300,
      select: {
        direction: true,
        entityType: true,
        operation: true,
        status: true,
        lastError: true,
        updatedAt: true,
      },
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
    syncIssueGroups: groupSyncIssues(issueEvents),
  }
}

function groupSyncIssues(events: Array<{
  direction: string
  entityType: string
  operation: string
  status: string
  lastError: string | null
  updatedAt: Date
}>) {
  const groups = new Map<string, {
    direction: string
    entityType: string
    operation: string
    status: string
    reason: string
    count: number
    lastSeenAt: string
  }>()

  for (const event of events) {
    const reason = normalizeIssueReason(event.lastError)
    const key = `${event.direction}:${event.entityType}:${event.operation}:${event.status}:${reason}`
    const existing = groups.get(key)
    if (existing) {
      existing.count += 1
      if (new Date(existing.lastSeenAt) < event.updatedAt) {
        existing.lastSeenAt = event.updatedAt.toISOString()
      }
      continue
    }

    groups.set(key, {
      direction: event.direction,
      entityType: event.entityType,
      operation: event.operation,
      status: event.status,
      reason,
      count: 1,
      lastSeenAt: event.updatedAt.toISOString(),
    })
  }

  return Array.from(groups.values()).sort((left, right) => right.count - left.count).slice(0, 12)
}

function normalizeIssueReason(reason: string | null) {
  const value = reason?.trim()
  if (!value) return 'Причина не записана'
  if (value.includes('internal_squads')) return 'В Remnashop обязательное поле internal_squads для подписок'
  if (value.includes('is_trial')) return 'В Remnashop обязательное поле is_trial для подписок'
  if (/permission denied/i.test(value)) return describeSyncError(new Error(value))
  if (value === 'remnashop promo code schema is not recognized') {
    return 'Не распознана таблица промокодов Remnashop'
  }
  if (value.includes('not configured')) return 'Не настроено подключение'
  if (value === 'remnashop user not found') return 'Пользователь ещё не связан с Remnashop'
  if (value.includes('not found')) return 'Связанная запись не найдена'
  if (value.includes('not recognized')) return 'Схема таблицы не распознана'
  return value.length > 180 ? `${value.slice(0, 180)}...` : value
}

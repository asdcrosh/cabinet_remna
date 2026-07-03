import { prisma } from '../src/lib/prisma'
import { notifySubscriptionExpiring, notifyTrafficLimit } from '../src/lib/notifications'
import { syncPaymentProvisioning } from '../src/lib/payment-sync'
import { syncCabinetPaymentToRemnashopBestEffort } from '../src/lib/remnashop-reverse-sync'
import { maybeSyncRemnashopCatalog } from '../src/lib/remnashop-sync'
import { syncRemnashopUsersToCabinet } from '../src/lib/remnashop-users'

const intervalMs = readPositiveInt('PAYMENT_RECONCILE_INTERVAL_SECONDS', 60) * 1000
const batchSize = readPositiveInt('PAYMENT_RECONCILE_BATCH_SIZE', 25)
const minAgeMs = readPositiveInt('PAYMENT_RECONCILE_MIN_AGE_SECONDS', 30) * 1000
const cancelPendingAfterMs = readPositiveInt('PAYMENT_CANCEL_PENDING_AFTER_SECONDS', 600) * 1000
const notificationBatchSize = readPositiveInt('NOTIFICATION_RECONCILE_BATCH_SIZE', 100)
const remnashopUsersSyncIntervalMs = readNonNegativeInt('REMNASHOP_USERS_SYNC_INTERVAL_SECONDS', 300) * 1000
const remnashopReverseSyncBatchSize = readPositiveInt('REMNASHOP_REVERSE_SYNC_BATCH_SIZE', 25)
const remnashopReverseSyncLookbackDays = readPositiveInt('REMNASHOP_REVERSE_SYNC_LOOKBACK_DAYS', 14)

let stopped = false
let wakeSleep: (() => void) | null = null
let lastRemnashopUsersSyncAt = 0

process.on('SIGTERM', stop)
process.on('SIGINT', stop)

async function main() {
  console.log(
    `[payment-reconciler] started interval=${intervalMs / 1000}s batch=${batchSize} minAge=${minAgeMs / 1000}s cancelPendingAfter=${cancelPendingAfterMs / 1000}s`
  )

  while (!stopped) {
    await runOnce().catch((error) => {
      console.error('[payment-reconciler] batch failed', error)
    })
    await sleep(intervalMs)
  }

  await prisma.$disconnect()
  console.log('[payment-reconciler] stopped')
}

async function runOnce() {
  await maybeSyncRemnashopCatalog().catch((error) => {
    console.error('[remnashop-sync] background sync failed', error)
  })
  await syncRemnashopUsersIfDue()

  const cutoff = new Date(Date.now() - minAgeMs)
  const payments = await prisma.payment.findMany({
    where: {
      createdAt: { lte: cutoff },
      OR: [
        { status: 'PENDING' },
        { status: 'SUCCEEDED', subscriptionProvisionedAt: null },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
    select: { id: true, status: true, yookassaId: true },
  })

  if (payments.length > 0) {
    console.log(`[payment-reconciler] checking ${payments.length} payment(s)`)
    for (const payment of payments) {
      if (stopped) break
      try {
        const result = await syncPaymentProvisioning({
          paymentId: payment.id,
          cancelPendingOlderThanMs: cancelPendingAfterMs,
        })
        console.log(
          `[payment-reconciler] payment=${payment.id} status=${result.status} provisioned=${result.provisioned}`
        )
      } catch (error) {
        console.error(`[payment-reconciler] payment=${payment.id} failed`, error)
      }
    }
  }

  await retryRemnashopReverseSync()
  await notifyExpiringSubscriptions()
  await notifyTrafficThresholds()
}

async function syncRemnashopUsersIfDue() {
  if (!process.env.REMNASHOP_DATABASE_URL) return
  if (remnashopUsersSyncIntervalMs <= 0) return

  const now = Date.now()
  if (now - lastRemnashopUsersSyncAt < remnashopUsersSyncIntervalMs) return
  lastRemnashopUsersSyncAt = now

  try {
    const result = await syncRemnashopUsersToCabinet()
    console.log(
      `[remnashop-users-sync] total=${result.total} created=${result.created} updated=${result.updated} skipped=${result.skipped} subscriptionsSynced=${result.subscriptionsSynced} subscriptionsFailed=${result.subscriptionsFailed}`
    )
  } catch (error) {
    console.error('[remnashop-users-sync] failed', error)
  }
}

async function retryRemnashopReverseSync() {
  if (!process.env.REMNASHOP_DATABASE_URL) return

  const payments = await prisma.payment.findMany({
    where: {
      status: 'SUCCEEDED',
      subscriptionProvisionedAt: { not: null },
      updatedAt: {
        gte: new Date(Date.now() - remnashopReverseSyncLookbackDays * 24 * 60 * 60 * 1000),
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: remnashopReverseSyncBatchSize,
    select: { id: true },
  })

  for (const payment of payments) {
    if (stopped) break
    const result = await syncCabinetPaymentToRemnashopBestEffort(payment.id)
    if (!result.ok) {
      console.error(`[remnashop-reverse-sync] payment=${payment.id} failed`)
    }
  }
}

async function notifyExpiringSubscriptions() {
  const now = Date.now()
  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: { in: ['ACTIVE', 'LIMITED'] },
      expireAt: {
        gt: new Date(now),
        lte: new Date(now + 3 * 24 * 60 * 60 * 1000),
      },
    },
    orderBy: { expireAt: 'asc' },
    take: notificationBatchSize,
    select: {
      id: true,
      userId: true,
      expireAt: true,
      plan: { select: { name: true } },
    },
  })

  for (const subscription of subscriptions) {
    if (stopped) break
    const leftMs = subscription.expireAt.getTime() - now
    const stage = leftMs <= 6 * 60 * 60 * 1000 ? '6h' : leftMs <= 24 * 60 * 60 * 1000 ? '1d' : '3d'
    await notifySubscriptionExpiring({
      userId: subscription.userId,
      subscriptionId: subscription.id,
      expireAt: subscription.expireAt,
      stage,
      planName: subscription.plan?.name,
    })
  }
}

async function notifyTrafficThresholds() {
  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: { in: ['ACTIVE', 'LIMITED'] },
      trafficLimitBytes: { not: null },
      trafficUsedBytes: { gt: 0 },
    },
    orderBy: { updatedAt: 'desc' },
    take: notificationBatchSize,
    select: {
      id: true,
      userId: true,
      trafficUsedBytes: true,
      trafficLimitBytes: true,
    },
  })

  for (const subscription of subscriptions) {
    if (stopped) break
    const limit = subscription.trafficLimitBytes
    if (!limit || limit <= 0n) continue

    const percent = (subscription.trafficUsedBytes * 100n) / limit
    const stage = percent >= 100n ? '100' : percent >= 95n ? '95' : percent >= 80n ? '80' : null
    if (!stage) continue

    await notifyTrafficLimit({
      userId: subscription.userId,
      subscriptionId: subscription.id,
      stage,
      usedBytes: subscription.trafficUsedBytes,
      limitBytes: limit,
    })
  }
}

function stop() {
  stopped = true
  wakeSleep?.()
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      wakeSleep = null
      resolve(undefined)
    }, ms)
    wakeSleep = () => {
      clearTimeout(timer)
      wakeSleep = null
      resolve(undefined)
    }
  })
}

function readPositiveInt(name: string, fallback: number) {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : fallback
}

function readNonNegativeInt(name: string, fallback: number) {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number(raw)
  return Number.isInteger(value) && value >= 0 ? value : fallback
}

main().catch(async (error) => {
  console.error('[payment-reconciler] fatal', error)
  await prisma.$disconnect()
  process.exit(1)
})

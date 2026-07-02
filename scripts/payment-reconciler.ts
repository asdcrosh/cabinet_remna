import { prisma } from '../src/lib/prisma'
import { notifySubscriptionExpiring, notifyTrafficLimit } from '../src/lib/notifications'
import { syncPaymentProvisioning } from '../src/lib/payment-sync'
import { maybeSyncRemnashopCatalog } from '../src/lib/remnashop-sync'
import { runAutoFunnels } from '../src/lib/autofunnels'
import { runSeasonalEventNotifications } from '../src/lib/seasonal-events'

const intervalMs = readPositiveInt('PAYMENT_RECONCILE_INTERVAL_SECONDS', 60) * 1000
const batchSize = readPositiveInt('PAYMENT_RECONCILE_BATCH_SIZE', 25)
const minAgeMs = readPositiveInt('PAYMENT_RECONCILE_MIN_AGE_SECONDS', 30) * 1000
const cancelPendingAfterMs = readPositiveInt('PAYMENT_CANCEL_PENDING_AFTER_SECONDS', 600) * 1000
const notificationBatchSize = readPositiveInt('NOTIFICATION_RECONCILE_BATCH_SIZE', 100)

let stopped = false
let wakeSleep: (() => void) | null = null

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

  await notifyExpiringSubscriptions()
  await notifyTrafficThresholds()
  await runEngagementAutomation()
}

async function runEngagementAutomation() {
  if (envFlag('FEATURE_SEASONAL_EVENTS_RUNNER', false)) {
    const result = await runSeasonalEventNotifications().catch((error) => {
      console.error('[seasonal-events] runner failed', error)
      return null
    })
    if (result) console.log(`[seasonal-events] sent=${result.sent} skipped=${result.skipped}`)
  }

  if (envFlag('FEATURE_AUTOFUNNELS', false)) {
    const result = await runAutoFunnels().catch((error) => {
      console.error('[autofunnels] runner failed', error)
      return null
    })
    if (result) console.log(`[autofunnels] funnels=${result.funnels} sent=${result.sent} gifts=${result.giftsGranted}`)
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

function envFlag(name: string, fallback: boolean) {
  const raw = process.env[name]
  if (raw == null) return fallback
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase())
}

main().catch(async (error) => {
  console.error('[payment-reconciler] fatal', error)
  await prisma.$disconnect()
  process.exit(1)
})

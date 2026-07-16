import { prisma } from '../src/lib/prisma'
import { notifySubscriptionExpiring, notifyTrafficLimit } from '../src/lib/notifications'
import { syncPaymentProvisioning } from '../src/lib/payment-sync'
import { provisionPaymentSubscription } from '../src/lib/provisioning'
import { syncCabinetPaymentToRemnashopBestEffort } from '../src/lib/remnashop-reverse-sync'
import { maybeSyncRemnashopCatalog } from '../src/lib/remnashop-sync'
import { syncRemnashopUsersToCabinet } from '../src/lib/remnashop-users'
import { logError, logInfo } from '../src/lib/logger'

const intervalMs = readPositiveInt('PAYMENT_RECONCILE_INTERVAL_SECONDS', 60) * 1000
const batchSize = readPositiveInt('PAYMENT_RECONCILE_BATCH_SIZE', 25)
const minAgeMs = readPositiveInt('PAYMENT_RECONCILE_MIN_AGE_SECONDS', 30) * 1000
const cancelPendingAfterMs = readPositiveInt('PAYMENT_CANCEL_PENDING_AFTER_SECONDS', 600) * 1000
const provisioningRetryBatchSize = readPositiveInt('PROVISIONING_RETRY_BATCH_SIZE', 10)
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
  logInfo('payment_reconciler.started', {
    intervalSeconds: intervalMs / 1000,
    batchSize,
    minAgeSeconds: minAgeMs / 1000,
    cancelPendingAfterSeconds: cancelPendingAfterMs / 1000,
  })

  while (!stopped) {
    await runOnce().catch((error) => {
      logError('payment_reconciler.batch_failed', error)
    })
    await sleep(intervalMs)
  }

  await prisma.$disconnect()
  logInfo('payment_reconciler.stopped')
}

async function runOnce() {
  await maybeSyncRemnashopCatalog().catch((error) => {
    logError('remnashop_sync.background_failed', error)
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
    logInfo('payment_reconciler.payments_check_started', { count: payments.length })
    for (const payment of payments) {
      if (stopped) break
      try {
        const result = await syncPaymentProvisioning({
          paymentId: payment.id,
          cancelPendingOlderThanMs: cancelPendingAfterMs,
        })
        logInfo('payment_reconciler.payment_checked', {
          paymentId: payment.id,
          status: result.status,
          provisioned: result.provisioned,
        })
      } catch (error) {
        logError('payment_reconciler.payment_failed', error, { paymentId: payment.id })
      }
    }
  }

  await retryProvisioningJobs()
  await retryRemnashopReverseSync()
  await notifyExpiringSubscriptions()
  await notifyTrafficThresholds()
}

async function retryProvisioningJobs() {
  const jobs = await prisma.provisioningJob.findMany({
    where: {
      status: 'FAILED',
      OR: [
        { nextRetryAt: null },
        { nextRetryAt: { lte: new Date() } },
      ],
    },
    orderBy: [
      { nextRetryAt: 'asc' },
      { updatedAt: 'asc' },
    ],
    take: provisioningRetryBatchSize,
    include: {
      payment: {
        include: {
          user: { select: { id: true, email: true } },
          plan: {
            select: {
              id: true,
              name: true,
              durationDays: true,
              trafficLimitGb: true,
              deviceLimit: true,
              activeInternalSquads: true,
            },
          },
        },
      },
    },
  })

  if (jobs.length === 0) return
  logInfo('payment_reconciler.provisioning_retry_started', { count: jobs.length })

  for (const job of jobs) {
    if (stopped) break
    const payment = job.payment

    if (payment.status !== 'SUCCEEDED') {
      logInfo('payment_reconciler.provisioning_retry_skipped', {
        paymentId: payment.id,
        status: payment.status,
      })
      continue
    }

    try {
      await provisionPaymentSubscription({
        userId: payment.user.id,
        email: payment.user.email,
        paymentId: payment.id,
        plan: payment.plan,
      })
      logInfo('payment_reconciler.provisioning_retry_succeeded', {
        paymentId: payment.id,
        jobId: job.id,
      })
    } catch (error) {
      logError('payment_reconciler.provisioning_retry_failed', error, {
        paymentId: payment.id,
        jobId: job.id,
      })
    }
  }
}

async function syncRemnashopUsersIfDue() {
  if (!process.env.REMNASHOP_DATABASE_URL) return
  if (remnashopUsersSyncIntervalMs <= 0) return

  const now = Date.now()
  if (now - lastRemnashopUsersSyncAt < remnashopUsersSyncIntervalMs) return
  lastRemnashopUsersSyncAt = now

  try {
    const result = await syncRemnashopUsersToCabinet()
    logInfo('remnashop_users_sync.completed', result)
  } catch (error) {
    logError('remnashop_users_sync.failed', error)
  }
}

async function retryRemnashopReverseSync() {
  if (!process.env.REMNASHOP_DATABASE_URL) return

  const payments = await prisma.payment.findMany({
    where: {
      status: 'SUCCEEDED',
      subscriptionProvisionedAt: { not: null },
      OR: [
        { remnashopSyncedAt: null },
        { remnashopSyncError: { not: null } },
      ],
      updatedAt: {
        gte: new Date(Date.now() - remnashopReverseSyncLookbackDays * 24 * 60 * 60 * 1000),
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: remnashopReverseSyncBatchSize,
    select: { id: true },
  })
  const retryablePaymentIds = await filterRetryableRemnashopPaymentIds(payments.map((payment) => payment.id))

  for (const paymentId of retryablePaymentIds) {
    if (stopped) break
    const result = await syncCabinetPaymentToRemnashopBestEffort(paymentId)
    if (!result.ok) {
      const reason = 'error' in result ? result.error : result.skipped
      logError('remnashop_reverse_sync.payment_failed', reason, { paymentId })
    }
  }
}

async function filterRetryableRemnashopPaymentIds(paymentIds: string[]) {
  if (paymentIds.length === 0) return []
  const now = new Date()
  const delayed = await prisma.syncEvent.findMany({
    where: {
      direction: 'CABINET_TO_REMNASHOP',
      entityType: 'payment',
      entityId: { in: paymentIds },
      operation: 'upsert',
      status: 'FAILED',
      nextRetryAt: { gt: now },
    },
    select: { entityId: true },
  })
  const delayedIds = new Set(delayed.map((event) => event.entityId))
  return paymentIds.filter((paymentId) => !delayedIds.has(paymentId))
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

async function start() {
  if (process.env.OPS_STARTUP_CHECK === 'true') {
    logInfo('payment_reconciler.startup_check_passed')
    await prisma.$disconnect()
    return
  }
  await main()
}

start().catch(async (error) => {
  logError('payment_reconciler.fatal', error)
  await prisma.$disconnect()
  process.exit(1)
})

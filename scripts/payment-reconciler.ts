import { prisma } from '../src/lib/prisma'
import { syncPaymentProvisioning } from '../src/lib/payment-sync'

const intervalMs = readPositiveInt('PAYMENT_RECONCILE_INTERVAL_SECONDS', 180) * 1000
const batchSize = readPositiveInt('PAYMENT_RECONCILE_BATCH_SIZE', 25)
const minAgeMs = readPositiveInt('PAYMENT_RECONCILE_MIN_AGE_SECONDS', 60) * 1000

let stopped = false
let wakeSleep: (() => void) | null = null

process.on('SIGTERM', stop)
process.on('SIGINT', stop)

async function main() {
  console.log(
    `[payment-reconciler] started interval=${intervalMs / 1000}s batch=${batchSize} minAge=${minAgeMs / 1000}s`
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
  const cutoff = new Date(Date.now() - minAgeMs)
  const payments = await prisma.payment.findMany({
    where: {
      createdAt: { lte: cutoff },
      OR: [
        { status: 'PENDING', yookassaId: { not: null } },
        { status: 'SUCCEEDED', subscriptionProvisionedAt: null },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
    select: { id: true, status: true, yookassaId: true },
  })

  if (payments.length === 0) return

  console.log(`[payment-reconciler] checking ${payments.length} payment(s)`)
  for (const payment of payments) {
    if (stopped) break
    try {
      const result = await syncPaymentProvisioning({ paymentId: payment.id })
      console.log(
        `[payment-reconciler] payment=${payment.id} status=${result.status} provisioned=${result.provisioned}`
      )
    } catch (error) {
      console.error(`[payment-reconciler] payment=${payment.id} failed`, error)
    }
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

main().catch(async (error) => {
  console.error('[payment-reconciler] fatal', error)
  await prisma.$disconnect()
  process.exit(1)
})

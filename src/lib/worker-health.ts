import { prisma } from './prisma'

export const PAYMENT_WORKER_HEARTBEAT_KEY = 'worker:payment-reconciler'

export async function recordPaymentWorkerHeartbeat() {
  const validUntil = new Date(Date.now() + readHeartbeatMaxAgeMs())
  await prisma.rateLimitBucket.upsert({
    where: { key: PAYMENT_WORKER_HEARTBEAT_KEY },
    create: {
      key: PAYMENT_WORKER_HEARTBEAT_KEY,
      count: 1,
      resetAt: validUntil,
    },
    update: {
      count: 1,
      resetAt: validUntil,
    },
  })
}

export async function getPaymentWorkerHeartbeat() {
  return prisma.rateLimitBucket.findUnique({
    where: { key: PAYMENT_WORKER_HEARTBEAT_KEY },
    select: { resetAt: true, updatedAt: true },
  })
}

function readHeartbeatMaxAgeMs() {
  const seconds = Number(process.env.PAYMENT_WORKER_HEARTBEAT_MAX_AGE_SECONDS || 180)
  return (Number.isInteger(seconds) && seconds >= 60 ? seconds : 180) * 1000
}

import { prisma } from './prisma'

export const PAYMENT_WORKER_HEARTBEAT_KEY = 'worker:payment-reconciler'
export const BROADCAST_WORKER_HEARTBEAT_KEY = 'worker:broadcast'
export const WATCH_WORKER_HEARTBEAT_KEY = 'worker:watch'
export const NODE_PROVISIONING_WORKER_HEARTBEAT_KEY = 'worker:node-provisioning'

export type WorkerHeartbeatName = 'payment' | 'broadcast' | 'watch' | 'node-provisioning'

const heartbeatKeys: Record<WorkerHeartbeatName, string> = {
  payment: PAYMENT_WORKER_HEARTBEAT_KEY,
  broadcast: BROADCAST_WORKER_HEARTBEAT_KEY,
  watch: WATCH_WORKER_HEARTBEAT_KEY,
  'node-provisioning': NODE_PROVISIONING_WORKER_HEARTBEAT_KEY,
}

export async function recordWorkerHeartbeat(worker: WorkerHeartbeatName, maxAgeSeconds: number) {
  const ttlSeconds = Number.isInteger(maxAgeSeconds) && maxAgeSeconds >= 30 ? maxAgeSeconds : 180
  const validUntil = new Date(Date.now() + ttlSeconds * 1000)
  await prisma.rateLimitBucket.upsert({
    where: { key: heartbeatKeys[worker] },
    create: {
      key: heartbeatKeys[worker],
      count: 1,
      resetAt: validUntil,
    },
    update: {
      count: 1,
      resetAt: validUntil,
    },
  })
}

export async function getWorkerHeartbeat(worker: WorkerHeartbeatName) {
  return prisma.rateLimitBucket.findUnique({
    where: { key: heartbeatKeys[worker] },
    select: { resetAt: true, updatedAt: true },
  })
}

export async function recordPaymentWorkerHeartbeat() {
  await recordWorkerHeartbeat('payment', readHeartbeatMaxAgeSeconds())
}

export async function getPaymentWorkerHeartbeat() {
  return getWorkerHeartbeat('payment')
}

function readHeartbeatMaxAgeSeconds() {
  const seconds = Number(process.env.PAYMENT_WORKER_HEARTBEAT_MAX_AGE_SECONDS || 180)
  return Number.isInteger(seconds) && seconds >= 60 ? seconds : 180
}

import { writeFile } from 'node:fs/promises'
import { logError, logInfo } from '../src/lib/logger'
import { processNodeProvisioningBatch } from '../src/lib/node-provisioning-worker'
import { prisma } from '../src/lib/prisma'
import { recordWorkerHeartbeat } from '../src/lib/worker-health'
import { isPublicIpv4 } from '../src/lib/node-provisioning-validation'

const intervalSeconds = positiveInteger(process.env.NODE_PROVISIONING_WORKER_INTERVAL_SECONDS, 10)
const heartbeatMaxAgeSeconds = positiveInteger(process.env.NODE_PROVISIONING_WORKER_HEARTBEAT_MAX_AGE_SECONDS, 180)
const heartbeatIntervalMs = Math.max(15, Math.min(60, Math.floor(heartbeatMaxAgeSeconds / 3))) * 1000
let stopRequested = false
let heartbeatTimer: NodeJS.Timeout | null = null
let heartbeatInFlight = false

async function main() {
  validateWorkerConfiguration()
  bindShutdown()
  startHeartbeatLoop()
  logInfo('node_provisioning_worker.started', { intervalSeconds })
  while (!stopRequested) {
    await heartbeat()
    const processed = await processNodeProvisioningBatch()
    await heartbeat()
    if (!processed) await sleep(intervalSeconds * 1000)
  }
  logInfo('node_provisioning_worker.stopped')
}

function validateWorkerConfiguration() {
  const required = [
    'DATABASE_URL',
    'TIMEWEB_API_TOKEN',
    'REMNAWAVE_BASE_URL',
    'REMNAWAVE_TOKEN',
    'NODE_PROVISIONING_BASE_DOMAIN',
    'NODE_PROVISIONING_ENCRYPTION_KEY',
    'NODE_PROVISIONING_PANEL_IP',
    'NODE_PROVISIONING_ADMIN_EMAIL',
    'NODE_PROVISIONING_REMNANODE_IMAGE',
  ] as const
  const missing = required.filter((name) => !process.env[name]?.trim())
  if (missing.length > 0) throw new Error(`Node provisioning is not configured: ${missing.join(', ')}`)

  if (process.env.NODE_PROVISIONING_ENCRYPTION_KEY!.trim().length < 32) {
    throw new Error('NODE_PROVISIONING_ENCRYPTION_KEY must be at least 32 characters')
  }
  const baseDomain = process.env.NODE_PROVISIONING_BASE_DOMAIN!.trim()
  if (!/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(baseDomain)) {
    throw new Error('NODE_PROVISIONING_BASE_DOMAIN must be a valid base domain')
  }
  if (!isPublicIpv4(process.env.NODE_PROVISIONING_PANEL_IP!.trim())) {
    throw new Error('NODE_PROVISIONING_PANEL_IP must be a public IPv4 address')
  }
  if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/.test(process.env.NODE_PROVISIONING_ADMIN_EMAIL!.trim())) {
    throw new Error('NODE_PROVISIONING_ADMIN_EMAIL must be a valid email')
  }
  const image = process.env.NODE_PROVISIONING_REMNANODE_IMAGE!.trim()
  if (image.endsWith(':latest') || (!image.includes('@sha256:') && !/^.+:[^/:]+$/.test(image))) {
    throw new Error('NODE_PROVISIONING_REMNANODE_IMAGE must use a non-latest tag or digest')
  }
  const remnawaveUrl = new URL(process.env.REMNAWAVE_BASE_URL!.trim())
  if (remnawaveUrl.protocol !== 'https:') throw new Error('REMNAWAVE_BASE_URL must use HTTPS')
}

async function heartbeat() {
  if (heartbeatInFlight) return
  heartbeatInFlight = true
  try {
    await Promise.allSettled([
      writeFile('/tmp/node-provisioning-worker-heartbeat', new Date().toISOString(), 'utf8'),
      recordWorkerHeartbeat('node-provisioning', heartbeatMaxAgeSeconds),
    ])
  } finally {
    heartbeatInFlight = false
  }
}

function startHeartbeatLoop() {
  heartbeatTimer = setInterval(() => {
    void heartbeat()
  }, heartbeatIntervalMs)
  heartbeatTimer.unref()
}

function bindShutdown() {
  const stop = (signal: NodeJS.Signals) => {
    if (stopRequested) return
    stopRequested = true
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    logInfo('node_provisioning_worker.shutdown_requested', { signal })
  }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
}

function positiveInteger(raw: string | undefined, fallback: number) {
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : fallback
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function start() {
  if (process.env.OPS_STARTUP_CHECK === 'true') {
    logInfo('node_provisioning_worker.startup_check_passed')
    return
  }
  await main()
}

start()
  .catch((error) => {
    logError('node_provisioning_worker.fatal', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

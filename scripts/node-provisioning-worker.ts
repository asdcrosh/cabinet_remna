import { writeFile } from 'node:fs/promises'
import { Client } from 'pg'
import { logError, logInfo, logWarn } from '../src/lib/logger'
import { failInterruptedNodeProvisioningJobs, processNodeProvisioningBatch } from '../src/lib/node-provisioning-worker'
import { nodeHostRemark, resolveNodeCountryCode } from '../src/lib/node-country'
import { prisma } from '../src/lib/prisma'
import { recordWorkerHeartbeat } from '../src/lib/worker-health'

const intervalSeconds = positiveInteger(process.env.NODE_PROVISIONING_WORKER_INTERVAL_SECONDS, 10)
const heartbeatMaxAgeSeconds = positiveInteger(process.env.NODE_PROVISIONING_WORKER_HEARTBEAT_MAX_AGE_SECONDS, 180)
const heartbeatIntervalMs = Math.max(15, Math.min(60, Math.floor(heartbeatMaxAgeSeconds / 3))) * 1000
let stopRequested = false
let heartbeatTimer: NodeJS.Timeout | null = null
let heartbeatInFlight = false
const workerLockId = '5737974967122994529'

async function main() {
  const lockClient = await acquireWorkerLock()
  try {
    bindShutdown()
    const interruptedJobs = await failInterruptedNodeProvisioningJobs()
    if (interruptedJobs > 0) {
      logWarn('node_provisioning_worker.interrupted_jobs_failed', { count: interruptedJobs })
    }
    validateWorkerConfiguration()
    startHeartbeatLoop()
    logInfo('node_provisioning_worker.started', { intervalSeconds })
    while (!stopRequested) {
      await heartbeat()
      const processed = await processNodeProvisioningBatch()
      await heartbeat()
      if (!processed) await sleep(intervalSeconds * 1000)
    }
    logInfo('node_provisioning_worker.stopped')
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    await releaseWorkerLock(lockClient)
  }
}

async function acquireWorkerLock() {
  const connectionString = process.env.DATABASE_URL?.trim()
  if (!connectionString) throw new Error('DATABASE_URL is not configured')
  const client = new Client({
    connectionString,
    application_name: 'cabinet-node-provisioning-worker',
  })
  await client.connect()
  try {
    const result = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1::bigint) AS locked',
      [workerLockId],
    )
    if (!result.rows[0]?.locked) {
      throw new Error('Another node provisioning worker already owns the database lock')
    }
    return client
  } catch (error) {
    await client.end().catch(() => undefined)
    throw error
  }
}

async function releaseWorkerLock(client: Client) {
  await client.query('SELECT pg_advisory_unlock($1::bigint)', [workerLockId]).catch((error) => {
    logWarn('node_provisioning_worker.lock_release_failed', {
      message: error instanceof Error ? error.message : String(error),
    })
  })
  await client.end().catch(() => undefined)
}

function validateWorkerConfiguration() {
  const required = [
    'DATABASE_URL',
    'TIMEWEB_API_TOKEN',
    'REMNAWAVE_BASE_URL',
    'REMNAWAVE_TOKEN',
    'NODE_PROVISIONING_BASE_DOMAIN',
    'NODE_PROVISIONING_ENCRYPTION_KEY',
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
  if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/.test(process.env.NODE_PROVISIONING_ADMIN_EMAIL!.trim())) {
    throw new Error('NODE_PROVISIONING_ADMIN_EMAIL must be a valid email')
  }
  const countryCode = (process.env.NODE_PROVISIONING_COUNTRY_CODE || 'AUTO').trim().toUpperCase()
  if (countryCode !== 'AUTO' && !/^[A-Z]{2}$/.test(countryCode)) {
    throw new Error('NODE_PROVISIONING_COUNTRY_CODE must be AUTO or a two-letter ISO country code')
  }
  const image = process.env.NODE_PROVISIONING_REMNANODE_IMAGE!.trim()
  if (!image.includes('@sha256:') && !/^.+:[^/:]+$/.test(image)) {
    throw new Error('NODE_PROVISIONING_REMNANODE_IMAGE must use an image tag or digest')
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
    const geoIpCountry = resolveNodeCountryCode('8.8.8.8', 'AUTO')
    if (geoIpCountry !== 'US') throw new Error(`GeoIP startup check returned ${geoIpCountry}, expected US`)
    const geoIpHostRemark = nodeHostRemark(geoIpCountry, 'TCP')
    if (geoIpHostRemark !== '🇺🇸 США') throw new Error(`GeoIP host remark check returned ${geoIpHostRemark}`)
    logInfo('node_provisioning_worker.startup_check_passed', { geoIpCountry, geoIpHostRemark })
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

import { writeFile } from 'node:fs/promises'
import { processBroadcastDeliveryBatch } from '../src/lib/broadcast-delivery'
import { logError, logInfo } from '../src/lib/logger'
import { prisma } from '../src/lib/prisma'
import { isFeatureEnabled } from '../src/lib/feature-flags'
import { recordWorkerHeartbeat } from '../src/lib/worker-health'

const intervalSeconds = readIntervalSeconds()
let stopRequested = false

async function main() {
  bindShutdown()

  if (intervalSeconds !== null) {
    logInfo('broadcast_worker.started', { intervalSeconds })
    while (!stopRequested) {
      await heartbeat(intervalSeconds)
      if (await isFeatureEnabled('broadcasts')) {
        await processBroadcastDeliveryBatch()
      }
      await heartbeat(intervalSeconds)
      await sleep(intervalSeconds * 1000)
    }
    logInfo('broadcast_worker.stopped')
    return
  }

  await heartbeat(10)
  if (await isFeatureEnabled('broadcasts')) await processBroadcastDeliveryBatch()
}

function readIntervalSeconds() {
  const raw = process.env.BROADCAST_WORKER_INTERVAL_SECONDS
  if (raw == null || raw.trim() === '') return null

  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('BROADCAST_WORKER_INTERVAL_SECONDS must be a non-negative integer when set')
  }
  return value === 0 ? 10 : value
}

async function heartbeat(interval: number) {
  await Promise.allSettled([
    writeFile('/tmp/broadcast-worker-heartbeat', new Date().toISOString(), 'utf8'),
    recordWorkerHeartbeat('broadcast', Math.max(90, interval * 4)),
  ])
}

function bindShutdown() {
  const stop = (signal: NodeJS.Signals) => {
    if (stopRequested) return
    stopRequested = true
    logInfo('broadcast_worker.shutdown_requested', { signal })
  }

  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function start() {
  if (process.env.OPS_STARTUP_CHECK === 'true') {
    logInfo('broadcast_worker.startup_check_passed')
    return
  }
  await main()
}

start()
  .catch((error) => {
    logError('broadcast_worker.fatal', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

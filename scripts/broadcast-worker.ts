import { processBroadcastDeliveryBatch } from '../src/lib/broadcast-delivery'
import { logError, logInfo } from '../src/lib/logger'
import { prisma } from '../src/lib/prisma'

const intervalSeconds = readIntervalSeconds()
let stopRequested = false

async function main() {
  bindShutdown()

  if (intervalSeconds !== null) {
    logInfo('broadcast_worker.started', { intervalSeconds })
    while (!stopRequested) {
      await processBroadcastDeliveryBatch()
      await sleep(intervalSeconds * 1000)
    }
    logInfo('broadcast_worker.stopped')
    return
  }

  await processBroadcastDeliveryBatch()
}

function readIntervalSeconds() {
  const raw = process.env.BROADCAST_WORKER_INTERVAL_SECONDS
  if (raw == null || raw.trim() === '') return null

  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('BROADCAST_WORKER_INTERVAL_SECONDS must be a positive integer when set')
  }
  return value
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

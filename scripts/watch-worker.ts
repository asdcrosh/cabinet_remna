import { writeFile } from 'node:fs/promises'
import { getWatchConfig } from '../src/lib/watch-config'
import { runWatchCycle } from '../src/lib/watch-service'
import { logError, logInfo } from '../src/lib/logger'
import { prisma } from '../src/lib/prisma'

const heartbeatPath = '/tmp/watch-worker-heartbeat'
let stopRequested = false

async function main() {
  bindShutdown()
  const config = getWatchConfig()
  logInfo('watch_worker.started', { enabled: config.enabled, intervalSeconds: config.intervalSeconds })

  while (!stopRequested) {
    await heartbeat()
    if (config.enabled) {
      try {
        await runWatchCycle('worker')
      } catch (error) {
        logError('watch_worker.cycle_failed', error)
      }
    }
    await sleep(config.intervalSeconds * 1000)
  }
  logInfo('watch_worker.stopped')
}

function bindShutdown() {
  const stop = (signal: NodeJS.Signals) => {
    if (stopRequested) return
    stopRequested = true
    logInfo('watch_worker.shutdown_requested', { signal })
  }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
}

async function heartbeat() {
  await writeFile(heartbeatPath, new Date().toISOString(), 'utf8')
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function start() {
  if (process.env.OPS_STARTUP_CHECK === 'true') {
    logInfo('watch_worker.startup_check_passed')
    return
  }
  await main()
}

start()
  .catch((error) => {
    logError('watch_worker.fatal', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

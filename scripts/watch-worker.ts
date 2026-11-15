import { writeFile } from 'node:fs/promises'
import { getWatchConfig } from '../src/lib/watch-config'
import { runWatchCycle } from '../src/lib/watch-service'
import { runChannelGateSweep } from '../src/lib/miniapp/channel-gate-sweep'
import { logError, logInfo } from '../src/lib/logger'
import { prisma } from '../src/lib/prisma'
import { recordWorkerHeartbeat } from '../src/lib/worker-health'

const heartbeatPath = '/tmp/watch-worker-heartbeat'
let stopRequested = false

// Как часто бот сам показывает экран подписки вышедшим из канала пользователям.
function gateSweepIntervalMs() {
  const raw = Number(process.env.TELEGRAM_CHANNEL_GATE_SWEEP_SECONDS || 300)
  return (Number.isInteger(raw) && raw >= 60 && raw <= 3600 ? raw : 300) * 1000
}

async function main() {
  bindShutdown()
  const config = getWatchConfig()
  logInfo('watch_worker.started', { enabled: config.enabled, intervalSeconds: config.intervalSeconds })

  let lastGateSweep = 0
  while (!stopRequested) {
    await heartbeat()
    if (config.enabled) {
      try {
        await runWatchCycle('worker')
      } catch (error) {
        logError('watch_worker.cycle_failed', error)
      }
    }
    if (Date.now() - lastGateSweep >= gateSweepIntervalMs()) {
      lastGateSweep = Date.now()
      try {
        const result = await runChannelGateSweep()
        if (result.gated > 0) logInfo('watch_worker.channel_gate_sweep', result)
      } catch (error) {
        logError('watch_worker.channel_gate_sweep_failed', error)
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
  await Promise.allSettled([
    writeFile(heartbeatPath, new Date().toISOString(), 'utf8'),
    recordWorkerHeartbeat('watch', Math.max(180, getWatchConfig().intervalSeconds * 4)),
  ])
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

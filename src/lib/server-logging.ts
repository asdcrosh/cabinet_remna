import { logError, logInfo } from './logger'

let registered = false

export function registerServerLogging() {
  if (registered) return
  registered = true

  logInfo('app.boot', {
    nodeEnv: process.env.NODE_ENV,
    requestLogs: process.env.APP_REQUEST_LOGS || 'false',
    logLevel: process.env.APP_LOG_LEVEL || null,
  })

  process.on('unhandledRejection', (reason) => {
    logError('process.unhandled_rejection', reason)
  })

  process.on('uncaughtException', (error) => {
    logError('process.uncaught_exception', error)
    process.exit(1)
  })
}

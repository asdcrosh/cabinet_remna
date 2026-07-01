type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

function currentLevel() {
  const raw = process.env.APP_LOG_LEVEL?.toLowerCase()
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug'
}

export function isRequestLoggingEnabled() {
  return ['1', 'true', 'yes', 'on'].includes((process.env.APP_REQUEST_LOGS || '').toLowerCase())
}

export function logDebug(event: string, details?: Record<string, unknown>) {
  writeLog('debug', event, details)
}

export function logInfo(event: string, details?: Record<string, unknown>) {
  writeLog('info', event, details)
}

export function logWarn(event: string, details?: Record<string, unknown>) {
  writeLog('warn', event, details)
}

export function logError(event: string, error: unknown, details?: Record<string, unknown>) {
  const safeDetails = details ? (sanitize(details) as Record<string, unknown>) : {}
  const payload = {
    time: new Date().toISOString(),
    level: 'error' as const,
    event,
    ...safeDetails,
    ...(error !== undefined ? { error: serializeError(error) } : {}),
  }
  if (LEVELS.error < LEVELS[currentLevel()]) return
  const line = JSON.stringify(payload)
  console.error(line)
}

function writeLog(level: LogLevel, event: string, details?: Record<string, unknown>) {
  if (LEVELS[level] < LEVELS[currentLevel()]) return

  const safeDetails = details ? (sanitize(details) as Record<string, unknown>) : {}
  const payload = {
    time: new Date().toISOString(),
    level,
    event,
    ...safeDetails,
  }
  const line = JSON.stringify(payload)
  if (level === 'error') {
    console.error(line)
  } else if (level === 'warn') {
    console.warn(line)
  } else {
    console.log(line)
  }
}

function sanitize(value: unknown): unknown {
  if (value instanceof Error) return serializeError(value)
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(sanitize)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, sanitize(entry)])
  )
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack,
    }
  }
  return { message: String(error) }
}

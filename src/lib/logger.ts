import * as Sentry from '@sentry/nextjs'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const requestContextStack: Array<{ requestId?: string }> = []
const REDACTED = '[REDACTED]'
const SENSITIVE_KEY_PATTERN = /(password|token|secret|authorization|cookie|set-cookie|api[-_]?key)/i

function currentLevel() {
  const raw = process.env.APP_LOG_LEVEL?.toLowerCase()
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug'
}

export function isRequestLoggingEnabled() {
  return ['1', 'true', 'yes', 'on'].includes((process.env.APP_REQUEST_LOGS || '').toLowerCase())
}

export function withRequestLogContext<T>(context: { requestId?: string }, callback: () => T) {
  requestContextStack.push(context)
  try {
    const result = callback()
    if (result instanceof Promise) {
      return result.finally(() => {
        requestContextStack.pop()
      }) as T
    }
    requestContextStack.pop()
    return result
  } catch (error) {
    requestContextStack.pop()
    throw error
  }
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
  const requestContext = currentRequestContext()
  const payload = {
    time: new Date().toISOString(),
    level: 'error' as const,
    event,
    ...requestContext,
    ...safeDetails,
    ...(error !== undefined ? { error: serializeError(error) } : {}),
  }
  if (LEVELS.error < LEVELS[currentLevel()]) return
  const line = JSON.stringify(payload)
  console.error(line)
  captureSentryError(event, error, { ...requestContext, ...safeDetails })
}

function writeLog(level: LogLevel, event: string, details?: Record<string, unknown>) {
  if (LEVELS[level] < LEVELS[currentLevel()]) return

  const safeDetails = details ? (sanitize(details) as Record<string, unknown>) : {}
  const payload = {
    time: new Date().toISOString(),
    level,
    event,
    ...currentRequestContext(),
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

function sanitize(value: unknown, key = ''): unknown {
  if (key && SENSITIVE_KEY_PATTERN.test(key)) return REDACTED
  if (value instanceof Error) return serializeError(value)
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry, key))
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([entryKey, entry]) => [entryKey, sanitize(entry, entryKey)])
  )
}

function currentRequestContext() {
  const requestId = requestContextStack[requestContextStack.length - 1]?.requestId
  return requestId ? { requestId } : {}
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

function captureSentryError(event: string, error: unknown, details: Record<string, unknown>) {
  if (!isSentryConfigured()) return

  Sentry.withScope((scope) => {
    scope.setTag('event', event)
    for (const [key, value] of Object.entries(details)) {
      scope.setExtra(key, value)
    }
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)))
  })
}

function isSentryConfigured() {
  return Boolean(
    process.env.SENTRY_DSN ||
      process.env.NEXT_PUBLIC_SENTRY_DSN
  )
}

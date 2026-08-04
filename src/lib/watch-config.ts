export type WatchConfig = {
  enabled: boolean
  intervalSeconds: number
  timeoutMs: number
  probeAttempts: number
  failureThreshold: number
  recoveryThreshold: number
  retentionDays: number
  telegramChatId: string | null
}

export function getWatchConfig(): WatchConfig {
  return {
    enabled: readBoolean('WATCH_ENABLED', true),
    intervalSeconds: readInteger('WATCH_INTERVAL_SECONDS', 60, 15, 3600),
    timeoutMs: readInteger('WATCH_TIMEOUT_MS', 5000, 1000, 30_000),
    probeAttempts: readInteger('WATCH_PROBE_ATTEMPTS', 2, 1, 5),
    failureThreshold: readIntegerWithLegacy('WATCH_ALERT_FAILURE_THRESHOLD', 'WATCH_FAILURE_THRESHOLD', 5, 1, 20),
    recoveryThreshold: readIntegerWithLegacy('WATCH_ALERT_RECOVERY_THRESHOLD', 'WATCH_RECOVERY_THRESHOLD', 5, 1, 20),
    retentionDays: readInteger('WATCH_RETENTION_DAYS', 30, 1, 365),
    telegramChatId: process.env.WATCH_TELEGRAM_CHAT_ID?.trim() || process.env.TELEGRAM_NOTIFY_CHAT_ID?.trim() || null,
  }
}

function readIntegerWithLegacy(key: string, legacyKey: string, fallback: number, min: number, max: number) {
  return process.env[key]?.trim()
    ? readInteger(key, fallback, min, max)
    : readInteger(legacyKey, fallback, min, max)
}

function readBoolean(key: string, fallback: boolean) {
  const raw = process.env[key]?.trim().toLowerCase()
  if (!raw) return fallback
  return ['1', 'true', 'yes', 'on'].includes(raw)
}

function readInteger(key: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[key])
  if (!Number.isInteger(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

import { afterEach, describe, expect, it } from 'vitest'
import { getWatchConfig } from './watch-config'

const watchKeys = [
  'WATCH_PROBE_ATTEMPTS',
  'WATCH_ALERT_FAILURE_THRESHOLD',
  'WATCH_ALERT_RECOVERY_THRESHOLD',
  'WATCH_FAILURE_THRESHOLD',
  'WATCH_RECOVERY_THRESHOLD',
] as const

afterEach(() => {
  for (const key of watchKeys) delete process.env[key]
})

describe('getWatchConfig', () => {
  it('uses anti-flap defaults for new installations', () => {
    const config = getWatchConfig()

    expect(config.probeAttempts).toBe(2)
    expect(config.failureThreshold).toBe(5)
    expect(config.recoveryThreshold).toBe(5)
  })

  it('prefers the new alert thresholds over legacy values', () => {
    process.env.WATCH_ALERT_FAILURE_THRESHOLD = '6'
    process.env.WATCH_ALERT_RECOVERY_THRESHOLD = '7'
    process.env.WATCH_FAILURE_THRESHOLD = '2'
    process.env.WATCH_RECOVERY_THRESHOLD = '2'

    const config = getWatchConfig()

    expect(config.failureThreshold).toBe(6)
    expect(config.recoveryThreshold).toBe(7)
  })

  it('keeps legacy thresholds compatible when new values are absent', () => {
    process.env.WATCH_FAILURE_THRESHOLD = '4'
    process.env.WATCH_RECOVERY_THRESHOLD = '3'

    const config = getWatchConfig()

    expect(config.failureThreshold).toBe(4)
    expect(config.recoveryThreshold).toBe(3)
  })
})

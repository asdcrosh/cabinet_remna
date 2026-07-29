import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { logError, logInfo, withRequestLogContext } from './logger'

describe('logger', () => {
  const originalLevel = process.env.APP_LOG_LEVEL

  beforeEach(() => {
    process.env.APP_LOG_LEVEL = 'debug'
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    if (originalLevel == null) delete process.env.APP_LOG_LEVEL
    else process.env.APP_LOG_LEVEL = originalLevel
    vi.restoreAllMocks()
  })

  it('adds requestId from request log context', () => {
    withRequestLogContext({ requestId: 'req_test_12345678' }, () => {
      logInfo('test.event', { userId: 'user-1' })
    })

    const logLine = vi.mocked(console.log).mock.calls[0]?.[0]
    expect(logLine).toEqual(expect.any(String))
    const payload = JSON.parse(logLine as string)
    expect(payload).toMatchObject({
      level: 'info',
      event: 'test.event',
      requestId: 'req_test_12345678',
      userId: 'user-1',
    })
    expect(payload.time).toEqual(expect.any(String))
  })

  it('isolates request IDs between overlapping async operations', async () => {
    let releaseSecond!: () => void
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve
    })

    const first = withRequestLogContext({ requestId: 'req_first_12345678' }, async () => {
      await Promise.resolve()
      logInfo('test.first')
      releaseSecond()
    })
    const second = withRequestLogContext({ requestId: 'req_second_12345678' }, async () => {
      await secondGate
      logInfo('test.second')
    })

    await Promise.all([first, second])
    const payloads = vi.mocked(console.log).mock.calls.map(([line]) => JSON.parse(String(line)))

    expect(payloads.find((payload) => payload.event === 'test.first')?.requestId).toBe('req_first_12345678')
    expect(payloads.find((payload) => payload.event === 'test.second')?.requestId).toBe('req_second_12345678')
  })

  it('redacts sensitive keys recursively', () => {
    logError('test.error', new Error('boom'), {
      password: 'secret-password',
      nested: {
        accessToken: 'secret-token',
        Authorization: 'Bearer secret',
      },
    })

    const logLine = vi.mocked(console.error).mock.calls[0]?.[0]
    expect(logLine).toEqual(expect.any(String))
    const payload = JSON.parse(logLine as string)
    expect(payload.password).toBe('[REDACTED]')
    expect(payload.nested.accessToken).toBe('[REDACTED]')
    expect(payload.nested.Authorization).toBe('[REDACTED]')
    expect(payload.error.message).toBe('boom')
  })
})

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

import { proxy } from './proxy'
import { logInfo } from '@/lib/logger'

vi.mock('@/lib/logger', () => ({
  isRequestLoggingEnabled: vi.fn(() => true),
  logInfo: vi.fn(),
  withRequestLogContext: vi.fn((_context, callback) => callback()),
}))

const logInfoMock = vi.mocked(logInfo)

describe('middleware request id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000000'),
      },
      configurable: true,
    })
  })

  it('keeps a valid incoming x-request-id in response and request log', () => {
    const req = new NextRequest('https://example.com/api/plans', {
      headers: {
        'x-request-id': 'req_test-12345678',
        'user-agent': 'vitest',
      },
    })

    const res = proxy(req)

    expect(res.headers.get('x-request-id')).toBe('req_test-12345678')
    expect(logInfoMock).toHaveBeenCalledWith(
      'http.request',
      expect.objectContaining({
        requestId: 'req_test-12345678',
        method: 'GET',
        path: '/api/plans',
      })
    )
  })

  it('generates x-request-id when incoming value is missing or unsafe', () => {
    const req = new NextRequest('https://example.com/api/plans', {
      headers: {
        'x-request-id': 'bad id',
      },
    })

    const res = proxy(req)
    const requestId = res.headers.get('x-request-id')

    expect(requestId).toBe('00000000-0000-4000-8000-000000000000')
    expect(requestId).not.toBe('bad id')
    expect(logInfoMock).toHaveBeenCalledWith(
      'http.request',
      expect.objectContaining({
        requestId,
      })
    )
  })

  it('does not write query values or referer query strings to request logs', () => {
    const req = new NextRequest('https://example.com/reset-password?token=reset-secret&next=%2Fdashboard', {
      headers: {
        referer: 'https://example.com/api/auth/verify-email?token=verify-secret',
      },
    })

    const res = proxy(req)
    const loggedDetails = logInfoMock.mock.calls[0]?.[1]

    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(loggedDetails).toMatchObject({
      path: '/reset-password',
      queryKeys: ['token', 'next'],
      referer: 'https://example.com/api/auth/verify-email',
    })
    expect(JSON.stringify(loggedDetails)).not.toContain('reset-secret')
    expect(JSON.stringify(loggedDetails)).not.toContain('verify-secret')
  })

  it('logs proxy client headers only when proxy trust is enabled', () => {
    const req = new NextRequest('https://example.com/api/plans', {
      headers: { 'x-forwarded-for': '203.0.113.10' },
    })

    proxy(req)

    expect(logInfoMock).toHaveBeenCalledWith(
      'http.request',
      expect.objectContaining({ ip: undefined })
    )
  })
})

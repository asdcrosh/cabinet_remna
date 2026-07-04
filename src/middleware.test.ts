import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

import { middleware } from './middleware'
import { logInfo } from '@/lib/logger'

vi.mock('@/lib/logger', () => ({
  isRequestLoggingEnabled: vi.fn(() => true),
  logInfo: vi.fn(),
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

    const res = middleware(req)

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

    const res = middleware(req)
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
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }))

vi.mock('./prisma', () => ({ prisma: { $transaction: mocks.transaction } }))

import { rateLimit } from './rate-limit'

describe('rate limit', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('TRUSTED_PROXY_HEADERS', 'true')
    mocks.transaction.mockReset()
  })

  afterEach(() => vi.unstubAllEnvs())

  it('creates a bucket for the trusted client IP', async () => {
    const tx = {
      rateLimitBucket: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({}),
        update: vi.fn(),
      },
    }
    mocks.transaction.mockImplementation((callback) => callback(tx))
    const request = new Request('https://cabinet.example/api/auth/login', {
      headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.1' },
    })

    await expect(rateLimit(request, 'login', 5, 60_000)).resolves.toEqual({ ok: true, remaining: 4 })
    expect(tx.rateLimitBucket.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: 'login:203.0.113.10' },
    }))
  })

  it('fails closed in production when the proxy does not provide an IP', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const request = new Request('https://cabinet.example/api/auth/login')

    await expect(rateLimit(request, 'login', 5, 60_000)).rejects.toThrow('Client IP is unavailable')
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})

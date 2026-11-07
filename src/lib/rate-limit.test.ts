import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn(), findUnique: vi.fn() }))

vi.mock('./prisma', () => ({ prisma: { $queryRaw: mocks.queryRaw, rateLimitBucket: { findUnique: mocks.findUnique } } }))

import { peekRateLimitKey, rateLimit, rateLimitKey } from './rate-limit'

describe('rate limit', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('TRUSTED_PROXY_HEADERS', 'true')
    mocks.queryRaw.mockReset()
  })

  afterEach(() => vi.unstubAllEnvs())

  it('creates a bucket for the trusted client IP', async () => {
    const resetAt = new Date(Date.now() + 60_000)
    mocks.queryRaw.mockResolvedValue([{ count: 1, resetAt }])
    const request = new Request('https://cabinet.example/api/auth/login', {
      headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.1' },
    })

    await expect(rateLimit(request, 'login', 5, 60_000)).resolves.toEqual({ ok: true, remaining: 4 })
    const [query, ...values] = mocks.queryRaw.mock.calls[0] ?? []
    expect(Array.from(query as TemplateStringsArray).join('?')).toContain('ON CONFLICT ("key") DO UPDATE')
    expect(Array.from(query as TemplateStringsArray).join('?')).toContain('bucket."count" + 1')
    expect(values).toContain('login:203.0.113.10')
  })

  it('limits by key alone without the client IP', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('TRUSTED_PROXY_HEADERS', '')
    const resetAt = new Date(Date.now() + 60_000)
    mocks.queryRaw.mockResolvedValue([{ count: 11, resetAt }])

    await expect(rateLimitKey('auth-login-email:abc', 10, 60_000)).resolves.toMatchObject({ ok: false })
    const [, ...values] = mocks.queryRaw.mock.calls[0] ?? []
    expect(values).toContain('auth-login-email:abc')
  })

  it('peeks a key without spending an attempt', async () => {
    const resetAt = new Date(Date.now() + 60_000)
    mocks.findUnique.mockResolvedValueOnce({ count: 10, resetAt })
    await expect(peekRateLimitKey('k', 10)).resolves.toMatchObject({ ok: false })
    mocks.findUnique.mockResolvedValueOnce({ count: 9, resetAt })
    await expect(peekRateLimitKey('k', 10)).resolves.toEqual({ ok: true, remaining: 1 })
    mocks.findUnique.mockResolvedValueOnce({ count: 50, resetAt: new Date(Date.now() - 1000) })
    await expect(peekRateLimitKey('k', 10)).resolves.toEqual({ ok: true, remaining: 10 })
    mocks.findUnique.mockResolvedValueOnce(null)
    await expect(peekRateLimitKey('k', 10)).resolves.toEqual({ ok: true, remaining: 10 })
    expect(mocks.queryRaw).not.toHaveBeenCalled()
  })

  it('rejects a request based on the count returned by the atomic upsert', async () => {
    const resetAt = new Date(Date.now() + 60_000)
    mocks.queryRaw.mockResolvedValue([{ count: 6, resetAt }])
    const request = new Request('https://cabinet.example/api/auth/login', {
      headers: { 'x-forwarded-for': '203.0.113.10' },
    })

    await expect(rateLimit(request, 'login', 5, 60_000)).resolves.toMatchObject({
      ok: false,
      retryAfter: expect.any(Number),
    })
  })

  it('extends an exceeded bucket when a penalty is configured', async () => {
    const resetAt = new Date(Date.now() + 60_000)
    mocks.queryRaw.mockResolvedValue([{ count: 9, resetAt }])
    const request = new Request('https://cabinet.example/api/bonus-box', {
      headers: { 'x-forwarded-for': '203.0.113.10' },
    })

    await rateLimit(request, 'bonus-box-open:user-1', 8, 60_000, { penaltyMs: 60_000 })

    const [query, ...values] = mocks.queryRaw.mock.calls[0] ?? []
    expect(Array.from(query as TemplateStringsArray).join('?')).toContain('bucket."count" >= ?')
    expect(values).toContain(true)
    expect(values).toContain(8)
  })

  it('fails closed in production when the proxy does not provide an IP', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const request = new Request('https://cabinet.example/api/auth/login')

    await expect(rateLimit(request, 'login', 5, 60_000)).rejects.toThrow('Client IP is unavailable')
    expect(mocks.queryRaw).not.toHaveBeenCalled()
  })

  it('rejects invalid limiter configuration before touching the database', async () => {
    const request = new Request('https://cabinet.example/api/auth/login', {
      headers: { 'x-forwarded-for': '203.0.113.10' },
    })

    await expect(rateLimit(request, 'login', 0, 60_000)).rejects.toThrow('positive integers')
    await expect(rateLimit(request, 'login', 5, 60_000, { penaltyMs: 0 })).rejects.toThrow('positive integer')
    expect(mocks.queryRaw).not.toHaveBeenCalled()
  })
})

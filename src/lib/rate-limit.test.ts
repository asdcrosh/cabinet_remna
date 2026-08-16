import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn() }))

vi.mock('./prisma', () => ({ prisma: { $queryRaw: mocks.queryRaw } }))

import { rateLimit } from './rate-limit'

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
    expect(mocks.queryRaw).not.toHaveBeenCalled()
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertSameOrigin, getClientIp, isIpAllowed } from './security'

describe('security helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    delete process.env.APP_URL
    delete process.env.NEXTAUTH_URL
    delete process.env.ALLOWED_ORIGINS
    delete process.env.TRUSTED_PROXY_HEADERS
  })

  it('allows any ip when allowlist is empty', () => {
    expect(isIpAllowed('203.0.113.10', [])).toBe(true)
  })

  it('matches exact ip entries', () => {
    expect(isIpAllowed('203.0.113.10', ['203.0.113.10'])).toBe(true)
    expect(isIpAllowed('203.0.113.11', ['203.0.113.10'])).toBe(false)
  })

  it('matches ipv4 cidr entries', () => {
    expect(isIpAllowed('10.10.5.20', ['10.10.0.0/16'])).toBe(true)
    expect(isIpAllowed('10.11.5.20', ['10.10.0.0/16'])).toBe(false)
  })

  it('allows mutation origin that matches request url origin', () => {
    process.env.APP_URL = 'http://localhost:3000'

    const req = new Request('http://127.0.0.1:3000/api/admin/promo-codes', {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:3000' },
    })

    expect(() => assertSameOrigin(req)).not.toThrow()
  })

  it('allows mutation origin from forwarded host behind a tunnel', () => {
    process.env.APP_URL = 'http://localhost:3000'
    process.env.TRUSTED_PROXY_HEADERS = 'true'

    const req = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        origin: 'https://demo.ngrok-free.app',
        'x-forwarded-host': 'demo.ngrok-free.app',
        'x-forwarded-proto': 'https',
      },
    })

    expect(() => assertSameOrigin(req)).not.toThrow()
  })

  it('does not trust forwarded origin headers by default', () => {
    process.env.APP_URL = 'http://localhost:3000'

    const req = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        origin: 'https://demo.ngrok-free.app',
        'x-forwarded-host': 'demo.ngrok-free.app',
        'x-forwarded-proto': 'https',
      },
    })

    expect(() => assertSameOrigin(req)).toThrow('Invalid request origin')
  })

  it('rejects a mutation without origin in production', () => {
    vi.stubEnv('NODE_ENV', 'production')

    const req = new Request('https://cabinet.example/api/payment/create', {
      method: 'POST',
    })

    expect(() => assertSameOrigin(req)).toThrow('Invalid request origin')
  })

  it('rejects a cross-site mutation without origin outside production', () => {
    const req = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'sec-fetch-site': 'cross-site' },
    })

    expect(() => assertSameOrigin(req)).toThrow('Invalid request origin')
  })

  it('rejects malformed and null origins', () => {
    for (const origin of ['null', 'not-a-url', 'javascript:alert(1)']) {
      const req = new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { origin },
      })

      expect(() => assertSameOrigin(req)).toThrow('Invalid request origin')
    }
  })

  it('ignores malformed configured origins instead of failing the request', () => {
    process.env.ALLOWED_ORIGINS = 'not-a-url,https://cabinet.example'

    const req = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { origin: 'https://cabinet.example' },
    })

    expect(() => assertSameOrigin(req)).not.toThrow()
  })

  it('rejects invalid forwarded protocols', () => {
    process.env.TRUSTED_PROXY_HEADERS = 'true'

    const req = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        origin: 'https://cabinet.example',
        'x-forwarded-host': 'cabinet.example',
        'x-forwarded-proto': 'javascript',
      },
    })

    expect(() => assertSameOrigin(req)).toThrow('Invalid request origin')
  })

  it('does not trust spoofable client ip headers by default', () => {
    const req = new Request('http://localhost:3000/api/auth/login', {
      headers: { 'x-forwarded-for': '203.0.113.10' },
    })

    expect(getClientIp(req)).toBe('')
  })

  it('reads client ip headers only when trusted proxy headers are enabled', () => {
    process.env.TRUSTED_PROXY_HEADERS = 'true'
    const req = new Request('http://localhost:3000/api/auth/login', {
      headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.1' },
    })

    expect(getClientIp(req)).toBe('203.0.113.10')
  })
})
